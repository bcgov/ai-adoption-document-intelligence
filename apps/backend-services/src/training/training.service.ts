import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
  parseResultIdFromResponse,
} from "@azure-rest/ai-document-intelligence";
import {
  LabelingStatus,
  TrainedModel,
  TrainingJob,
  TrainingStatus,
} from "@generated/client";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AppLoggerService } from "../logging/app-logger.service";
import { ExportFormat } from "../template-model/dto/export.dto";
import { TemplateModelService } from "../template-model/template-model.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import { TrainedModelDto } from "./dto/trained-model.dto";
import { TrainingJobDto, ValidationResultDto } from "./dto/training-job.dto";
import { TrainingDbService } from "./training-db.service";

interface LabelsFile {
  filename: string;
  content: unknown;
}

interface AzureErrorResponse {
  error?: {
    message?: string;
  };
}

interface ErrorWithRequest {
  request?: {
    url?: string;
    method?: string;
  };
  message: string;
}

@Injectable()
export class TrainingService {
  private adminClient!: DocumentIntelligenceClient;
  private readonly minDocuments: number;
  private readonly sasExpiryDays: number;

  constructor(
    private readonly trainingDb: TrainingDbService,
    private readonly azureStorage: AzureStorageService,
    private readonly templateModelService: TemplateModelService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
  ) {
    const endpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    const apiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );

    if (!endpoint || !apiKey) {
      this.logger.warn(
        "Azure Document Intelligence credentials not configured. Training features will not work.",
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
      this.logger.log("Document Intelligence Admin client initialized");
      this.logger.log(`Document Intelligence endpoint: ${endpoint}`);
    }

    this.minDocuments = this.configService.get<number>(
      "TRAINING_MIN_DOCUMENTS",
      5,
    );
    this.sasExpiryDays = this.configService.get<number>(
      "TRAINING_SAS_EXPIRY_DAYS",
      7,
    );
  }

