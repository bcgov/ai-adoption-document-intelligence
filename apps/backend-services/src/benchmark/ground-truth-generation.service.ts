import {
  DocumentStatus,
  FieldCorrection,
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
import { ExtractedFields } from "@/ocr/azure-types";
import { OcrService } from "@/ocr/ocr.service";
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
    private readonly groundTruthJobDbService: GroundTruthJobDbService,
    private readonly documentService: DocumentService,
    private readonly ocrService: OcrService,
    private readonly hitlDatasetService: HitlDatasetService,
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
    workflowConfigId: string,
  ): Promise<StartGroundTruthGenerationResponseDto> {
    // Validate version exists and is not frozen
    const version = await this.groundTruthJobDbService.findVersionForValidation(
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

    // Validate workflow config exists
    const workflow =
      await this.groundTruthJobDbService.findWorkflow(workflowConfigId);

    if (!workflow) {
      throw new NotFoundException(
        `Workflow configuration ${workflowConfigId} not found`,
      );
    }

    // Load manifest
    const manifest = await this.loadManifest(
      version.storagePrefix,
      workflow.group_id,
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

    // Check for existing jobs that haven't failed
    const existingJobs =
      await this.groundTruthJobDbService.findExistingJobs(versionId);
    const existingJobSampleIds = new Set(existingJobs.map((j) => j.sampleId));

    // Only create jobs for samples that don't already have a non-failed job
    const samplesToProcess = samplesWithoutGt.filter(
      (s) => !existingJobSampleIds.has(s.id),
    );

    if (samplesToProcess.length === 0) {
      throw new BadRequestException(
        "All samples without ground truth already have pending or in-progress jobs",
      );
    }

    // Create job records
    const jobs = await this.groundTruthJobDbService.createManyJobs(
      samplesToProcess.map((sample) => ({
        datasetVersionId: versionId,
        sampleId: sample.id,
        workflowConfigId,
        status: GroundTruthJobStatus.pending,
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
    const version = await this.groundTruthJobDbService.findVersionForProcessing(
      versionId,
      datasetId,
    );

    if (!version?.storagePrefix) return;

    const groupId = version.dataset.group_id;

    const pendingJobs =
      await this.groundTruthJobDbService.findPendingJobs(versionId);

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
    const job = await this.groundTruthJobDbService.findJob(jobId);

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

      // Read modelId from workflow config ctx defaults
      const workflow = await this.groundTruthJobDbService.findWorkflowConfig(
        job.workflowConfigId,
      );
      const workflowConfig = workflow?.config as {
        ctx?: Record<string, { defaultValue?: unknown }>;
      } | null;
      const modelId =
        (workflowConfig?.ctx?.modelId?.defaultValue as string) ||
        "prebuilt-layout";

      const documentId = crypto.randomUUID();
      const docBlobKey = buildBlobFilePath(
        groupId,
        OperationCategory.BENCHMARK,
        ["documents", documentId],
        `original${originalExtension}`,
      );

      await this.pdfNormalization.validateForUpload(fileBuffer, fileType);

      await this.blobStorage.write(docBlobKey, fileBuffer);

      const normalizedKey = `documents/${documentId}/normalized.pdf`;
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
          workflow_config_id: job.workflowConfigId,
          workflow_execution_id: null,
          model_id: modelId,
          group_id: groupId,
        };
        await this.documentService.createDocument(failedDoc);
        await this.groundTruthJobDbService.updateJob(jobId, {
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
        workflow_config_id: job.workflowConfigId,
        workflow_execution_id: null,
        model_id: modelId,
        group_id: groupId,
      };

      await this.documentService.createDocument(documentData);

      // Update job with document ID and set to processing
      await this.groundTruthJobDbService.updateJob(jobId, {
        documentId,
        status: GroundTruthJobStatus.processing,
      });

      // Start OCR workflow with confidenceThreshold=0 to skip humanGate
      const ocrResult = await this.ocrService.requestOcr(documentId, {
        confidenceThreshold: 0,
      });

      // Update job with temporal workflow ID
      if (ocrResult.workflowId) {
        await this.groundTruthJobDbService.updateJob(jobId, {
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${jobId} failed: ${message}`);
      await this.groundTruthJobDbService.updateJob(jobId, {
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
      this.groundTruthJobDbService.findJobs(
        versionId,
        datasetId,
        offset,
        validLimit,
      ),
      this.groundTruthJobDbService.countJobs({
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

    const where: Prisma.DatasetGroundTruthJobWhereInput = {
      datasetVersionId: versionId,
      datasetVersion: { datasetId },
      status: { in: statusFilter },
      documentId: { not: null },
    };
    const jobs = await this.groundTruthJobDbService.findJobsForReviewQueue(
      where,
      offset,
      limit,
    );

    const total = await this.groundTruthJobDbService.countJobs(where);

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

    const [totalDocuments, awaitingReview, completed, failed] =
      await Promise.all([
        this.groundTruthJobDbService.countJobs({
          datasetVersionId: versionId,
          datasetVersion: { datasetId },
        }),
        this.groundTruthJobDbService.countJobs({
          datasetVersionId: versionId,
          datasetVersion: { datasetId },
          status: GroundTruthJobStatus.awaiting_review,
        }),
        this.groundTruthJobDbService.countJobs({
          datasetVersionId: versionId,
          datasetVersion: { datasetId },
          status: GroundTruthJobStatus.completed,
        }),
        this.groundTruthJobDbService.countJobs({
          datasetVersionId: versionId,
          datasetVersion: { datasetId },
          status: GroundTruthJobStatus.failed,
        }),
      ]);

    return { totalDocuments, awaitingReview, completed, failed };
  }

  /**
   * Complete a ground truth job after HITL approval.
   * Extracts ground truth from OCR + corrections and writes to dataset storage.
   */
  async completeJob(
    jobId: string,
    sessionId: string,
    corrections: FieldCorrection[],
  ): Promise<void> {
    const job =
      await this.groundTruthJobDbService.findJobWithVersionAndDocument(jobId);

    if (!job) {
      throw new NotFoundException(`Ground truth job ${jobId} not found`);
    }

    if (!job.document?.ocr_result) {
      throw new BadRequestException(
        `Document for job ${jobId} has no OCR result`,
      );
    }

    const ocrFields = job.document.ocr_result
      .keyValuePairs as unknown as ExtractedFields | null;
    if (!ocrFields || typeof ocrFields !== "object") {
      throw new BadRequestException("OCR result has no extractable fields");
    }

    // Build ground truth using existing HitlDatasetService logic
    const groundTruth = this.hitlDatasetService.buildGroundTruth(
      ocrFields,
      corrections,
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
    await this.groundTruthJobDbService.updateJob(jobId, {
      status: GroundTruthJobStatus.completed,
      groundTruthPath: gtBlobKey,
    });

    this.logger.log(
      `Ground truth generated for sample ${job.sampleId} in version ${job.datasetVersionId}`,
    );
  }

  /**
   * Find a ground truth job by its associated document ID.
   */
  async getJobByDocumentId(documentId: string) {
    return this.groundTruthJobDbService.findJobByDocumentId(documentId);
  }

  // ---- Private helpers ----

  /**
   * Sync job statuses: processing → awaiting_review when document is completed_ocr.
   */
  private async syncJobStatuses(versionId: string): Promise<void> {
    await this.groundTruthJobDbService.syncProcessingJobStatuses(versionId);
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
    workflowConfigId: string;
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
      workflowConfigId: job.workflowConfigId,
      temporalWorkflowId: job.temporalWorkflowId,
      status: job.status,
      groundTruthPath: job.groundTruthPath,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
