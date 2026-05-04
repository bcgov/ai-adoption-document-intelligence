import type {
  Prisma,
  PrismaClient,
  TemplateModel,
  TrainedModel,
  TrainingJob,
} from "@generated/client";
import { BuildMode, LabelingStatus, TrainingStatus } from "@generated/client";

export interface TrainedModelSnapshotDocument {
  labelingDocumentId: string;
  originalFilename: string;
  labels: Array<{
    fieldKey: string;
    labelName: string;
    value: string | null;
    pageNumber: number;
    boundingBox: unknown;
  }>;
}

export interface TrainedModelSnapshot {
  documents: TrainedModelSnapshotDocument[];
}

export type TrainingJobWithTemplateModel = TrainingJob & {
  template_model: TemplateModel;
};

import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface TrainingJobCreateData {
  template_model_id: string;
  status: TrainingStatus;
  container_name: string;
  target_model_id?: string | null;
  target_version?: number | null;
  build_mode?: BuildMode;
  max_training_hours?: number | null;
}

export interface TrainingJobUpdateData {
  status?: TrainingStatus;
  sas_url?: string | null;
  blob_count?: number;
  operation_id?: string | null;
  error_message?: string | null;
  completed_at?: Date | null;
}

export interface TrainedModelCreateData {
  template_model_id: string;
  training_job_id: string;
  model_id: string;
  version: number;
  is_active?: boolean;
  description?: string | null;
  doc_types: Prisma.InputJsonValue | typeof Prisma.DbNull;
  field_count: number;
  dataset_snapshot: Prisma.InputJsonValue | typeof Prisma.DbNull;
}

/**
 * Database service for TrainingJob and TrainedModel operations within the Training module.
 */
