import { getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { BuildMode, Prisma, TrainingStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { resolveDocumentIntelligenceMode } from "@/azure/document-intelligence-mode";
import { AppLoggerService } from "../logging/app-logger.service";
import { PrismaService } from "../database/prisma.service";
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
    trainingHours?: number;
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
  trainingHours?: number;
}

@Injectable()
export class TrainingPollerService {
  private adminClient?: DocumentIntelligenceClient;
  private readonly pollInterval: number;
  private readonly diMode: ReturnType<typeof resolveDocumentIntelligenceMode>;
  private readonly maxWallClockHours: number;

  constructor(
    private readonly trainingDb: TrainingDbService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.diMode = resolveDocumentIntelligenceMode(
      this.configService.get<string>("DOCUMENT_INTELLIGENCE_MODE"),
    );

    const endpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    const apiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );

    if (this.diMode === "mock") {
      this.logger.log(
        "DOCUMENT_INTELLIGENCE_MODE=mock — training job polling against Azure is disabled.",
      );
    } else if (!endpoint || !apiKey) {
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
    // Local safety net: if Azure never returns a terminal status (operation
    // wedged in "running", or repeated 404s on /operations/:id), stop polling
    // after this many wall-clock hours and mark the job FAILED. Default is
    // ~2x the neural cap of 10h to absorb queueing/finalisation; template
    // builds finish in minutes so this only ever fires for pathological cases.
    this.maxWallClockHours = this.configService.get<number>(
      "TRAINING_MAX_WALL_CLOCK_HOURS",
      24,
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

      // Poll each active job. target_model_id is the versioned Azure model
      // name captured at startTraining; fall back to the bare template id
      // for legacy in-flight jobs that pre-date the column.
      for (const job of activeJobs) {
        await this.pollTrainingStatus(
          job.id,
          job.target_model_id ?? job.template_model.model_id,
          job.operation_id,
        );
      }
    } catch (error) {
      this.logger.error("Error polling active jobs", {
        stack: getErrorStack(error),
      });
    }
  }

  /**
   * Poll the status of a specific training job
   */
  private async pollTrainingStatus(
    jobId: string,
    modelId: string,
    operationId: string | null,
  ): Promise<void> {
    try {
      if (!operationId) {
        this.logger.warn(`Training job ${jobId} has no operation ID`);
        return;
      }

      const client = this.adminClient;
      if (!client) {
        return;
      }

      // Calculate attempt number based on job start time
      const job = await this.trainingDb.findTrainingJob(jobId);

      if (!job) {
        return;
      }

      const elapsedSeconds = Math.floor(
        (Date.now() - job.started_at.getTime()) / 1000,
      );
      const attempts = Math.floor(elapsedSeconds / this.pollInterval);
      const elapsedHours = elapsedSeconds / 3600;

      // Local wall-clock safety net. The poller otherwise defers to Azure's
      // terminal status — if Azure never delivers one, we'd poll forever.
      // Mark FAILED here so the job leaves the "TRAINING" state; the Azure
      // side may still be running, but it's the user's call to follow up.
      if (elapsedHours > this.maxWallClockHours) {
        this.logger.error(
          `Job ${jobId} exceeded local wall-clock cap of ${this.maxWallClockHours}h (elapsed ${elapsedHours.toFixed(1)}h); marking FAILED. Azure operation ${operationId} may still be running — check Azure portal.`,
        );
        await this.trainingDb.updateTrainingJob(jobId, {
          status: TrainingStatus.FAILED,
          error_message: `Training exceeded local wall-clock cap of ${this.maxWallClockHours}h. Azure operation may still be running — check the Azure portal.`,
          completed_at: new Date(),
        });
        return;
      }

      this.logger.debug(
        `Polling operation ${operationId} for job ${jobId} (model ${modelId})`,
      );

      // Poll the build operation status
      try {
        const operationResponse = await client
          .path("/operations/{operationId}", operationId)
          .get();

        if (isUnexpected(operationResponse)) {
          if (operationResponse.status === "404") {
            this.logger.debug(
              `Operation ${operationId} not ready yet (attempt ${attempts})`,
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
            `Training still in progress for job ${jobId} (status: ${status}, attempt ${attempts})`,
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
        // Gate on neural at the source — the schema documents this column as
        // "always null for template", and Azure could in principle return
        // trainingHours on a template result. Belt-and-braces matches the
        // fallback path below.
        let actualTrainingHours: number | null =
          job.build_mode === BuildMode.neural
            ? (resultModel?.trainingHours ?? null)
            : null;

        if (
          !resultModel ||
          (job.build_mode === BuildMode.neural && actualTrainingHours === null)
        ) {
          // Fallback: fetch the model by ID (required when result is absent, or
          // when trainingHours is missing from the operation result — Azure
          // typically surfaces trainingHours only on GET /documentModels).
          const modelResponse = await client
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
          if (!resultModel) {
            docTypes = modelBody.docTypes || {};
            description = modelBody.description;
          }
          if (job.build_mode === BuildMode.neural) {
            actualTrainingHours = modelBody.trainingHours ?? null;
          }
        }

        let fieldCount = 0;
        for (const docType of Object.values(docTypes)) {
          const typedDocType = docType as DocumentType;
          if (typedDocType.fieldSchema) {
            fieldCount = Object.keys(typedDocType.fieldSchema).length;
            break;
          }
        }

        const snapshot = await this.trainingDb.buildTrainedModelSnapshot(
          job.template_model_id,
        );

        const targetVersion = job.target_version ?? 1;
        const targetModelId =
          job.target_model_id ?? job.template_model.model_id;

        // Mark job succeeded and activate the new trained model atomically.
        await this.prismaService.transaction(async (tx) => {
          await this.trainingDb.updateTrainingJob(
            jobId,
            {
              status: TrainingStatus.SUCCEEDED,
              completed_at: new Date(),
            },
            tx,
          );

          await this.trainingDb.replaceActiveTrainedModel(
            job.template_model_id,
            {
              template_model_id: job.template_model_id,
              training_job_id: jobId,
              model_id: targetModelId,
              version: targetVersion,
              is_active: true,
              description,
              doc_types:
                docTypes == null
                  ? Prisma.DbNull
                  : (docTypes as Prisma.InputJsonValue),
              field_count: fieldCount,
              dataset_snapshot: snapshot as unknown as Prisma.InputJsonValue,
              build_mode: job.build_mode,
              max_training_hours: job.max_training_hours,
              actual_training_hours: actualTrainingHours,
            },
            tx,
          );
        });

        this.logger.log(
          `Created trained model record v${targetVersion} for: ${targetModelId}`,
        );
      } catch (modelError) {
        this.logger.error(
          `Error polling operation ${operationId} for model ${modelId}: ${modelError instanceof Error ? modelError.message : String(modelError)}`,
        );

        // Mark job as failed
        await this.trainingDb.updateTrainingJob(jobId, {
          status: TrainingStatus.FAILED,
          error_message: `Training failed: ${modelError instanceof Error ? modelError.message : String(modelError)}`,
          completed_at: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(`Error polling training status for job ${jobId}`, {
        stack: getErrorStack(error),
      });
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
        job.target_model_id ?? job.template_model.model_id,
        job.operation_id,
      );
    }
  }
}
