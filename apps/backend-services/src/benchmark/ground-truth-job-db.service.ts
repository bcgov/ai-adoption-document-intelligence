import {
  DatasetGroundTruthJob,
  DocumentStatus,
  GroundTruthJobStatus,
  Prisma,
  PrismaClient,
  ReviewStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

type JobWithDocumentStatus = Prisma.DatasetGroundTruthJobGetPayload<{
  include: { document: { select: { status: true } } };
}>;

type JobWithDocumentAndReview = Prisma.DatasetGroundTruthJobGetPayload<{
  include: {
    document: {
      include: {
        ocr_result: true;
        review_sessions: {
          where: {
            status: {
              in: [ReviewStatus, ReviewStatus, ReviewStatus, ReviewStatus];
            };
          };
          include: { corrections: true };
          orderBy: { started_at: "desc" };
          take: 1;
        };
      };
    };
  };
}>;

type JobWithVersionAndDocument = Prisma.DatasetGroundTruthJobGetPayload<{
  include: {
    datasetVersion: true;
    document: {
      include: { ocr_result: true };
    };
  };
}>;

/** Programmatic job creates always set an explicit status (never rely on DB default). */
export type CreateGroundTruthJobData = Pick<
  Prisma.DatasetGroundTruthJobUncheckedCreateInput,
  | "datasetVersionId"
  | "sampleId"
  | "workflowVersionId"
  | "status"
  | "workflowConfigOverrides"
>;

@Injectable()
export class GroundTruthJobDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Finds existing non-failed ground truth jobs for a version, returning only sampleId.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   * @returns Array of objects with sampleId.
   */
  async findExistingJobs(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ sampleId: string }>> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: { not: GroundTruthJobStatus.failed },
      },
      select: { sampleId: true },
    });
  }

  /**
   * Creates multiple ground truth jobs in a single transaction.
   *
   * @param jobsData - Array of job creation data.
   * @param tx - Optional transaction client.
   * @returns Array of created DatasetGroundTruthJob records.
   */
  async createManyJobs(
    jobsData: CreateGroundTruthJobData[],
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob[]> {
    if (tx) {
      return Promise.all(
        jobsData.map((data) => tx.datasetGroundTruthJob.create({ data })),
      );
    }
    return this.prisma.$transaction(
      jobsData.map((data) =>
        this.prisma.datasetGroundTruthJob.create({ data }),
      ),
    );
  }

  /**
   * Finds a dataset version with its dataset group_id, for background job processing.
   *
   * @param versionId - The version ID.
   * @param datasetId - The dataset ID.
   * @param tx - Optional transaction client.
   */
  async findVersionForProcessing(
    versionId: string,
    datasetId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      include: { dataset: { select: { group_id: true } } },
    });
  }

  /**
   * Finds all pending ground truth jobs for a version, ordered oldest first.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   * @returns Array of DatasetGroundTruthJob records.
   */
  async findPendingJobs(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob[]> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: GroundTruthJobStatus.pending,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Finds a single ground truth job by ID.
   *
   * @param jobId - The job ID.
   * @param tx - Optional transaction client.
   * @returns The job, or `null` if not found.
   */
  async findJob(
    jobId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob | null> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findUnique({ where: { id: jobId } });
  }

  /**
   * Finds a ground truth job by its associated document ID.
   *
   * @param documentId - The document ID.
   * @param tx - Optional transaction client.
   * @returns The job, or `null` if not found.
   */
  async findJobByDocumentId(
    documentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob | null> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findUnique({ where: { documentId } });
  }

  /**
   * Finds a job with its version and document+OCR data (used in completeJob).
   *
   * @param jobId - The job ID.
   * @param tx - Optional transaction client.
   * @returns The job with full nested data, or `null`.
   */
  async findJobWithVersionAndDocument(
    jobId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JobWithVersionAndDocument | null> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findUnique({
      where: { id: jobId },
      include: {
        datasetVersion: true,
        document: { include: { ocr_result: true } },
      },
    });
  }

  /**
   * Reads the workflow config for a job's workflowVersionId.
   *
   * @param workflowVersionId - The workflow version ID.
   * @param tx - Optional transaction client.
   * @returns The workflow version record with config, or `null`.
   */
  async findWorkflowConfig(
    workflowVersionId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      select: { config: true },
    });
  }

  /**
   * Updates a ground truth job.
   *
   * @param jobId - The job ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated DatasetGroundTruthJob.
   */
  async updateJob(
    jobId: string,
    data: Prisma.DatasetGroundTruthJobUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.update({ where: { id: jobId }, data });
  }

  /**
   * Updates many ground truth jobs matching the given filter.
   *
   * @param where - Filter conditions.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   */
  async updateManyJobs(
    where: Prisma.DatasetGroundTruthJobWhereInput,
    data: Prisma.DatasetGroundTruthJobUncheckedUpdateManyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.datasetGroundTruthJob.updateMany({ where, data });
  }

  /**
   * Returns a paginated list of ground truth jobs for a version.
   *
   * @param versionId - The dataset version ID.
   * @param datasetId - The dataset ID.
   * @param skip - Records to skip.
   * @param take - Records to return.
   * @param tx - Optional transaction client.
   * @returns Array of DatasetGroundTruthJob records.
   */
  async findJobs(
    versionId: string,
    datasetId: string,
    skip: number,
    take: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetGroundTruthJob[]> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: { datasetVersionId: versionId, datasetVersion: { datasetId } },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    });
  }

  /**
   * Counts ground truth jobs matching the given filter.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   * @returns The count.
   */
  async countJobs(
    where: Prisma.DatasetGroundTruthJobWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.count({ where });
  }

  /**
   * Finds jobs for the review queue with full document+review session data.
   *
   * @param where - Filter conditions.
   * @param skip - Records to skip.
   * @param take - Records to return.
   * @param tx - Optional transaction client.
   * @returns Array of jobs with document and review session data.
   */
  async findJobsForReviewQueue(
    where: Prisma.DatasetGroundTruthJobWhereInput,
    skip: number,
    take: number,
    tx?: Prisma.TransactionClient,
  ): Promise<JobWithDocumentAndReview[]> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where,
      include: {
        document: {
          include: {
            ocr_result: true,
            review_sessions: {
              where: {
                status: {
                  in: [
                    ReviewStatus.in_progress,
                    ReviewStatus.approved,
                    ReviewStatus.escalated,
                    ReviewStatus.skipped,
                  ],
                },
              },
              include: { corrections: true },
              orderBy: { started_at: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }) as unknown as JobWithDocumentAndReview[];
  }

  /**
   * Finds processing jobs for a version with their document status, for lazy sync.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   * @returns Array of jobs with document status.
   */
  async findProcessingJobsWithDocumentStatus(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JobWithDocumentStatus[]> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: GroundTruthJobStatus.processing,
        documentId: { not: null },
      },
      include: { document: { select: { status: true } } },
    }) as unknown as JobWithDocumentStatus[];
  }

  /**
   * Validates that a dataset version exists, is not frozen, and has a storagePrefix.
   *
   * @param versionId - The version ID.
   * @param datasetId - The dataset ID.
   * @param tx - Optional transaction client.
   */
  async findVersionForValidation(
    versionId: string,
    datasetId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });
  }

  /**
   * Validates that a workflow version exists.
   *
   * @param workflowVersionId - The workflow version ID.
   * @param tx - Optional transaction client.
   */
  async findWorkflow(workflowVersionId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      include: { lineage: { select: { group_id: true } } },
    });
  }

  /**
   * Marks jobs whose documents have completed OCR as awaiting_review, and
   * jobs whose documents have failed as failed.
   * This is the syncJobStatuses logic extracted to the db layer.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   */
  async syncProcessingJobStatuses(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const processingJobs = await this.findProcessingJobsWithDocumentStatus(
      versionId,
      tx,
    );

    const jobsToAwait = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.completed_ocr,
    );
    const jobsToFail = processingJobs.filter(
      (j) => j.document?.status === DocumentStatus.failed,
    );

    if (jobsToAwait.length > 0) {
      await this.updateManyJobs(
        { id: { in: jobsToAwait.map((j) => j.id) } },
        { status: GroundTruthJobStatus.awaiting_review },
        tx,
      );
    }

    if (jobsToFail.length > 0) {
      await this.updateManyJobs(
        { id: { in: jobsToFail.map((j) => j.id) } },
        { status: GroundTruthJobStatus.failed, error: "OCR processing failed" },
        tx,
      );
    }
  }

  /**
   * Finds non-completed ground truth jobs for cleanup, returning id and temporalWorkflowId.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   */
  async findStaleJobs(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ id: string; temporalWorkflowId: string | null }>> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: { not: GroundTruthJobStatus.completed },
      },
      select: { id: true, temporalWorkflowId: true },
    });
  }

  /**
   * Deletes ground truth jobs by their IDs.
   *
   * @param ids - Array of job IDs.
   * @param tx - Optional transaction client.
   */
  async deleteJobsByIds(
    ids: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.datasetGroundTruthJob.deleteMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * Deletes all ground truth jobs for a (versionId, sampleId) pair along with
   * the Documents they reference. Documents must be removed because the
   * job→document relation has no onDelete cascade — without this, the deleted
   * sample would still surface in the HITL ground-truth-review queue and (once
   * orphaned) potentially in the regular HITL queue.
   *
   * Cascading deletes from Document handle OcrResult, ReviewSession,
   * FieldCorrection, and DocumentLock. Returns the documentIds that were
   * removed so callers can clean up associated blob storage.
   */
  async deleteJobsForSample(
    versionId: string,
    sampleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ documentIds: string[] }> {
    return this.deleteJobsAndDocuments(
      { datasetVersionId: versionId, sampleId },
      tx,
    );
  }

  /**
   * Same as deleteJobsForSample, but for every job belonging to the given
   * dataset versions. Used by version/dataset deletion paths to ensure the
   * Documents that the job rows pointed at don't get stranded — without this,
   * the cascade from DatasetVersion only removes the job rows, leaving
   * orphaned Documents that would satisfy the regular HITL queue's
   * `groundTruthJob: null` filter.
   */
  async deleteJobsForVersions(
    versionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ documentIds: string[] }> {
    if (versionIds.length === 0) {
      return { documentIds: [] };
    }
    return this.deleteJobsAndDocuments(
      { datasetVersionId: { in: versionIds } },
      tx,
    );
  }

  private async deleteJobsAndDocuments(
    where: Prisma.DatasetGroundTruthJobWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ documentIds: string[] }> {
    const run = async (
      client: Prisma.TransactionClient | PrismaClient,
    ): Promise<{ documentIds: string[] }> => {
      const jobs = await client.datasetGroundTruthJob.findMany({
        where,
        select: { id: true, documentId: true },
      });
      if (jobs.length === 0) {
        return { documentIds: [] };
      }
      const jobIds = jobs.map((j) => j.id);
      const documentIds = jobs
        .map((j) => j.documentId)
        .filter((id): id is string => id !== null);

      // Jobs first: the FK from job→document has no cascade, so the document
      // delete would fail while the job still references it.
      await client.datasetGroundTruthJob.deleteMany({
        where: { id: { in: jobIds } },
      });
      if (documentIds.length > 0) {
        await client.document.deleteMany({
          where: { id: { in: documentIds } },
        });
      }
      return { documentIds };
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((txClient) => run(txClient));
  }

  /**
   * Finds completed jobs for a version, returning only sampleId.
   *
   * @param versionId - The dataset version ID.
   * @param tx - Optional transaction client.
   */
  async findCompletedJobSampleIds(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ sampleId: string }>> {
    const client = tx ?? this.prisma;
    return client.datasetGroundTruthJob.findMany({
      where: {
        datasetVersionId: versionId,
        status: GroundTruthJobStatus.completed,
      },
      select: { sampleId: true },
    });
  }
}
