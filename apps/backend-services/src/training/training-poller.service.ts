import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DocumentModelAdministrationClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { DatabaseService } from '../database/database.service';
import { TrainingStatus } from '../generated/enums';

@Injectable()
export class TrainingPollerService {
  private readonly logger = new Logger(TrainingPollerService.name);
  private adminClient: DocumentModelAdministrationClient;
  private readonly pollInterval: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>(
      'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
    );
    const apiKey = this.configService.get<string>(
      'AZURE_DOCUMENT_INTELLIGENCE_API_KEY',
    );

    if (!endpoint || !apiKey) {
      this.logger.warn(
        'Azure Document Intelligence credentials not configured. Training polling will not work.',
      );
    } else {
      this.adminClient = new DocumentModelAdministrationClient(
        endpoint,
        new AzureKeyCredential(apiKey),
      );
    }

    this.pollInterval = this.configService.get<number>(
      'TRAINING_POLL_INTERVAL_SECONDS',
      10,
    );
    this.maxAttempts = this.configService.get<number>(
      'TRAINING_MAX_POLL_ATTEMPTS',
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
      // Access Prisma client through DatabaseService private property
      const prisma = this.db['prisma'];
      if (!prisma) {
        this.logger.error('Prisma client not available');
        return;
      }

      const activeJobs = await prisma.trainingJob.findMany({
        where: {
          status: {
            in: [TrainingStatus.TRAINING, TrainingStatus.UPLOADED],
          },
        },
      });

      if (activeJobs.length === 0) {
        return; // No active jobs to poll
      }

      this.logger.debug(
        `Polling ${activeJobs.length} active training job(s)`,
      );

      // Poll each active job
      for (const job of activeJobs) {
        await this.pollTrainingStatus(job.id, job.model_id, job.operation_id);
      }
    } catch (error) {
      this.logger.error('Error polling active jobs', error.stack);
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
    const prisma = this.db['prisma'];
    if (!prisma) {
      this.logger.error('Prisma client not available');
      return;
    }

    try {
      // Calculate attempt number based on job start time
      const job = await prisma.trainingJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return;
      }

      const elapsedSeconds = Math.floor(
        (Date.now() - job.started_at.getTime()) / 1000,
      );
      const attempts = Math.floor(elapsedSeconds / this.pollInterval);

      // Check if max attempts exceeded
      if (attempts > this.maxAttempts) {
        this.logger.warn(
          `Training job ${jobId} exceeded max polling attempts (${this.maxAttempts})`,
        );
        await prisma.trainingJob.update({
          where: { id: jobId },
          data: {
            status: TrainingStatus.FAILED,
            error_message: 'Training timeout - exceeded maximum polling time',
            completed_at: new Date(),
          },
        });
        return;
      }

      // Try to get the model to check if training completed
      try {
        const model = await this.adminClient.getDocumentModel(modelId);

        // If we successfully retrieved the model, training is complete
        this.logger.log(`Training completed successfully for job ${jobId}`);

        // Extract model information
        const docTypes = model.docTypes || {};
        let fieldCount = 0;
        for (const docType of Object.values(docTypes)) {
          if (docType.fieldSchema) {
            fieldCount = Object.keys(docType.fieldSchema).length;
            break;
          }
        }

        // Update job status to SUCCEEDED
        await prisma.trainingJob.update({
          where: { id: jobId },
          data: {
            status: TrainingStatus.SUCCEEDED,
            completed_at: new Date(),
          },
        });

        // Create trained model record
        await prisma.trainedModel.create({
          data: {
            project_id: job.project_id,
            training_job_id: jobId,
            model_id: modelId,
            description: model.description,
            doc_types: docTypes as any,
            field_count: fieldCount,
          },
        });

        this.logger.log(`Created trained model record for: ${modelId}`);
      } catch (modelError) {
        // Model not found yet - training still in progress
        // Check if it's a real error or just not ready
        if (modelError.statusCode === 404 || modelError.code === 'ModelNotFound') {
          this.logger.debug(
            `Model ${modelId} not ready yet (attempt ${attempts}/${this.maxAttempts})`,
          );
          // Job status remains TRAINING
        } else {
          // Real error occurred
          this.logger.error(
            `Error retrieving model ${modelId}: ${modelError.message}`,
          );

          // Mark job as failed
          await prisma.trainingJob.update({
            where: { id: jobId },
            data: {
              status: TrainingStatus.FAILED,
              error_message: `Training failed: ${modelError.message}`,
              completed_at: new Date(),
            },
          });
        }
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
    const prisma = this.db['prisma'];
    if (!prisma) {
      throw new Error('Prisma client not available');
    }

    const job = await prisma.trainingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === TrainingStatus.TRAINING || job.status === TrainingStatus.UPLOADED) {
      await this.pollTrainingStatus(jobId, job.model_id, job.operation_id);
    }
  }
}
