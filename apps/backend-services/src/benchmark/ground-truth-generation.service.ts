import {
  DocumentStatus,
  GroundTruthJobStatus,
  Prisma,
  ReviewStatus,
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
import { DatabaseService } from "@/database/database.service";
import { PrismaService } from "@/database/prisma.service";
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
    private readonly prismaService: PrismaService,
    private readonly db: DatabaseService,
    private readonly ocrService: OcrService,
    private readonly hitlDatasetService: HitlDatasetService,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorageInterface,
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Start ground truth generation for samples without ground truth in a dataset version.
   * Creates DatasetGroundTruthJob records, then processes them in batches.
   */
  async startGeneration(
    datasetId: string,
    versionId: string,
    workflowConfigId: string,
    userId: string,
  ): Promise<StartGroundTruthGenerationResponseDto> {
    // Validate version exists and is not frozen
    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });

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
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowConfigId },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow configuration ${workflowConfigId} not found`,
      );
    }

    // Load manifest
    const manifest = await this.loadManifest(version.storagePrefix);

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
    const existingJobs = await this.prisma.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: { not: GroundTruthJobStatus.failed },
      },
      select: { sampleId: true },
    });
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
    const jobs = await this.prisma.$transaction(
      samplesToProcess.map((sample) =>
        this.prisma.datasetGroundTruthJob.create({
          data: {
            datasetVersionId: versionId,
            sampleId: sample.id,
            workflowConfigId,
            status: GroundTruthJobStatus.pending,
          },
        }),
      ),
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
    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      include: { dataset: { select: { group_id: true } } },
    });

    if (!version?.storagePrefix) return;

    const groupId = version.dataset.group_id;

    const pendingJobs = await this.prisma.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: GroundTruthJobStatus.pending,
      },
      orderBy: { createdAt: "asc" },
    });

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
    const job = await this.prisma.datasetGroundTruthJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== GroundTruthJobStatus.pending) return;

    try {
      // Load manifest to find sample input
      const manifest = await this.loadManifest(storagePrefix);
      const sample = manifest.samples.find((s) => s.id === job.sampleId);

      if (!sample || sample.inputs.length === 0) {
        throw new Error(
          `Sample ${job.sampleId} not found or has no input files`,
        );
      }

      const inputFile = sample.inputs[0];
      const inputBlobKey = `${storagePrefix}/${inputFile.path}`;

      // Read the input file
      const fileBuffer = await this.blobStorage.read(inputBlobKey);

      // Determine file type from MIME
      const fileType = inputFile.mimeType.startsWith("image/")
        ? "image"
        : "pdf";
      const originalFilename = path.basename(inputFile.path);
      const ext = path.extname(originalFilename);

      // Read modelId from workflow config ctx defaults
      const workflow = await this.prisma.workflow.findUnique({
        where: { id: job.workflowConfigId },
        select: { config: true },
      });
      const workflowConfig = workflow?.config as {
        ctx?: Record<string, { defaultValue?: unknown }>;
      } | null;
      const modelId =
        (workflowConfig?.ctx?.modelId?.defaultValue as string) ||
        "prebuilt-layout";

      // Create document record
      const documentId = crypto.randomUUID();
      const docBlobKey = `documents/${documentId}/original${ext}`;

      // Write file to document storage
      await this.blobStorage.write(docBlobKey, fileBuffer);

      // Create document in DB
      const documentData = {
        id: documentId,
        title: job.sampleId,
        original_filename: originalFilename,
        file_path: docBlobKey,
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

      await this.db.createDocument(documentData);

      // Update job with document ID and set to processing
      await this.prisma.datasetGroundTruthJob.update({
        where: { id: jobId },
        data: {
          documentId,
          status: GroundTruthJobStatus.processing,
        },
      });

      // Start OCR workflow with confidenceThreshold=0 to skip humanGate
      const ocrResult = await this.ocrService.requestOcr(documentId, {
        confidenceThreshold: 0,
      });

      // Update job with temporal workflow ID
      if (ocrResult.workflowId) {
        await this.prisma.datasetGroundTruthJob.update({
          where: { id: jobId },
          data: { temporalWorkflowId: ocrResult.workflowId },
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
      await this.prisma.datasetGroundTruthJob.update({
        where: { id: jobId },
        data: {
          status: GroundTruthJobStatus.failed,
          error: message,
        },
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
      this.prisma.datasetGroundTruthJob.findMany({
        where: { datasetVersionId: versionId, datasetVersion: { datasetId } },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: validLimit,
      }),
      this.prisma.datasetGroundTruthJob.count({
        where: { datasetVersionId: versionId, datasetVersion: { datasetId } },
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

    const jobs = await this.prisma.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        datasetVersion: { datasetId },
        status: { in: statusFilter },
        documentId: { not: null },
      },
      include: {
        document: {
          include: {
            ocr_result: true,
            review_sessions: {
              where: {
                status: {
                  in: [
                    ReviewStatus.approved,
                    ReviewStatus.escalated,
                    ReviewStatus.skipped,
                  ],
                },
              },
              include: { corrections: true },
              orderBy: { completed_at: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    });

    const total = await this.prisma.datasetGroundTruthJob.count({
      where: {
        datasetVersionId: versionId,
        datasetVersion: { datasetId },
        status: { in: statusFilter },
        documentId: { not: null },
      },
    });

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
                reviewer_id: lastSession.reviewer_id,
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
        this.prisma.datasetGroundTruthJob.count({
          where: { datasetVersionId: versionId, datasetVersion: { datasetId } },
        }),
        this.prisma.datasetGroundTruthJob.count({
          where: {
            datasetVersionId: versionId,
            datasetVersion: { datasetId },
            status: GroundTruthJobStatus.awaiting_review,
          },
        }),
        this.prisma.datasetGroundTruthJob.count({
          where: {
            datasetVersionId: versionId,
            datasetVersion: { datasetId },
            status: GroundTruthJobStatus.completed,
          },
        }),
        this.prisma.datasetGroundTruthJob.count({
          where: {
            datasetVersionId: versionId,
            datasetVersion: { datasetId },
            status: GroundTruthJobStatus.failed,
          },
        }),
      ]);

    return { totalDocuments, awaitingReview, completed, failed };
  }

  /**
   * Complete a ground truth job after HITL approval.
   * Extracts ground truth from OCR + corrections and writes to dataset storage.
   */
  async completeJob(jobId: string, sessionId: string): Promise<void> {
    const job = await this.prisma.datasetGroundTruthJob.findUnique({
      where: { id: jobId },
      include: {
        datasetVersion: true,
        document: {
          include: { ocr_result: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Ground truth job ${jobId} not found`);
    }

    if (!job.document?.ocr_result) {
      throw new BadRequestException(
        `Document for job ${jobId} has no OCR result`,
      );
    }

    // Load the review session with corrections
    const session = await this.db.findReviewSession(sessionId);
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

    const gtRelativePath = `ground-truth/${job.sampleId}.json`;
    const gtBlobKey = `${storagePrefix}/${gtRelativePath}`;

    await this.blobStorage.write(
      gtBlobKey,
      Buffer.from(JSON.stringify(groundTruth, null, 2)),
    );

    // Update manifest to include ground truth for this sample
    await this.updateManifestWithGroundTruth(
      storagePrefix,
      job.sampleId,
      gtRelativePath,
    );

    // Update job status
    await this.prisma.datasetGroundTruthJob.update({
      where: { id: jobId },
      data: {
        status: GroundTruthJobStatus.completed,
        groundTruthPath: gtBlobKey,
      },
    });

    this.logger.log(
      `Ground truth generated for sample ${job.sampleId} in version ${job.datasetVersionId}`,
    );
  }

  /**
   * Find a ground truth job by its associated document ID.
   */
  async getJobByDocumentId(documentId: string) {
    return this.prisma.datasetGroundTruthJob.findUnique({
      where: { documentId },
    });
  }

  // ---- Private helpers ----

  /**
   * Sync job statuses: processing → awaiting_review when document is completed_ocr.
   */
  private async syncJobStatuses(versionId: string): Promise<void> {
    const processingJobs = await this.prisma.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: GroundTruthJobStatus.processing,
        documentId: { not: null },
      },
      include: {
        document: { select: { status: true } },
      },
    });

    const jobsToUpdate = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.completed_ocr,
    );

    const jobsToFail = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.failed,
    );

    if (jobsToUpdate.length > 0) {
      await this.prisma.datasetGroundTruthJob.updateMany({
        where: { id: { in: jobsToUpdate.map((j) => j.id) } },
        data: { status: GroundTruthJobStatus.awaiting_review },
      });
    }

    if (jobsToFail.length > 0) {
      await this.prisma.datasetGroundTruthJob.updateMany({
        where: { id: { in: jobsToFail.map((j) => j.id) } },
        data: {
          status: GroundTruthJobStatus.failed,
          error: "OCR processing failed",
        },
      });
    }
  }

  /**
   * Load and parse manifest from blob storage.
   */
  private async loadManifest(storagePrefix: string): Promise<Manifest> {
    const manifestKey = `${storagePrefix}/dataset-manifest.json`;
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
  ): Promise<void> {
    const manifestKey = `${storagePrefix}/dataset-manifest.json`;
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
