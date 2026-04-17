import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus } from "@generated/client";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "@/audit/audit.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { validateBlobFilePath } from "@/blob-storage/storage-path-builder";
import { DocumentService } from "@/document/document.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import type { GraphWorkflowConfig } from "@/workflow/graph-workflow-types";

export interface OcrRequestResponse {
  status: DocumentStatus;
  workflowId?: string;
  apimRequestId?: string;
  error?: string; // Error message as string for serialization
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
    graphOverride?: GraphWorkflowConfig,
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

      const initialCtx: Record<string, unknown> = {
        documentId,
        blobKey: document.normalized_file_path,
        fileName: "normalized.pdf",
        fileType,
        contentType,
        modelId,
        ...ctxOverrides, // Allows callers to inject or override workflow context values (e.g., confidenceThreshold: 0 to skip human review)
      };

      // Start Temporal graph workflow
      const workflowExecutionId =
        await this.temporalClientService.startGraphWorkflow(
          documentId,
          workflowConfigId,
          initialCtx,
          graphOverride,
        );

      // Update document with workflow configuration ID and Temporal workflow execution ID
      // Note: Status is set automatically by workflow pre-execution hook
      const updateResult = await this.documentService.updateDocument(
        documentId,
        {
          workflow_config_id: workflowConfigId || undefined,
          workflow_execution_id: workflowExecutionId,
        },
      );

      await this.auditService.recordEvent({
        event_type: "workflow_run_started",
        resource_type: "workflow_run",
        resource_id: workflowExecutionId,
        document_id: documentId,
        workflow_execution_id: workflowExecutionId,
        group_id: document.group_id,
        payload: {
          workflow_config_id: workflowConfigId ?? undefined,
        },
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
      this.logger.error(`Error processing document: ${getErrorMessage(error)}`);
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      if (document != null) {
        await this.documentService.updateDocument(documentId, {
          status: DocumentStatus.failed,
        });
      }

      // Ensure error is a string for the response
      const errorMessage = getErrorMessage(error);
      return {
        status: DocumentStatus.failed,
        error: errorMessage,
      };
    }
  }
}
