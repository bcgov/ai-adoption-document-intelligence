import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DocumentIntelligence, {
  isUnexpected,
  parseResultIdFromResponse,
  type DocumentIntelligenceClient,
} from '@azure-rest/ai-document-intelligence';
import { DatabaseService } from '../database/database.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { LabelingService } from '../labeling/labeling.service';
import { ExportFormat } from '../labeling/dto/export.dto';
import { StartTrainingDto } from './dto/start-training.dto';
import { ValidationResultDto, TrainingJobDto } from './dto/training-job.dto';
import { TrainedModelDto } from './dto/trained-model.dto';
import { TrainingStatus, LabelingStatus } from '@generated/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  private adminClient: DocumentIntelligenceClient;
  private readonly minDocuments: number;
  private readonly sasExpiryDays: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly blobStorage: BlobStorageService,
    private readonly labelingService: LabelingService,
    private readonly configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>(
      'AZURE_DOCUMENT_INTELLIGENCE_TRAIN_ENDPOINT',
    );
    const apiKey = this.configService.get<string>(
      'AZURE_DOCUMENT_INTELLIGENCE_API_KEY',
    );

    if (!endpoint || !apiKey) {
      this.logger.warn(
        'Azure Document Intelligence credentials not configured. Training features will not work.',
      );
    } else {
      this.adminClient = DocumentIntelligence(endpoint, { key: apiKey },
        {
          credentials: {
            apiKeyHeaderName: "api-key",
          },
      });
      this.logger.log('Document Intelligence Admin client initialized');
      this.logger.log(`Document Intelligence endpoint: ${endpoint}`);
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
    if (!('fieldsJson' in exportResult) || !('labelsFiles' in exportResult)) {
      throw new Error('Azure export did not return training data');
    }
    const { fieldsJson, labelsFiles } = exportResult as {
      fieldsJson: unknown;
      labelsFiles: Array<{ filename: string; content: unknown }>;
    };

    const files: Array<{ name: string; content: string | Buffer }> = [];

    // Add fields.json
    files.push({
      name: 'fields.json',
      content: JSON.stringify(fieldsJson, null, 2),
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
      const labelsFile = labelsFiles.find(
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

    // Remove existing Azure model if present to avoid conflicts
    await this.deleteModelIfExists(dto.modelId);

    // Remove any local record with the same model ID
    const existingModel = await this.prisma.trainedModel.findUnique({
      where: { model_id: dto.modelId },
    });
    if (existingModel) {
      await this.prisma.trainedModel.delete({
        where: { model_id: dto.modelId },
      });
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

      // Clear container contents so each training run starts clean
      await this.blobStorage.clearContainerContents(job.container_name);

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

      const containerUrl = sasUrl.split('?')[0];
      const sasToken = sasUrl.split('?')[1] || '';
      const hasSasToken = sasToken.length > 0;
      const sasParams = new URLSearchParams(sasToken);
      const sasSummary = {
        sp: sasParams.get('sp'),
        sr: sasParams.get('sr'),
        se: sasParams.get('se'),
        spr: sasParams.get('spr'),
      };

      if (!sasUrl.startsWith('https://') || !hasSasToken) {
        throw new Error(
          'Invalid SAS URL for training container. Expected HTTPS URL with SAS token.',
        );
      }

      // Initiate training with Azure
      this.logger.log(
        `Initiating Azure training for model: ${dto.modelId}`,
      );
      this.logger.debug(
        `Training container URL: ${containerUrl} (sas: ${hasSasToken ? 'present' : 'missing'})`,
      );
      this.logger.debug(`Training container SAS URL: ${sasUrl}`);
      this.logger.debug(
        `Training SAS summary: ${JSON.stringify(sasSummary)}`,
      );
      if (!sasSummary.sr || sasSummary.sr !== 'c') {
        this.logger.warn(
          `Training SAS 'sr' is not 'c' (container). Current: ${sasSummary.sr}`,
        );
      }
      if (!sasSummary.sp || !sasSummary.sp.includes('r') || !sasSummary.sp.includes('l')) {
        this.logger.warn(
          `Training SAS permissions should include read/list (sp=rl). Current: ${sasSummary.sp}`,
        );
      }

      const sasValidation = await this.blobStorage.validateContainerSasUrl(sasUrl);
      if (!sasValidation.canList) {
        this.logger.error(
          `Training SAS validation failed: ${sasValidation.error || 'unknown error'}`,
        );
      } else {
        this.logger.debug(
          `Training SAS can list ${sasValidation.blobCount} blobs (sample: ${sasValidation.sampleBlobs?.join(', ') || 'none'})`,
        );
      }

      const blobs = await this.blobStorage.listBlobs(job.container_name);
      const blobNames = new Set(blobs.map((blob) => blob.name));
      const labelFiles = blobs.filter((blob) => blob.name.endsWith('.labels.json'));
      const missingPairs: string[] = [];

      if (!blobNames.has('fields.json')) {
        missingPairs.push('fields.json (missing)');
      }

      if (labelFiles.length === 0) {
        missingPairs.push('*.labels.json (none found)');
      }

      for (const labelFile of labelFiles) {
        const baseName = labelFile.name.replace(/\.labels\.json$/, '');
        if (!blobNames.has(baseName)) {
          missingPairs.push(`${baseName} (missing document for ${labelFile.name})`);
        }
      }

      if (missingPairs.length > 0) {
        this.logger.error(
          `Training data validation failed: ${missingPairs.join('; ')}`,
        );
        throw new Error(
          'Training data in blob container is incomplete or invalid. See logs for details.',
        );
      }

      const initialResponse = await this.adminClient
        .path('/documentModels:build')
        .post({
          contentType: 'application/json',
          body: {
            modelId: dto.modelId,
            description: dto.description,
            buildMode: 'template',
            azureBlobSource: {
              containerUrl: sasUrl,
            },
          },
        });

      if (isUnexpected(initialResponse)) {
        const requestUrl = initialResponse.request?.url;
        const requestMethod = initialResponse.request?.method;
        if (requestUrl) {
          this.logger.error(
            `Azure training request failed: ${requestMethod || 'UNKNOWN'} ${requestUrl}`,
          );
        }
        this.logger.error(
          `Azure training response status: ${initialResponse.status}`,
        );
        this.logger.error(
          `Azure training response headers: ${JSON.stringify(
            initialResponse.headers,
            null,
            2,
          )}`,
        );
        this.logger.error(
          `Azure training response body: ${JSON.stringify(
            initialResponse.body,
            null,
            2,
          )}`,
        );
        const errorMessage =
          (initialResponse.body as any)?.error?.message ||
          `Azure training request failed with status ${initialResponse.status}`;
        throw new Error(errorMessage);
      }

      const operationLocation =
        initialResponse.headers?.['operation-location'] ||
        initialResponse.headers?.['Operation-Location'];
      let operationId: string | undefined;
      try {
        operationId = parseResultIdFromResponse(initialResponse);
      } catch (error) {
        if (operationLocation) {
          operationId = this.extractOperationIdFromLocation(operationLocation);
        }
      }
      if (!operationId) {
        throw new Error(
          `Failed to parse operation ID from operation-location header: ${operationLocation}`,
        );
      }

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
      this.logger.debug(
        `Azure training response headers: ${JSON.stringify(
          initialResponse.headers,
          null,
          2,
        )}`,
      );
      if (operationLocation) {
        this.logger.log(`Training operation location: ${operationLocation}`);
      }
    } catch (error) {
      const requestUrl = (error as any)?.request?.url;
      const requestMethod = (error as any)?.request?.method;
      if (requestUrl) {
        this.logger.error(
          `Azure training request failed: ${requestMethod || 'UNKNOWN'} ${requestUrl}`,
        );
      }

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


  private extractOperationIdFromLocation(operationLocation: string): string | undefined {
    try {
      const url = new URL(operationLocation);
      const parts = url.pathname.split('/');
      return parts[parts.length - 1] || undefined;
    } catch {
      return undefined;
    }
  }

  private async deleteModelIfExists(modelId: string): Promise<void> {
    if (!this.adminClient) {
      this.logger.warn(
        `Azure client not configured. Skipping model deletion for ${modelId}`,
      );
      return;
    }

    const response = await this.adminClient
      .path('/documentModels/{modelId}', modelId)
      .delete();

    if (isUnexpected(response)) {
      if (response.status === '404') {
        return;
      }
      const errorMessage =
        (response.body as any)?.error?.message ||
        `Failed to delete model ${modelId} (status ${response.status})`;
      throw new Error(errorMessage);
    }

    this.logger.log(`Deleted Azure model: ${modelId}`);
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
