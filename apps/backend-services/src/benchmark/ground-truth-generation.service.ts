import { getErrorMessage } from "@ai-di/shared-logging";
import {
  DocumentStatus,
  GroundTruthJobStatus,
  Prisma,
} from "@generated/client";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as path from "path";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobFilePath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { DocumentService } from "@/document/document.service";
import { extensionForOriginalBlob } from "@/document/original-blob-key.util";
import {
  PdfNormalizationError,
  PdfNormalizationService,
} from "@/document/pdf-normalization.service";
import { ReviewDbService } from "@/hitl/review-db.service";
import { ExtractedFields } from "@/ocr/azure-types";
import { OcrService } from "@/ocr/ocr.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import type { GraphWorkflowConfig } from "@/workflow/graph-workflow-types";
import {
  GroundTruthJobResponseDto,
  GroundTruthJobsListResponseDto,
  GroundTruthReviewQueueFilterDto,
  GroundTruthReviewQueueItemDto,
  GroundTruthReviewQueueResponseDto,
  GroundTruthReviewStatsResponseDto,
  StartGroundTruthGenerationResponseDto,
} from "./dto";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";
import { HitlDatasetService } from "./hitl-dataset.service";
import {
  applyWorkflowConfigOverrides,
  validateWorkflowConfigOverrides,
} from "./workflow-config-overrides";

interface ManifestSample {
  id: string;
  inputs: Array<{ path: string; mimeType: string }>;
  groundTruth: Array<{ path: string; format: string }>;
  metadata?: Record<string, unknown>;
}

interface Manifest {
  schemaVersion: string;
  samples: ManifestSample[];
}

const BATCH_SIZE = 10;

@Injectable()
export class GroundTruthGenerationService {
  private readonly logger = new Logger(GroundTruthGenerationService.name);

  constructor(
    private readonly jobDb: GroundTruthJobDbService,
    private readonly documentService: DocumentService,
    private readonly reviewDb: ReviewDbService,
    private readonly ocrService: OcrService,
    private readonly hitlDatasetService: HitlDatasetService,
    private readonly temporalClient: TemporalClientService,
    private readonly pdfNormalization: PdfNormalizationService,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorageInterface,
  ) {}

