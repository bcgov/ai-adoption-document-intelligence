import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { Prisma, TrainingStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLoggerService } from "../logging/app-logger.service";
import { TrainingDbService } from "./training-db.service";

interface AzureErrorResponse {
  error?: {
    message?: string;
  };
}

interface AzureOperationResponse {
  status: string;
  result?: {
    docTypes?: Record<string, DocumentType>;
    description?: string;
  };
  error?: {
    message?: string;
  };
}

interface DocumentType {
  fieldSchema?: Record<string, unknown>;
}

interface AzureModelResponse {
  docTypes?: Record<string, DocumentType>;
  description?: string;
}

interface TrainingJobWithTemplateModel {
  id: string;
  template_model_id: string;
  template_model: {
    id: string;
    model_id: string;
  };
  status: TrainingStatus;
  container_name: string;
  sas_url: string | null;
  blob_count: number;
  operation_id: string | null;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
}

@Injectable()
export class TrainingPollerService {
  private adminClient: DocumentIntelligenceClient;
  private readonly pollInterval: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly trainingDb: TrainingDbService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const endpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    const apiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );

    if (!endpoint || !apiKey) {
      this.logger.warn(
        "Azure Document Intelligence credentials not configured. Training polling will not work.",
      );
    } else {
      this.adminClient = DocumentIntelligence(
        endpoint,
        { key: apiKey },
        {
          credentials: {
            apiKeyHeaderName: "api-key",
          },
        },
      );
    }

    this.pollInterval = this.configService.get<number>(
      "TRAINING_POLL_INTERVAL_SECONDS",
      10,
    );
    this.maxAttempts = this.configService.get<number>(
      "TRAINING_MAX_POLL_ATTEMPTS",
      60,
    );
  }

  /**
   * Poll for active training jobs every 10 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollActiveJobs(): Promise<void> {
    if (!this.adminClient) {
      return; // Skip if not configured
    }

    try {
      // Find all jobs that are actively training
      const activeJobs = await this.trainingDb.findAllActiveTrainingJobs();

      if (activeJobs.length === 0) {
        return; // No active jobs to poll
      }

      this.logger.debug(`Polling ${activeJobs.length} active training job(s)`);

      // Poll each active job
      for (const job of activeJobs) {
        await this.pollTrainingStatus(
          job.id,
          job.template_model.model_id,
          job.operation_id,
        );
      }
    } catch (error) {
      this.logger.error("Error polling active jobs", {
        stack: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  /**
   * Poll the status of a specific training job
   */
  private async pollTrainingStatus(
    jobId: string,
    modelId: string,
    operationId: string,
  ): Promise<void> {
    try {
      if (!operationId) {
        this.logger.warn(`Training job ${jobId} has no operation ID`);
        return;
      }

      // Calculate attempt number based on job start time
      const job = await this.trainingDb.findTrainingJob(jobId);

      if (!job) {
        return;
      }

      const jobWithTemplateModel = job as TrainingJobWithTemplateModel;

      const elapsedSeconds = Math.floor(
        (Date.now() - job.started_at.getTime()) / 1000,
      );
      const attempts = Math.floor(elapsedSeconds / this.pollInterval);

      // Check if max attempts exceeded
      if (attempts > this.maxAttempts) {
        this.logger.warn(
          `Training job ${jobId} exceeded max polling attempts (${this.maxAttempts})`,
        );
        await this.trainingDb.updateTrainingJob(jobId, {
          status: TrainingStatus.FAILED,
          error_message: "Training timeout - exceeded maximum polling time",
          completed_at: new Date(),
        });
        return;
      }

      this.logger.debug(
        `Polling operation ${operationId} for job ${jobId} (model ${modelId})`,
      );

      // Poll the build operation status
      try {
        const operationResponse = await this.adminClient
          .path("/operations/{operationId}", operationId)
          .get();

        if (isUnexpected(operationResponse)) {
          if (operationResponse.status === "404") {
            this.logger.debug(
              `Operation ${operationId} not ready yet (attempt ${attempts}/${this.maxAttempts})`,
            );
            return;
          }

          this.logger.error(
            `Azure operations GET failed: status=${operationResponse.status}, request URL=${operationResponse.request?.url}, body=${JSON.stringify(operationResponse.body)}`,
          );
          const errorMessage =
            (operationResponse.body as AzureErrorResponse)?.error?.message ||
            `Error retrieving operation ${operationId} (status ${operationResponse.status})`;
          throw new Error(errorMessage);
        }

        const operation = operationResponse.body as AzureOperationResponse;
        const status = operation.status;

        if (status === "notStarted" || status === "running") {
          this.logger.debug(
            `Training still in progress for job ${jobId} (status: ${status}, attempt ${attempts}/${this.maxAttempts})`,
          );
          return;
        }

        if (status !== "succeeded") {
          this.logger.error(
            `Azure training operation failed: status=${status}, operation body=${JSON.stringify(operation)}`,
          );
          const errorMessage =
            operation.error?.message || `Training failed with status ${status}`;
          throw new Error(errorMessage);
        }

        // Training succeeded
        this.logger.log(`Training completed successfully for job ${jobId}`);

        const resultModel = operation.result;
        let docTypes = resultModel?.docTypes || {};
        let description = resultModel?.description;

        if (!resultModel) {
          // Fallback: fetch the model by ID
          const modelResponse = await this.adminClient
            .path("/documentModels/{modelId}", modelId)
            .get();

          if (isUnexpected(modelResponse)) {
            this.logger.error(
              `Azure documentModels GET failed: status=${modelResponse.status}, request URL=${modelResponse.request?.url}, body=${JSON.stringify(modelResponse.body)}`,
            );
            const errorMessage =
              (modelResponse.body as AzureErrorResponse)?.error?.message ||
              `Error retrieving model ${modelId} (status ${modelResponse.status})`;
            throw new Error(errorMessage);
          }

          const modelBody = modelResponse.body as AzureModelResponse;
          docTypes = modelBody.docTypes || {};
          description = modelBody.description;
        }

        let fieldCount = 0;
        for (const docType of Object.values(docTypes)) {
          const typedDocType = docType as DocumentType;
          if (typedDocType.fieldSchema) {
            fieldCount = Object.keys(typedDocType.fieldSchema).length;
            break;
          }
        }

        // Update job status to SUCCEEDED
        await this.trainingDb.updateTrainingJob(jobId, {
          status: TrainingStatus.SUCCEEDED,
          completed_at: new Date(),
        });

        // Create trained model record
        await this.trainingDb.createTrainedModel({
          template_model_id: jobWithTemplateModel.template_model_id,
          training_job_id: jobId,
          model_id: jobWithTemplateModel.template_model.model_id,
          description,
          doc_types: docTypes as Prisma.JsonValue,
          field_count: fieldCount,
        });

        this.logger.log(`Created trained model record for: ${modelId}`);
      } catch (modelError) {
        this.logger.error(
          `Error polling operation ${operationId} for model ${modelId}: ${modelError.message}`,
        );

        // Mark job as failed
        await this.trainingDb.updateTrainingJob(jobId, {
          status: TrainingStatus.FAILED,
          error_message: `Training failed: ${modelError.message}`,
          completed_at: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(
        `Error polling training status for job ${jobId}`,
        error.stack,
      );
    }
  }

  /**
   * Force poll a specific job (for manual refresh)
   */
  async pollJob(jobId: string): Promise<void> {
    const job = await this.trainingDb.findTrainingJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (
      job.status === TrainingStatus.TRAINING ||
      job.status === TrainingStatus.UPLOADED
    ) {
      await this.pollTrainingStatus(
        jobId,
        job.template_model.model_id,
        job.operation_id,
      );
    }
  }
}