@Injectable()
export class TrainingDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new training job record.
   * @param data The data for the new training job.
   * @param tx Optional transaction client.
   * @returns The created TrainingJob record.
   */
  async createTrainingJob(
    data: TrainingJobCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJob> {
    const client = tx ?? this.prisma;
    return client.trainingJob.create({ data });
  }

  /**
   * Finds a training job by its ID.
   * @param id The ID of the training job.
   * @param tx Optional transaction client.
   * @returns The TrainingJob record, or null if not found.
   */
  async findTrainingJob(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJobWithTemplateModel | null> {
    const client = tx ?? this.prisma;
    return client.trainingJob.findUnique({
      where: { id },
      include: { template_model: true },
    });
  }

  /**
   * Finds all training jobs for a template model, ordered by start date descending.
   * @param templateModelId The ID of the template model.
   * @param tx Optional transaction client.
   * @returns An array of TrainingJob records.
   */
  async findAllTrainingJobs(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJob[]> {
    const client = tx ?? this.prisma;
    return client.trainingJob.findMany({
      where: { template_model_id: templateModelId },
      orderBy: { started_at: "desc" },
    });
  }

  /**
   * Finds all training jobs that are actively training or uploaded (awaiting polling).
   * @param tx Optional transaction client.
   * @returns An array of active TrainingJob records.
   */
  async findAllActiveTrainingJobs(
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJobWithTemplateModel[]> {
    const client = tx ?? this.prisma;
    return client.trainingJob.findMany({
      where: {
        status: {
          in: [TrainingStatus.TRAINING, TrainingStatus.UPLOADED],
        },
      },
      include: { template_model: true },
    });
  }

  /**
   * Updates a training job record by ID.
   * @param id The ID of the training job.
   * @param data The partial data to update.
   * @param tx Optional transaction client.
   * @returns The updated TrainingJob record.
   */
  async updateTrainingJob(
    id: string,
    data: TrainingJobUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJob> {
    const client = tx ?? this.prisma;
    return client.trainingJob.update({ where: { id }, data });
  }

  /**
   * Creates a new trained model record.
   * @param data The data for the new trained model.
   * @param tx Optional transaction client.
   * @returns The created TrainedModel record.
   */
  async createTrainedModel(
    data: TrainedModelCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel> {
    const client = tx ?? this.prisma;
    return client.trainedModel.create({ data });
  }

  /**
   * Finds a trained model by its Azure model ID.
   * @param modelId The Azure model ID.
   * @param tx Optional transaction client.
   * @returns The TrainedModel record, or null if not found.
   */
  async findTrainedModelByModelId(
    modelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel | null> {
    const client = tx ?? this.prisma;
    return client.trainedModel.findUnique({ where: { model_id: modelId } });
  }

  /**
   * Finds all trained models for a template model. By default tombstoned
   * (deleted) versions are excluded.
   * @param templateModelId The ID of the template model.
   * @param opts.includeDeleted If true, also return tombstoned versions.
   * @param tx Optional transaction client.
   * @returns An array of TrainedModel records ordered by version descending.
   */
  async findAllTrainedModels(
    templateModelId: string,
    opts: { includeDeleted?: boolean } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel[]> {
    const client = tx ?? this.prisma;
    return client.trainedModel.findMany({
      where: {
        template_model_id: templateModelId,
        ...(opts.includeDeleted ? {} : { deleted_at: null }),
      },
      orderBy: { version: "desc" },
    });
  }

  /**
   * Finds the currently active (non-deleted) trained model for a template.
   */
  async findActiveTrainedModel(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel | null> {
    const client = tx ?? this.prisma;
    return client.trainedModel.findFirst({
      where: {
        template_model_id: templateModelId,
        is_active: true,
        deleted_at: null,
      },
    });
  }

  /**
   * Returns the next version number to assign for a template model. Uses
   * `max(version) + 1` across all rows (including tombstoned) so version
   * numbers are monotonic across a template's full history.
   */
  async getNextVersionNumber(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.trainedModel.aggregate({
      where: { template_model_id: templateModelId },
      _max: { version: true },
    });
    return (result._max.version ?? 0) + 1;
  }

  /**
   * Atomically marks a single version active for its template and clears
   * `is_active` on every other row for the same template. Throws if the
   * target row is tombstoned or doesn't exist.
   */
  async setActiveTrainedModel(
    trainedModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel> {
    const run = async (
      client: Prisma.TransactionClient | PrismaClient,
    ): Promise<TrainedModel> => {
      const target = await client.trainedModel.findUnique({
        where: { id: trainedModelId },
      });
      if (!target) {
        throw new Error(`TrainedModel ${trainedModelId} not found`);
      }
      if (target.deleted_at !== null) {
        throw new Error(
          `TrainedModel ${trainedModelId} is deleted and cannot be activated`,
        );
      }
      await client.trainedModel.updateMany({
        where: {
          template_model_id: target.template_model_id,
          NOT: { id: trainedModelId },
        },
        data: { is_active: false },
      });
      return client.trainedModel.update({
        where: { id: trainedModelId },
        data: { is_active: true },
      });
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((txClient) => run(txClient));
  }

  /**
   * Clears `is_active` on every trained model belonging to a template. Used
   * by the poller before creating a new active version, and by setActive
   * before promoting a different version. Returns the count demoted.
   */
  async demoteActiveTrainedModels(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.trainedModel.updateMany({
      where: { template_model_id: templateModelId, is_active: true },
      data: { is_active: false },
    });
    return result.count;
  }

  /**
   * Tombstones a trained model: clears `is_active`, sets `deleted_at`. The
   * row is kept so audit views ("vN — deleted on …") still resolve, but the
   * Azure artifact is expected to be removed by the caller.
   */
  async tombstoneTrainedModel(
    trainedModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel> {
    const client = tx ?? this.prisma;
    return client.trainedModel.update({
      where: { id: trainedModelId },
      data: { is_active: false, deleted_at: new Date() },
    });
  }

  /**
   * Builds a snapshot of every labeled document + its labels for a template,
   * suitable for storing on a TrainedModel so future audits can show exactly
   * what the version was trained on.
   */
  async buildTrainedModelSnapshot(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModelSnapshot> {
    const client = tx ?? this.prisma;
    const labeledDocuments = await client.labeledDocument.findMany({
      where: {
        template_model_id: templateModelId,
        status: LabelingStatus.labeled,
      },
      include: {
        labeling_document: {
          select: { id: true, original_filename: true },
        },
        labels: {
          select: {
            field_key: true,
            label_name: true,
            value: true,
            page_number: true,
            bounding_box: true,
          },
        },
      },
    });
    return {
      documents: labeledDocuments.map((doc) => ({
        labelingDocumentId: doc.labeling_document.id,
        originalFilename: doc.labeling_document.original_filename,
        labels: doc.labels.map((l) => ({
          fieldKey: l.field_key,
          labelName: l.label_name,
          value: l.value,
          pageNumber: l.page_number,
          boundingBox: l.bounding_box,
        })),
      })),
    };
  }

  /**
   * Returns all distinct, non-tombstoned trained model IDs across all
   * template models. Used to populate the OCR model picker.
   */
  async findAllTrainedModelIds(
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx ?? this.prisma;
    const results = await client.trainedModel.findMany({
      where: { deleted_at: null },
      select: { model_id: true },
      distinct: ["model_id"],
    });
    return results.map((r) => r.model_id);
  }
}