  /**
   * Start ground truth generation for samples without ground truth in a dataset version.
   * Creates DatasetGroundTruthJob records, then processes them in batches.
   */
  async startGeneration(
    datasetId: string,
    versionId: string,
    workflowVersionId: string,
    _userId: string,
    workflowConfigOverrides?: Record<string, unknown>,
  ): Promise<StartGroundTruthGenerationResponseDto> {
    // Validate version exists and is not frozen
    const version = await this.jobDb.findVersionForValidation(
      versionId,
      datasetId,
    );

    if (!version) {
      throw new NotFoundException(
        `Version ${versionId} not found for dataset ${datasetId}`,
      );
    }

    if (version.frozen) {
      throw new BadRequestException(
        "Cannot generate ground truth for a frozen dataset version",
      );
    }

    if (!version.storagePrefix) {
      throw new BadRequestException(
        "Cannot generate ground truth for a version with no files uploaded",
      );
    }

    // Validate workflow version exists
    const workflowVersion = await this.jobDb.findWorkflow(workflowVersionId);

    if (!workflowVersion) {
      throw new NotFoundException(
        `Workflow version ${workflowVersionId} not found`,
      );
    }

    // Validate workflow config overrides against exposed params, if provided
    const normalizedOverrides =
      workflowConfigOverrides && Object.keys(workflowConfigOverrides).length > 0
        ? workflowConfigOverrides
        : undefined;
    if (normalizedOverrides) {
      const errors = validateWorkflowConfigOverrides(
        workflowVersion.config as unknown as GraphWorkflowConfig,
        normalizedOverrides,
      );
      if (errors.length > 0) {
        throw new BadRequestException(
          `Invalid workflow config overrides: ${errors.join("; ")}`,
        );
      }
    }

    // Load manifest
    const manifest = await this.loadManifest(
      version.storagePrefix,
      workflowVersion.lineage.group_id,
    );

    // Find samples without ground truth
    const samplesWithoutGt = manifest.samples.filter(
      (s) => s.groundTruth.length === 0,
    );

    if (samplesWithoutGt.length === 0) {
      throw new BadRequestException(
        "All samples in this version already have ground truth",
      );
    }

    // Cleanup any non-completed jobs for this version so the user can restart
    // even when previous jobs are stuck. Completed jobs are preserved because
    // their ground truth is already part of the dataset.
    const staleJobs = await this.jobDb.findStaleJobs(versionId);

    if (staleJobs.length > 0) {
      // Best-effort: cancel any temporal workflows still in flight.
      await Promise.all(
        staleJobs
          .filter((j) => j.temporalWorkflowId)
          .map(async (j) => {
            try {
              await this.temporalClient.cancelWorkflow(
                j.temporalWorkflowId!,
                "immediate",
              );
            } catch (err) {
              this.logger.warn(
                `Failed to cancel stale temporal workflow ${j.temporalWorkflowId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }),
      );

      await this.jobDb.deleteJobsByIds(staleJobs.map((j) => j.id));

      this.logger.log(
        `Cleaned up ${staleJobs.length} stale ground truth jobs for version ${versionId}`,
      );
    }

    // Skip samples that already have completed jobs (their GT is in the dataset)
    const completedJobs = await this.jobDb.findCompletedJobSampleIds(versionId);
    const completedSampleIds = new Set(completedJobs.map((j) => j.sampleId));
    const samplesToProcess = samplesWithoutGt.filter(
      (s) => !completedSampleIds.has(s.id),
    );

    if (samplesToProcess.length === 0) {
      throw new BadRequestException(
        "All samples without ground truth already have completed ground truth jobs",
      );
    }

    // Create job records
    const jobs = await this.jobDb.createManyJobs(
      samplesToProcess.map((sample) => ({
        datasetVersionId: versionId,
        sampleId: sample.id,
        workflowVersionId,
        status: GroundTruthJobStatus.pending,
        workflowConfigOverrides: normalizedOverrides
          ? (normalizedOverrides as Prisma.InputJsonValue)
          : Prisma.DbNull,
      })),
    );

    this.logger.log(
      `Created ${jobs.length} ground truth generation jobs for version ${versionId}`,
    );

    // Process jobs in batches (non-blocking)
    this.processJobsInBackground(datasetId, versionId).catch((error) => {
      this.logger.error(
        `Background job processing failed for version ${versionId}: ${error.message}`,
      );
    });

    return {
      jobCount: jobs.length,
      message: `Started ground truth generation for ${jobs.length} samples`,
    };
  }

  /**
   * Process pending jobs in batches.
   */
  private async processJobsInBackground(
    datasetId: string,
    versionId: string,
  ): Promise<void> {
    const version = await this.jobDb.findVersionForProcessing(
      versionId,
      datasetId,
    );

    if (!version?.storagePrefix) return;

    const groupId = version.dataset.group_id;

    const pendingJobs = await this.jobDb.findPendingJobs(versionId);

    // Process in batches
    for (let i = 0; i < pendingJobs.length; i += BATCH_SIZE) {
      const batch = pendingJobs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((job) =>
          this.processJob(
            job.id,
            datasetId,
            versionId,
            version.storagePrefix!,
            groupId,
          ),
        ),
      );
    }
  }

  /**
   * Process a single ground truth generation job:
   * 1. Read input file from dataset storage
   * 2. Create a Document record
   * 3. Copy file to document storage
   * 4. Start the OCR workflow
   */
  private async processJob(
    jobId: string,
    datasetId: string,
    versionId: string,
    storagePrefix: string,
    groupId: string,
  ): Promise<void> {
    const job = await this.jobDb.findJob(jobId);

    if (!job || job.status !== GroundTruthJobStatus.pending) return;

    try {
      // Load manifest to find sample input
      const manifest = await this.loadManifest(storagePrefix, groupId);
      const sample = manifest.samples.find((s) => s.id === job.sampleId);

      if (!sample || sample.inputs.length === 0) {
        throw new Error(
          `Sample ${job.sampleId} not found or has no input files`,
        );
      }

      const inputFile = sample.inputs[0];
      const inputBlobKey = buildBlobFilePath(
        groupId,
        OperationCategory.BENCHMARK,
        [storagePrefix],
        inputFile.path,
      );

      // Read the input file
      const fileBuffer = await this.blobStorage.read(inputBlobKey);

      // Determine file type from MIME
      const fileType = inputFile.mimeType.startsWith("image/")
        ? "image"
        : "pdf";
      const originalFilename = path.basename(inputFile.path);
      const originalExtension = extensionForOriginalBlob(
        originalFilename,
        fileType,
      );

      // Read workflow config and apply per-job overrides (if any)
      const workflowVersion = await this.jobDb.findWorkflowConfig(
        job.workflowVersionId,
      );
      const baseConfig =
        (workflowVersion?.config as unknown as GraphWorkflowConfig) || null;
      const jobOverrides = (job.workflowConfigOverrides ?? null) as Record<
        string,
        unknown
      > | null;
      const effectiveConfig: GraphWorkflowConfig | null =
        baseConfig && jobOverrides && Object.keys(jobOverrides).length > 0
          ? applyWorkflowConfigOverrides(baseConfig, jobOverrides)
          : baseConfig;
      const effectiveConfigCtx = (
        effectiveConfig as unknown as {
          ctx?: Record<string, { defaultValue?: unknown }>;
        } | null
      )?.ctx;
      const modelId =
        (effectiveConfigCtx?.modelId?.defaultValue as string) ||
        "prebuilt-layout";

      const documentId = crypto.randomUUID();
      const docBlobKey = buildBlobFilePath(
        groupId,
        OperationCategory.BENCHMARK,
        ["documents", documentId],
        `original.${originalExtension}`,
      );

      await this.pdfNormalization.validateForUpload(fileBuffer, fileType);

      await this.blobStorage.write(docBlobKey, fileBuffer);

      const normalizedKey = buildBlobFilePath(
        groupId,
        OperationCategory.BENCHMARK,
        ["documents", documentId],
        "normalized.pdf",
      );
      try {
        const pdfBuffer = await this.pdfNormalization.normalizeToPdf(
          fileBuffer,
          fileType,
        );
        await this.blobStorage.write(normalizedKey, pdfBuffer);
      } catch (e) {
        if (e instanceof BadRequestException) {
          throw e;
        }
        if (!(e instanceof PdfNormalizationError)) {
          this.logger.warn(
            `Ground truth job ${jobId}: unexpected normalization error: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
        const errorMessage =
          e instanceof PdfNormalizationError
            ? e.message
            : "Document could not be converted to PDF.";
        const failedDoc = {
          id: documentId,
          title: job.sampleId,
          original_filename: originalFilename,
          file_path: docBlobKey,
          normalized_file_path: null as string | null,
          file_type: fileType,
          file_size: fileBuffer.length,
          metadata: {
            source: "ground-truth-generation",
            datasetId,
            datasetVersionId: versionId,
            sampleId: job.sampleId,
          } as Prisma.JsonValue,
          source: "ground-truth-generation",
          status: DocumentStatus.conversion_failed,
          apim_request_id: null,
          workflow_id: null,
          workflow_config_id: null,
          workflow_execution_id: null,
          model_id: modelId,
          group_id: groupId,
        };
        await this.documentService.createDocument(failedDoc);
        await this.jobDb.updateJob(jobId, {
          documentId,
          status: GroundTruthJobStatus.failed,
          error: errorMessage,
        });
        return;
      }

      // Create document in DB
      const documentData = {
        id: documentId,
        title: job.sampleId,
        original_filename: originalFilename,
        file_path: docBlobKey,
        normalized_file_path: normalizedKey,
        file_type: fileType,
        file_size: fileBuffer.length,
        metadata: {
          source: "ground-truth-generation",
          datasetId,
          datasetVersionId: versionId,
          sampleId: job.sampleId,
        } as Prisma.JsonValue,
        source: "ground-truth-generation",
        status: DocumentStatus.pre_ocr,
        apim_request_id: null,
        workflow_id: null,
        workflow_config_id: job.workflowVersionId,
        workflow_execution_id: null,
        model_id: modelId,
        group_id: groupId,
      };

      await this.documentService.createDocument(documentData);

      // Update job with document ID and set to processing
      await this.jobDb.updateJob(jobId, {
        documentId,
        status: GroundTruthJobStatus.processing,
      });

      // Start OCR workflow with confidenceThreshold=0 to skip humanGate.
      // Pass the override-applied graph so exposed-param overrides take effect.
      const ocrResult = await this.ocrService.requestOcr(
        documentId,
        { confidenceThreshold: 0 },
        effectiveConfig && jobOverrides && Object.keys(jobOverrides).length > 0
          ? effectiveConfig
          : undefined,
      );

      // Update job with temporal workflow ID
      if (ocrResult.workflowId) {
        await this.jobDb.updateJob(jobId, {
          temporalWorkflowId: ocrResult.workflowId,
        });
      }

      if (ocrResult.status === DocumentStatus.failed) {
        throw new Error(ocrResult.error || "OCR workflow failed to start");
      }

      this.logger.debug(
        `Job ${jobId}: started OCR for document ${documentId}, workflow ${ocrResult.workflowId}`,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Job ${jobId} failed: ${message}`);
      await this.jobDb.updateJob(jobId, {
        status: GroundTruthJobStatus.failed,
        error: message,
      });
    }
  }

  /**
   * Get paginated list of ground truth jobs for a dataset version.
   * Lazily transitions jobs from processing → awaiting_review when their document is completed.
   */
  async getJobs(
    datasetId: string,
    versionId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<GroundTruthJobsListResponseDto> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 100);
    const offset = (validPage - 1) * validLimit;

    // Lazy status sync: update processing jobs whose documents have completed OCR
    await this.syncJobStatuses(versionId);

    const [jobs, total] = await Promise.all([
      this.jobDb.findJobs(versionId, datasetId, offset, validLimit),
      this.jobDb.countJobs({
        datasetVersionId: versionId,
        datasetVersion: { datasetId },
      }),
    ]);

    return {
      jobs: jobs.map((j) => this.mapToJobDto(j)),
      total,
      page: validPage,
      limit: validLimit,
    };
  }

  /**
   * Get the dataset-scoped HITL review queue.
   * Returns documents awaiting review in the same shape as the production HITL queue.
   */
  async getReviewQueue(
    datasetId: string,
    versionId: string,
    filters: GroundTruthReviewQueueFilterDto,
  ): Promise<GroundTruthReviewQueueResponseDto> {
    // Lazy status sync first
    await this.syncJobStatuses(versionId);

    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    const statusFilter: GroundTruthJobStatus[] = [];
    if (!filters.reviewStatus || filters.reviewStatus === "pending") {
      statusFilter.push(GroundTruthJobStatus.awaiting_review);
    } else if (filters.reviewStatus === "reviewed") {
      statusFilter.push(GroundTruthJobStatus.completed);
    } else {
      statusFilter.push(
        GroundTruthJobStatus.awaiting_review,
        GroundTruthJobStatus.completed,
      );
    }

    const queueWhere = {
      datasetVersionId: versionId,
      datasetVersion: { datasetId },
      status: { in: statusFilter },
      documentId: { not: null },
    };

    const [jobs, total] = await Promise.all([
      this.jobDb.findJobsForReviewQueue(queueWhere, offset, limit),
      this.jobDb.countJobs(queueWhere),
    ]);

    const documents: GroundTruthReviewQueueItemDto[] = jobs
      .filter((j) => j.document)
      .map((j) => {
        const doc = j.document!;
        const lastSession = doc.review_sessions?.[0];
        return {
          id: doc.id,
          original_filename: doc.original_filename,
          status: doc.status,
          model_id: doc.model_id,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          ocr_result: doc.ocr_result
            ? {
                fields:
                  (doc.ocr_result.keyValuePairs as Record<string, unknown>) ||
                  {},
              }
            : undefined,
          lastSession: lastSession
            ? {
                id: lastSession.id,
                reviewer_id: lastSession.actor_id,
                status: lastSession.status,
                completed_at: lastSession.completed_at,
                corrections_count: lastSession.corrections?.length || 0,
              }
            : undefined,
          sampleId: j.sampleId,
          jobId: j.id,
        };
      });

    return { documents, total };
  }

  /**
   * Get review queue stats for a dataset version.
   */
  async getReviewStats(
    datasetId: string,
    versionId: string,
  ): Promise<GroundTruthReviewStatsResponseDto> {
    await this.syncJobStatuses(versionId);

    const baseWhere = {
      datasetVersionId: versionId,
      datasetVersion: { datasetId },
    };

    const [totalDocuments, awaitingReview, completed, failed] =
      await Promise.all([
        this.jobDb.countJobs(baseWhere),
        this.jobDb.countJobs({
          ...baseWhere,
          status: GroundTruthJobStatus.awaiting_review,
        }),
        this.jobDb.countJobs({
          ...baseWhere,
          status: GroundTruthJobStatus.completed,
        }),
        this.jobDb.countJobs({
          ...baseWhere,
          status: GroundTruthJobStatus.failed,
        }),
      ]);

    return { totalDocuments, awaitingReview, completed, failed };
  }

  /**
   * Complete a ground truth job after HITL approval.
   * Extracts ground truth from OCR + corrections and writes to dataset storage.
   */
  async completeJob(jobId: string, sessionId: string): Promise<void> {
    const job = await this.jobDb.findJobWithVersionAndDocument(jobId);

    if (!job) {
      throw new NotFoundException(`Ground truth job ${jobId} not found`);
    }

    if (!job.document?.ocr_result) {
      throw new BadRequestException(
        `Document for job ${jobId} has no OCR result`,
      );
    }

    // Load the review session with corrections
    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const ocrFields = job.document.ocr_result
      .keyValuePairs as unknown as ExtractedFields | null;
    if (!ocrFields || typeof ocrFields !== "object") {
      throw new BadRequestException("OCR result has no extractable fields");
    }

    // Build ground truth using existing HitlDatasetService logic
    const groundTruth = this.hitlDatasetService.buildGroundTruth(
      ocrFields,
      session.corrections,
    );

    // Write ground truth to dataset storage
    const storagePrefix =
      job.datasetVersion.storagePrefix ||
      `datasets/${job.datasetVersion.datasetId}/${job.datasetVersionId}`;

    const gtBlobKey = buildBlobFilePath(
      job.document.group_id,
      OperationCategory.BENCHMARK,
      [storagePrefix, "ground-truth"],
      `${job.sampleId}.json`,
    );

    await this.blobStorage.write(
      gtBlobKey,
      Buffer.from(JSON.stringify(groundTruth, null, 2)),
    );

    // Update manifest to include ground truth for this sample
    const gtRelativePath = `ground-truth/${job.sampleId}.json`;
    await this.updateManifestWithGroundTruth(
      storagePrefix,
      job.sampleId,
      gtRelativePath,
      job.document.group_id,
    );

    // Update job status
    await this.jobDb.updateJob(jobId, {
      status: GroundTruthJobStatus.completed,
      groundTruthPath: gtBlobKey,
    });

    this.logger.log(
      `Ground truth generated for sample ${job.sampleId} in version ${job.datasetVersionId}`,
    );
  }

  /**
   * Revert a completed ground truth job back to awaiting_review when a session is reopened.
   */
  async reopenJob(jobId: string): Promise<void> {
    await this.jobDb.updateJob(jobId, {
      status: GroundTruthJobStatus.awaiting_review,
      groundTruthPath: null,
    });
    this.logger.log(`Ground truth job ${jobId} reverted to awaiting_review`);
  }

  /**
   * Find a ground truth job by its associated document ID.
   */
  async getJobByDocumentId(documentId: string) {
    return this.jobDb.findJobByDocumentId(documentId);
  }

  // ---- Private helpers ----

  /**
   * Sync job statuses: processing → awaiting_review when document is completed_ocr.
   */
  private async syncJobStatuses(versionId: string): Promise<void> {
    // Sync document-level status transitions (completed_ocr → awaiting_review, failed → failed)
    const processingJobs =
      await this.jobDb.findProcessingJobsWithDocumentStatus(versionId);

    const jobsToUpdate = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.completed_ocr,
    );

    const jobsToFail = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.failed,
    );

    if (jobsToUpdate.length > 0) {
      await this.jobDb.updateManyJobs(
        { id: { in: jobsToUpdate.map((j) => j.id) } },
        { status: GroundTruthJobStatus.awaiting_review },
      );
    }

    if (jobsToFail.length > 0) {
      await this.jobDb.updateManyJobs(
        { id: { in: jobsToFail.map((j) => j.id) } },
        { status: GroundTruthJobStatus.failed, error: "OCR processing failed" },
      );
    }

    // Detect dead temporal workflows whose document never reached a terminal
    // state (e.g. azure model 404 → workflow exits FAILED but the document
    // row stays in ongoing_ocr, leaving the job stuck in "processing").
    const stillProcessing = processingJobs.filter(
      (j) =>
        j.temporalWorkflowId &&
        !jobsToUpdate.includes(j) &&
        !jobsToFail.includes(j),
    );
    for (const job of stillProcessing) {
      try {
        const wfStatus = await this.temporalClient.getWorkflowStatus(
          job.temporalWorkflowId!,
        );
        const terminal = ["FAILED", "TERMINATED", "CANCELLED", "TIMED_OUT"];
        if (terminal.includes(wfStatus.status)) {
          await this.jobDb.updateJob(job.id, {
            status: GroundTruthJobStatus.failed,
            error: `Temporal workflow ended in state ${wfStatus.status}`,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to check temporal workflow status for job ${job.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Load and parse manifest from blob storage.
   */
  private async loadManifest(
    storagePrefix: string,
    groupId: string,
  ): Promise<Manifest> {
    const manifestKey = buildBlobFilePath(
      groupId,
      OperationCategory.BENCHMARK,
      [storagePrefix],
      "dataset-manifest.json",
    );
    try {
      const buffer = await this.blobStorage.read(manifestKey);
      return JSON.parse(buffer.toString("utf-8"));
    } catch {
      throw new NotFoundException(`Manifest not found at ${manifestKey}`);
    }
  }

  /**
   * Update the manifest to add ground truth for a sample.
   */
  private async updateManifestWithGroundTruth(
    storagePrefix: string,
    sampleId: string,
    gtRelativePath: string,
    groupId: string,
  ): Promise<void> {
    const manifestKey = buildBlobFilePath(
      groupId,
      OperationCategory.BENCHMARK,
      [storagePrefix],
      "dataset-manifest.json",
    );
    const buffer = await this.blobStorage.read(manifestKey);
    const manifest: Manifest = JSON.parse(buffer.toString("utf-8"));

    const sample = manifest.samples.find((s) => s.id === sampleId);
    if (sample) {
      // Replace or add ground truth entry
      sample.groundTruth = [{ path: gtRelativePath, format: "json" }];
      sample.metadata = {
        ...sample.metadata,
        groundTruthSource: "hitl-generation",
      };
    }

    await this.blobStorage.write(
      manifestKey,
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );
  }

  private mapToJobDto(job: {
    id: string;
    datasetVersionId: string;
    sampleId: string;
    documentId: string | null;
    workflowVersionId: string;
    temporalWorkflowId: string | null;
    status: GroundTruthJobStatus;
    groundTruthPath: string | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): GroundTruthJobResponseDto {
    return {
      id: job.id,
      datasetVersionId: job.datasetVersionId,
      sampleId: job.sampleId,
      documentId: job.documentId,
      workflowVersionId: job.workflowVersionId,
      temporalWorkflowId: job.temporalWorkflowId,
      status: job.status,
      groundTruthPath: job.groundTruthPath,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