  /**
   * Validate that a template model is ready for training
   */
  async validateTrainingData(
    templateModelId: string,
  ): Promise<ValidationResultDto> {
    const templateModel =
      await this.templateModelService.getTemplateModel(templateModelId);

    const documents =
      await this.templateModelService.getTemplateModelDocuments(
        templateModelId,
      );
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
    if (
      !templateModel.field_schema ||
      templateModel.field_schema.length === 0
    ) {
      issues.push("Template model has no field schema defined");
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
  async prepareTrainingFiles(
    templateModelId: string,
  ): Promise<Array<{ name: string; content: string | Buffer }>> {
    this.logger.debug(
      `Preparing training files for template model: ${templateModelId}`,
    );

    // Export in Azure format
    const exportResult = await this.templateModelService.exportTemplateModel(
      templateModelId,
      {
        format: ExportFormat.AZURE,
        labeledOnly: true,
      },
    );
    if (!("fieldsJson" in exportResult) || !("labelsFiles" in exportResult)) {
      throw new Error("Azure export did not return training data");
    }
    const { fieldsJson, labelsFiles } = exportResult as {
      fieldsJson: unknown;
      labelsFiles: Array<{ filename: string; content: unknown }>;
    };

    const files: Array<{ name: string; content: string | Buffer }> = [];

    // Add fields.json
    files.push({
      name: "fields.json",
      content: JSON.stringify(fieldsJson, null, 2),
    });

    // Add document images and their labels/OCR files
    const documents =
      await this.templateModelService.getTemplateModelDocuments(
        templateModelId,
      );
    const labeledDocuments = documents.filter(
      (d) => d.status === LabelingStatus.labeled,
    );

    for (const doc of labeledDocuments) {
      const filename = doc.labeling_document.original_filename;

      // Add document image
      const blobKey = doc.labeling_document.file_path;
      const fileExists = await this.blobStorage.exists(blobKey);
      if (fileExists) {
        files.push({
          name: filename,
          content: await this.blobStorage.read(blobKey),
        });
      } else {
        this.logger.warn(`File not found in blob storage: ${blobKey}`);
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
        (f: LabelsFile) => f.filename === `${filename}.labels.json`,
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
    templateModelId: string,
    dto: StartTrainingDto,
  ): Promise<TrainingJobDto> {
    const templateModel =
      await this.templateModelService.getTemplateModel(templateModelId);
    const modelId = templateModel.model_id;

    this.logger.log(
      `Starting training for template model ${templateModelId} with model ID: ${modelId}`,
    );

    // Validate training data
    const validation = await this.validateTrainingData(templateModelId);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Template model is not ready for training",
        issues: validation.issues,
      });
    }

    // Remove existing Azure model if present to avoid conflicts
    await this.deleteModelIfExists(modelId);

    // Remove any local record with the same model ID
    const existingModel =
      await this.trainingDb.findTrainedModelByModelId(modelId);
    if (existingModel) {
      await this.trainingDb.deleteTrainedModel(modelId);
    }

    // Create training job record
    const containerName = `training-${templateModelId}`;
    const trainingJob = await this.trainingDb.createTrainingJob({
      template_model_id: templateModelId,
      status: TrainingStatus.PENDING,
      container_name: containerName,
    });

    // Start async upload and training process
    this.uploadAndTrain(trainingJob.id, templateModelId, modelId, dto).catch(
      (error) => {
        this.logger.error(
          `Training job ${trainingJob.id} failed: ${error.message}`,
          error.stack,
        );
      },
    );

    return this.mapTrainingJobToDto(trainingJob);
  }

  /**
   * Upload training data to blob storage and initiate training
   * This runs asynchronously and updates the job status in the database
   */
  private async uploadAndTrain(
    jobId: string,
    templateModelId: string,
    modelId: string,
    dto: StartTrainingDto,
  ): Promise<void> {
    try {
      // Update status to UPLOADING
      await this.trainingDb.updateTrainingJob(jobId, {
        status: TrainingStatus.UPLOADING,
      });

      // Prepare training files
      const files = await this.prepareTrainingFiles(templateModelId);

      // Get job to get container name
      const job = await this.trainingDb.findTrainingJob(jobId);

      if (!job) {
        throw new Error(`Training job ${jobId} not found`);
      }

      // Clear container contents so each training run starts clean
      await this.azureStorage.clearContainerContents(job.container_name);

      // Upload to blob storage
      const uploadResult = await this.azureStorage.uploadFiles(
        job.container_name,
        files,
      );

      if (uploadResult.failed > 0) {
        throw new Error(
          `Failed to upload ${uploadResult.failed} files: ${uploadResult.failedFiles.map((f) => f.fileName).join(", ")}`,
        );
      }

      // Generate SAS URL
      const sasUrl = await this.azureStorage.generateSasUrl(
        job.container_name,
        this.sasExpiryDays,
      );

      // Update status to UPLOADED
      await this.trainingDb.updateTrainingJob(jobId, {
        status: TrainingStatus.UPLOADED,
        sas_url: sasUrl,
        blob_count: uploadResult.uploaded,
      });

      const containerUrl = sasUrl.split("?")[0];
      const sasToken = sasUrl.split("?")[1] || "";
      const hasSasToken = sasToken.length > 0;
      const sasParams = new URLSearchParams(sasToken);
      const sasSummary = {
        sp: sasParams.get("sp"),
        sr: sasParams.get("sr"),
        se: sasParams.get("se"),
        spr: sasParams.get("spr"),
      };

      if (!sasUrl.startsWith("https://") || !hasSasToken) {
        throw new Error(
          "Invalid SAS URL for training container. Expected HTTPS URL with SAS token.",
        );
      }

      // Initiate training with Azure
      this.logger.log(`Initiating Azure training for model: ${modelId}`);
      this.logger.debug(
        `Training container URL: ${containerUrl} (sas: ${hasSasToken ? "present" : "missing"})`,
      );
      this.logger.debug(`Training container SAS URL: ${sasUrl}`);
      this.logger.debug(`Training SAS summary: ${JSON.stringify(sasSummary)}`);
      if (!sasSummary.sr || sasSummary.sr !== "c") {
        this.logger.warn(
          `Training SAS 'sr' is not 'c' (container). Current: ${sasSummary.sr}`,
        );
      }
      if (
        !sasSummary.sp ||
        !sasSummary.sp.includes("r") ||
        !sasSummary.sp.includes("l")
      ) {
        this.logger.warn(
          `Training SAS permissions should include read/list (sp=rl). Current: ${sasSummary.sp}`,
        );
      }

      const initialResponse = await this.adminClient
        .path("/documentModels:build")
        .post({
          contentType: "application/json",
          body: {
            modelId,
            description: dto.description,
            buildMode: "template",
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
            `Azure training request failed: ${requestMethod || "UNKNOWN"} ${requestUrl}`,
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
          (initialResponse.body as AzureErrorResponse)?.error?.message ||
          `Azure training request failed with status ${initialResponse.status}`;
        throw new Error(errorMessage);
      }

      const operationLocation =
        initialResponse.headers?.["operation-location"] ||
        initialResponse.headers?.["Operation-Location"];
      let operationId: string | undefined;
      try {
        operationId = parseResultIdFromResponse(initialResponse);
      } catch {
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
      await this.trainingDb.updateTrainingJob(jobId, {
        status: TrainingStatus.TRAINING,
        operation_id: operationId,
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
      const typedError = error as ErrorWithRequest;
      const requestUrl = typedError?.request?.url;
      const requestMethod = typedError?.request?.method;
      if (requestUrl) {
        this.logger.error(
          `Azure training request failed: ${requestMethod || "UNKNOWN"} ${requestUrl}`,
        );
      }

      // Update job status to FAILED
      await this.trainingDb.updateTrainingJob(jobId, {
        status: TrainingStatus.FAILED,
        error_message: typedError.message,
        completed_at: new Date(),
      });

      throw error;
    }
  }

  /**
   * Get all training jobs for a template model
   */
  async getTrainingJobs(templateModelId: string): Promise<TrainingJobDto[]> {
    const jobs = await this.trainingDb.findAllTrainingJobs(templateModelId);

    return jobs.map((job) => this.mapTrainingJobToDto(job));
  }

  /**
   * Get a specific training job
   */
  async getTrainingJob(jobId: string): Promise<TrainingJobDto> {
    const job = await this.trainingDb.findTrainingJob(jobId);

    if (!job) {
      throw new NotFoundException(`Training job with id ${jobId} not found`);
    }

    return this.mapTrainingJobToDto(job);
  }

  /**
   * Cancel a training job (if still in progress)
   */
  async cancelTrainingJob(jobId: string): Promise<void> {
    const job = await this.trainingDb.findTrainingJob(jobId);

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

    await this.trainingDb.updateTrainingJob(jobId, {
      status: TrainingStatus.FAILED,
      error_message: "Cancelled by user",
      completed_at: new Date(),
    });

    this.logger.log(`Training job ${jobId} cancelled`);
  }

  /**
   * Map database model to DTO
   */
  private mapTrainingJobToDto(job: TrainingJob): TrainingJobDto {
    return {
      id: job.id,
      templateModelId: job.template_model_id,
      status: job.status,
      containerName: job.container_name,
      sasUrl: job.sas_url ?? undefined,
      blobCount: job.blob_count,
      operationId: job.operation_id ?? undefined,
      errorMessage: job.error_message ?? undefined,
      startedAt: job.started_at,
      completedAt: job.completed_at ?? undefined,
    };
  }

  private extractOperationIdFromLocation(
    operationLocation: string,
  ): string | undefined {
    try {
      const url = new URL(operationLocation);
      const parts = url.pathname.split("/");
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
      .path("/documentModels/{modelId}", modelId)
      .delete();

    if (isUnexpected(response)) {
      if (response.status === "404") {
        return;
      }
      const errorMessage =
        (response.body as AzureErrorResponse)?.error?.message ||
        `Failed to delete model ${modelId} (status ${response.status})`;
      throw new Error(errorMessage);
    }

    this.logger.log(`Deleted Azure model: ${modelId}`);
  }

  /**
   * Returns all distinct trained model IDs across all projects.
   * Used by the OCR module to list available models.
   *
   * @returns An array of distinct model ID strings from the database.
   */
  async findAllTrainedModelIds(): Promise<string[]> {
    return this.trainingDb.findAllTrainedModelIds();
  }

  mapTrainedModelToDto(model: TrainedModel): TrainedModelDto {
    return {
      id: model.id,
      templateModelId: model.template_model_id,
      trainingJobId: model.training_job_id,
      modelId: model.model_id,
      description: model.description ?? undefined,
      docTypes: model.doc_types as Record<string, unknown> | undefined,
      fieldCount: model.field_count,
      createdAt: model.created_at,
    };
  }
}
