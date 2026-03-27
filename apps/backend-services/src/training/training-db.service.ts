import type {
  Prisma,
  PrismaClient,
  TemplateModel,
  TrainedModel,
  TrainingJob,
} from "@generated/client";
import { TrainingStatus } from "@generated/client";

export type TrainingJobWithTemplateModel = TrainingJob & {
  template_model: TemplateModel;
};
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface TrainingJobCreateData {
  template_model_id: string;
  status: TrainingStatus;
  container_name: string;
}

export interface TrainingJobUpdateData {
  status?: TrainingStatus;
  sas_url?: string | null;
  blob_count?: number | null;
  operation_id?: string | null;
  error_message?: string | null;
  completed_at?: Date | null;
}

export interface TrainedModelCreateData {
  template_model_id: string;
  training_job_id: string;
  model_id: string;
  description?: string | null;
  doc_types: Prisma.JsonValue;
  field_count: number;
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
    return client.trainingJob.findUnique({ where: { id }, include: { template_model: true } });
  }

  /**
   * Finds all training jobs for a project, ordered by start date descending.
   * @param projectId The ID of the project.
   * @param tx Optional transaction client.
   * @returns An array of TrainingJob records.
   */
  async findAllTrainingJobs(
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainingJob[]> {
    const client = tx ?? this.prisma;
    return client.trainingJob.findMany({
      where: { template_model_id: projectId },
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
   * Finds all trained models for a project, ordered by creation date descending.
   * @param projectId The ID of the project.
   * @param tx Optional transaction client.
   * @returns An array of TrainedModel records.
   */
  async findAllTrainedModels(
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel[]> {
    const client = tx ?? this.prisma;
    return client.trainedModel.findMany({
      where: { template_model_id: projectId },
      orderBy: { created_at: "desc" },
    });
  }

  /**
   * Deletes a trained model by its Azure model ID.
   * @param modelId The Azure model ID.
   * @param tx Optional transaction client.
   * @returns The deleted TrainedModel record.
   */
  async deleteTrainedModel(
    modelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TrainedModel> {
    const client = tx ?? this.prisma;
    return client.trainedModel.delete({ where: { model_id: modelId } });
  }

  /**
   * Returns all distinct trained model IDs across all projects.
   * @param tx Optional transaction client.
   * @returns An array of distinct model ID strings.
   */
  async findAllTrainedModelIds(
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx ?? this.prisma;
    const results = await client.trainedModel.findMany({
      select: { model_id: true },
      distinct: ["model_id"],
    });
    return results.map((r) => r.model_id);
  }
}
