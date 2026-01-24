import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentModelAdministrationClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { DatabaseService } from '../database/database.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { LabelingService } from '../labeling/labeling.service';
import { ExportFormat } from '../labeling/dto/export.dto';
import { StartTrainingDto } from './dto/start-training.dto';
import { ValidationResultDto, TrainingJobDto } from './dto/training-job.dto';
import { TrainedModelDto } from './dto/trained-model.dto';
import { TrainingStatus, LabelingStatus } from '../generated/enums';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  private adminClient: DocumentModelAdministrationClient;
  private readonly minDocuments: number;
  private readonly sasExpiryDays: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly blobStorage: BlobStorageService,
    private readonly labelingService: LabelingService,
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
        'Azure Document Intelligence credentials not configured. Training features will not work.',
      );
    } else {
      this.adminClient = new DocumentModelAdministrationClient(
        endpoint,
        new AzureKeyCredential(apiKey),
      );
      this.logger.log('Document Intelligence Admin client initialized');
    }

    this.minDocuments = this.configService.get<number>(
      'TRAINING_MIN_DOCUMENTS',
      5,
    );
    this.sasExpiryDays = this.configService.get<number>(
      'TRAINING_SAS_EXPIRY_DAYS',
      7,
    );
  }

  /**
   * Get Prisma client from DatabaseService
   */
  private get prisma() {
    return this.db['prisma'];
  }

  /**
   * Validate that a project is ready for training
   */
  async validateTrainingData(projectId: string): Promise<ValidationResultDto> {
    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    const documents = await this.db.findLabeledDocuments(projectId);
    const labeledDocuments = documents.filter(
      (d) => d.status === LabelingStatus.labeled,
    );

    const issues: string[] = [];

    // Check minimum documents requirement
    if (labeledDocuments.length < this.minDocuments) {
      issues.push(
        `Insufficient labeled documents. Found ${labeledDocuments.length}, minimum required: ${this.minDocuments}`,
      );
    }

    // Check field schema exists
    if (!project.field_schema || project.field_schema.length === 0) {
      issues.push('Project has no field schema defined');
    }

    // Check each labeled document has labels
    const documentsWithoutLabels = labeledDocuments.filter(
      (d) => !d.labels || d.labels.length === 0,
    );
    if (documentsWithoutLabels.length > 0) {
      issues.push(
        `${documentsWithoutLabels.length} labeled documents have no labels`,
      );
    }

    return {
      valid: issues.length === 0,
      labeledDocumentsCount: labeledDocuments.length,
      minimumRequired: this.minDocuments,
      issues,
    };
  }

  /**
   * Prepare training files (fields.json and labels.json for each document)
   */
  async prepareTrainingFiles(projectId: string): Promise<
    Array<{ name: string; content: string | Buffer }>
  > {
    this.logger.debug(`Preparing training files for project: ${projectId}`);

    // Export in Azure format
    const exportResult = await this.labelingService.exportProject(projectId, {
      format: ExportFormat.AZURE,
      labeledOnly: true,
    });

    const files: Array<{ name: string; content: string | Buffer }> = [];

    // Add fields.json
    files.push({
      name: 'fields.json',
      content: JSON.stringify(exportResult.fieldsJson, null, 2),
    });

    // Add document images and their labels/OCR files
    const documents = await this.db.findLabeledDocuments(projectId);
    const labeledDocuments = documents.filter(
      (d) => d.status === LabelingStatus.labeled,
    );

    for (const doc of labeledDocuments) {
      const filename = doc.labeling_document.original_filename;

      // Add document image
      const filePath = path.join(
        process.cwd(),
        doc.labeling_document.file_path,
      );
      if (fs.existsSync(filePath)) {
        files.push({
          name: filename,
          content: fs.readFileSync(filePath),
        });
      } else {
        this.logger.warn(`File not found: ${filePath}`);
      }

      // Add OCR JSON
      if (doc.labeling_document.ocr_result) {
        files.push({
          name: `${filename}.ocr.json`,
          content: JSON.stringify(doc.labeling_document.ocr_result, null, 2),
        });
      }

      // Add labels JSON
      const labelsFile = exportResult.labelsFiles.find(
        (f: any) => f.filename === `${filename}.labels.json`,
      );
      if (labelsFile) {
        files.push({
          name: `${filename}.labels.json`,
          content: JSON.stringify(labelsFile.content, null, 2),
        });
      }
    }

    this.logger.log(`Prepared ${files.length} files for training`);
    return files;
  }

  /**
   * Start the training process
   */
  async startTraining(
    projectId: string,
    dto: StartTrainingDto,
    userId: string,
  ): Promise<TrainingJobDto> {
    this.logger.log(
      `Starting training for project ${projectId} with model ID: ${dto.modelId}`,
    );

    // Validate training data
    const validation = await this.validateTrainingData(projectId);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Project is not ready for training',
        issues: validation.issues,
      });
    }

    // Check if model ID already exists
    const existingModel = await this.prisma.trainedModel.findUnique({
      where: { model_id: dto.modelId },
    });
    if (existingModel) {
      throw new BadRequestException(
        `Model ID '${dto.modelId}' already exists. Please choose a unique model ID.`,
      );
    }

    // Create training job record
    const containerName = `training-${projectId}`;
    const trainingJob = await this.prisma.trainingJob.create({
      data: {
        project_id: projectId,
        status: TrainingStatus.PENDING,
        container_name: containerName,
        model_id: dto.modelId,
      },
    });

    // Start async upload and training process
    this.uploadAndTrain(trainingJob.id, projectId, dto).catch((error) => {
      this.logger.error(
        `Training job ${trainingJob.id} failed: ${error.message}`,
        error.stack,
      );
    });

    return this.mapTrainingJobToDto(trainingJob);
  }

  /**
   * Upload training data to blob storage and initiate training
   * This runs asynchronously and updates the job status in the database
   */
  private async uploadAndTrain(
    jobId: string,
    projectId: string,
    dto: StartTrainingDto,
  ): Promise<void> {
    try {
      // Update status to UPLOADING
      await this.prisma.trainingJob.update({
        where: { id: jobId },
        data: { status: TrainingStatus.UPLOADING },
      });

      // Prepare training files
      const files = await this.prepareTrainingFiles(projectId);

      // Get job to get container name
      const job = await this.prisma.trainingJob.findUnique({
        where: { id: jobId },
      });

      // Upload to blob storage
      const uploadResult = await this.blobStorage.uploadFiles(
        job.container_name,
        files,
      );

      if (uploadResult.failed > 0) {
        throw new Error(
          `Failed to upload ${uploadResult.failed} files: ${uploadResult.failedFiles.map((f) => f.fileName).join(', ')}`,
        );
      }

      // Generate SAS URL
      const sasUrl = await this.blobStorage.generateSasUrl(
        job.container_name,
        this.sasExpiryDays,
      );

      // Update status to UPLOADED
      await this.prisma.trainingJob.update({
        where: { id: jobId },
        data: {
          status: TrainingStatus.UPLOADED,
          sas_url: sasUrl,
          blob_count: uploadResult.uploaded,
        },
      });

      // Initiate training with Azure
      this.logger.log(
        `Initiating Azure training for model: ${dto.modelId}`,
      );

      const poller = await this.adminClient.beginBuildDocumentModel(
        dto.modelId,
        sasUrl,
        'template',
        {
          description: dto.description,
        },
      );

      // Extract operation ID from poller
      const operationId = this.extractOperationId(poller);

      // Update status to TRAINING
      await this.prisma.trainingJob.update({
        where: { id: jobId },
        data: {
          status: TrainingStatus.TRAINING,
          operation_id: operationId,
        },
      });

      this.logger.log(
        `Training initiated for job ${jobId}, operation ID: ${operationId}`,
      );
    } catch (error) {
      // Update job status to FAILED
      await this.prisma.trainingJob.update({
        where: { id: jobId },
        data: {
          status: TrainingStatus.FAILED,
          error_message: error.message,
          completed_at: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Extract operation ID from the poller for tracking
   */
  private extractOperationId(poller: any): string {
    try {
      // The operation ID is typically in the polling URL or operation location header
      if (poller.operationLocation) {
        const parts = poller.operationLocation.split('/');
        return parts[parts.length - 1];
      }
      return 'unknown';
    } catch (error) {
      this.logger.warn('Could not extract operation ID from poller');
      return 'unknown';
    }
  }

  /**
   * Get all training jobs for a project
   */
  async getTrainingJobs(projectId: string): Promise<TrainingJobDto[]> {
    const jobs = await this.prisma.trainingJob.findMany({
      where: { project_id: projectId },
      orderBy: { started_at: 'desc' },
    });

    return jobs.map((job) => this.mapTrainingJobToDto(job));
  }

  /**
   * Get a specific training job
   */
  async getTrainingJob(jobId: string): Promise<TrainingJobDto> {
    const job = await this.prisma.trainingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Training job with id ${jobId} not found`);
    }

    return this.mapTrainingJobToDto(job);
  }

  /**
   * Get all trained models for a project
   */
  async getTrainedModels(projectId: string): Promise<TrainedModelDto[]> {
    const models = await this.prisma.trainedModel.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });

    return models.map((model) => this.mapTrainedModelToDto(model));
  }

  /**
   * Cancel a training job (if still in progress)
   */
  async cancelTrainingJob(jobId: string): Promise<void> {
    const job = await this.prisma.trainingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Training job with id ${jobId} not found`);
    }

    if (
      job.status !== TrainingStatus.PENDING &&
      job.status !== TrainingStatus.UPLOADING &&
      job.status !== TrainingStatus.UPLOADED &&
      job.status !== TrainingStatus.TRAINING
    ) {
      throw new BadRequestException(
        `Cannot cancel job with status: ${job.status}`,
      );
    }

    await this.prisma.trainingJob.update({
      where: { id: jobId },
      data: {
        status: TrainingStatus.FAILED,
        error_message: 'Cancelled by user',
        completed_at: new Date(),
      },
    });

    this.logger.log(`Training job ${jobId} cancelled`);
  }

  /**
   * Map database model to DTO
   */
  private mapTrainingJobToDto(job: any): TrainingJobDto {
    return {
      id: job.id,
      projectId: job.project_id,
      status: job.status,
      containerName: job.container_name,
      sasUrl: job.sas_url,
      blobCount: job.blob_count,
      modelId: job.model_id,
      operationId: job.operation_id,
      errorMessage: job.error_message,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    };
  }

  /**
   * Map database model to DTO
   */
  private mapTrainedModelToDto(model: any): TrainedModelDto {
    return {
      id: model.id,
      projectId: model.project_id,
      trainingJobId: model.training_job_id,
      modelId: model.model_id,
      description: model.description,
      docTypes: model.doc_types,
      fieldCount: model.field_count,
      createdAt: model.created_at,
    };
  }
}
