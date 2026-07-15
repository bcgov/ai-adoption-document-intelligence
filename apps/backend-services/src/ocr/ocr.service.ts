import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "@/audit/audit.service";
import { PreflightCapCheckService } from "@/billing/preflight-cap-check.service";
import { PreflightCostEstimatorService } from "@/billing/preflight-cost-estimator.service";
import { UsageEventService } from "@/billing/usage-event.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { validateBlobFilePath } from "@/blob-storage/storage-path-builder";
import { PrismaService } from "@/database/prisma.service";
import {
  type DocumentData,
  DocumentService,
} from "@/document/document.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { WorkflowService } from "@/workflow/workflow.service";

export interface OcrRequestResponse {
  status: DocumentStatus;
  workflowId?: string;
  apimRequestId?: string;
  error?: string; // Error message as string for serialization
}

function readTemplateModelIdFromDocumentMetadata(
  metadata: unknown,
): string | undefined {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }
  const raw = (metadata as Record<string, unknown>).templateModelId;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

@Injectable()
export class OcrService {
  constructor(
    _configService: ConfigService,
    private documentService: DocumentService,
    private temporalClientService: TemporalClientService,
    @Inject(BLOB_STORAGE)
    private blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
    private readonly workflowService: WorkflowService,
    private readonly preflightCostEstimatorService: PreflightCostEstimatorService,
    private readonly preflightCapCheckService: PreflightCapCheckService,
    private readonly usageEventService: UsageEventService,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Sends a document to Azure for OCR processing via Temporal workflow.
   * @param documentId ID from documents table
   * @param steps Optional workflow steps configuration
   * @returns New status of document and workflow ID.
   */
  async requestOcr(
    documentId: string,
    ctxOverrides?: Record<string, unknown>,
    workflowConfigOverrides?: Record<string, unknown>,
  ): Promise<OcrRequestResponse> {
    this.logger.debug(`Document ID: ${documentId || "N/A"}`);
    // Find filepath of document
    const document = await this.documentService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`,
      );
    }
    try {
      if (!document.normalized_file_path) {
        throw new BadRequestException(
          `Document ${documentId} has no normalized PDF; cannot start OCR.`,
        );
      }

      const fileBuffer = await this.blobStorage.read(
        validateBlobFilePath(document.normalized_file_path),
      );
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Get model_id from document
      const modelId = document.model_id;
      this.logger.debug(`Document model_id: ${modelId}`);

      const fileType = "pdf";
      const contentType = "application/pdf";

      // Get workflow_config_id from document if available
      // This references the Workflow table and contains the workflow configuration
      // Fallback to legacy workflow_id for backward compatibility during migration
      const workflowConfigId = document.workflow_config_id || undefined;
      if (workflowConfigId) {
        this.logger.log(
          `Document ${documentId} has workflow configuration ID: ${workflowConfigId}`,
        );
      } else {
        throw new BadRequestException(
          `Document ${documentId} missing workflow configuration ID`,
        );
      }

      const templateModelId = readTemplateModelIdFromDocumentMetadata(
        document.metadata,
      );

      const initialCtx: Record<string, unknown> = {
        documentId,
        groupId: document.group_id,
        blobKey: document.normalized_file_path,
        fileName: "normalized.pdf",
        fileType,
        contentType,
        modelId,
        // System metadata about the document. Populated here so workflow
        // authors can bind generic per-document values via the `doc.*`
        // ref namespace (e.g. `doc.receivedAt`) without coupling to any
        // specific OCR-output shape or extracted field.
        documentMetadata: {
          receivedAt: document.created_at.toISOString(),
        },
        ...(templateModelId !== undefined && { templateModelId }),
        ...ctxOverrides, // Allows callers to inject or override workflow context values (e.g., confidenceThreshold, templateModelId)
      };

      // Pre-flight cost estimation and cap check
      const workflowConfig =
        await this.workflowService.getWorkflowVersionById(workflowConfigId);
      if (!workflowConfig) {
        throw new BadRequestException(
          `Workflow configuration not found: ${workflowConfigId}`,
        );
      }

      const costEstimation =
        await this.preflightCostEstimatorService.estimateWorkflowCost(
          workflowConfig.config,
        );

      if (document.group_id) {
        try {
          await this.preflightCapCheckService.checkCap(
            document.group_id,
            costEstimation.estimatedUnits,
            costEstimation.unitCostDollars,
          );
        } catch (e) {
          // Cap check throws if a cap was reached.
          // We'll mark document as failed and re-throw the error
          this.documentService.updateDocument(document.id, {
            status: DocumentStatus.failed,
          });
          throw e;
        }
      }

      // Start Temporal graph workflow
      const workflowExecutionId =
        await this.temporalClientService.startGraphWorkflow(
          documentId,
          workflowConfigId,
          initialCtx,
          document.group_id,
          workflowConfigOverrides,
        );

      // Record workflow_started lifecycle event (does not update UsagePeriodSummary)
      if (costEstimation.rateVersionId && document.group_id) {
        try {
          await this.usageEventService.recordUsageEvent({
            event_type: "workflow_cost",
            group_id: document.group_id,
            rate_version_id: costEstimation.rateVersionId,
            unit_cost_dollars: costEstimation.unitCostDollars,
            units_consumed: 0,
            workflow_version_id: workflowConfigId,
            workflow_execution_id: workflowExecutionId,
            estimated_units: costEstimation.estimatedUnits,
            skipSummaryUpdate: true,
          });
        } catch (billingError) {
          this.logger.warn(
            `Failed to record workflow_cost event for ${workflowExecutionId}: ${getErrorMessage(billingError)}`,
          );
        }
      }

      // Update document with workflow execution ID (Temporal start is external).
      const updateResult = await this.prismaService.transaction(async (tx) => {
        const updated = await this.documentService.updateDocument(
          documentId,
          {
            workflow_config_id: workflowConfigId || undefined,
            workflow_execution_id: workflowExecutionId,
          },
          tx,
        );

        await this.auditService.recordEvent(
          {
            event_type: "workflow_run_started",
            resource_type: "workflow_run",
            resource_id: workflowExecutionId,
            document_id: documentId,
            workflow_execution_id: workflowExecutionId,
            group_id: document.group_id,
            payload: {
              workflow_config_id: workflowConfigId ?? undefined,
            },
          },
          tx,
        );

        return updated;
      });

      this.logger.log(
        `Started OCR workflow for document ${documentId}, Temporal execution ID: ${workflowExecutionId}${workflowConfigId ? `, using workflow config: ${workflowConfigId}` : ", using default workflow"}`,
      );

      // Return the workflow execution ID
      // Status is set by workflow pre-execution hook
      return {
        apimRequestId:
          updateResult?.workflow_execution_id || workflowExecutionId,
        workflowId: workflowExecutionId,
        status: DocumentStatus.ongoing_ocr,
      };
    } catch (error) {
      // Re-throw HTTP exceptions (e.g. HTTP 402 from cap check) without
      // updating document status — the workflow was never submitted.
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error processing document: ${getErrorMessage(error)}`);
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      await this.documentService.updateDocument(documentId, {
        status: DocumentStatus.failed,
      });

      // Ensure error is a string for the response
      const errorMessage = getErrorMessage(error);
      return {
        status: DocumentStatus.failed,
        error: errorMessage,
      };
    }
  }

  /**
   * Re-runs a document's workflow from the beginning using its existing
   * normalized PDF. Intended for retrying a broken or stuck run (and, looped
   * over IDs, for clearing stuck backlogs).
   *
   * Only `failed` or stuck `ongoing_ocr` documents are eligible. Each guard
   * failure throws {@link ConflictException} (409) with a specific message:
   * wrong state, missing/purged source, in-flight, or no workflow config.
   * On success it delegates to {@link requestOcr}, which starts `graph-<id>`
   * (Temporal's default `ALLOW_DUPLICATE` reuse permits a new run because the
   * prior run is closed) and sets the document back to `ongoing_ocr`.
   *
   * Group authorization is the caller's responsibility (done in the controller).
   */
  async reprocessDocument(document: DocumentData): Promise<{
    workflowExecutionId: string;
    status: DocumentStatus;
  }> {
    if (
      document.status !== DocumentStatus.failed &&
      document.status !== DocumentStatus.ongoing_ocr
    ) {
      throw new ConflictException(
        `Document ${document.id} is not in a re-runnable state (status: ${document.status}). Only failed or stuck (ongoing_ocr) documents can be re-run.`,
      );
    }

    if (!document.workflow_config_id) {
      throw new ConflictException(
        `Document ${document.id} has no workflow configuration and cannot be re-run.`,
      );
    }

    if (document.purged_at || !document.normalized_file_path) {
      throw new ConflictException(
        `Document ${document.id} has no normalized PDF available (conversion may have failed, or its files were cleaned up). Re-upload the document.`,
      );
    }

    const normalizedKey = validateBlobFilePath(document.normalized_file_path);
    const sourceExists = await this.blobStorage.exists(normalizedKey);
    if (!sourceExists) {
      throw new ConflictException(
        `Document ${document.id}'s source file is no longer in storage. Re-upload the document.`,
      );
    }

    const workflowExecutionId = `graph-${document.id}`;
    const alreadyRunning =
      await this.temporalClientService.isWorkflowRunning(workflowExecutionId);
    if (alreadyRunning) {
      throw new ConflictException(
        `Document ${document.id} is already being processed.`,
      );
    }

    const result = await this.requestOcr(document.id);
    if (result.error || !result.workflowId) {
      throw new ConflictException(
        `Failed to start re-run for document ${document.id}: ${result.error ?? "unknown error"}`,
      );
    }

    return { workflowExecutionId: result.workflowId, status: result.status };
  }
}
