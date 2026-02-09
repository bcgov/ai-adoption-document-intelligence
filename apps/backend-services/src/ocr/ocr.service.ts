import { DocumentStatus } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "@/database/database.service";
import {
  AnalysisResponse,
  AnalysisResult,
  KeyValuePair,
} from "@/ocr/azure-types";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { LocalBlobStorageService } from "@/blob-storage/local-blob-storage.service";

export interface OcrRequestResponse {
  status: DocumentStatus;
  workflowId?: string;
  apimRequestId?: string;
  error?: string; // Error message as string for serialization
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    _configService: ConfigService,
    private databaseService: DatabaseService,
    private temporalClientService: TemporalClientService,
    private blobStorage: LocalBlobStorageService,
  ) {}

  /**
   * Sends a document to Azure for OCR processing via Temporal workflow.
   * @param documentId ID from documents table
   * @param steps Optional workflow steps configuration
   * @returns New status of document and workflow ID.
   */
  async requestOcr(
    documentId: string,
  ): Promise<OcrRequestResponse> {
    this.logger.debug(`Document ID: ${documentId || "N/A"}`);
    // Find filepath of document
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`,
      );
    }
    try {
      // Read file from blob storage using the blob key stored in file_path
      const fileBuffer = await this.blobStorage.read(document.file_path);
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Get model_id from document
      const modelId = document.model_id;
      this.logger.debug(`Document model_id: ${modelId}`);

      // Determine file type and content type
      const fileType = document.file_type === "pdf" ? "pdf" : "image";
      let contentType = "application/pdf";
      if (fileType === "image") {
        const lowerFileName = document.original_filename.toLowerCase();
        if (lowerFileName.endsWith(".png")) {
          contentType = "image/png";
        } else if (lowerFileName.match(/\.(jpg|jpeg)$/i)) {
          contentType = "image/jpeg";
        } else {
          contentType = "image/jpeg";
        }
      }

      // Get workflow_config_id from document if available
      // This references the Workflow table and contains the workflow configuration
      // Fallback to legacy workflow_id for backward compatibility during migration
      const workflowConfigId = document.workflow_config_id || undefined;
      if (workflowConfigId) {
        this.logger.log(
          `Document ${documentId} has workflow configuration ID: ${workflowConfigId}`,
        );
      } else {
        throw new BadRequestException(
          `Document ${documentId} missing workflow configuration ID`,
        );
      }

      const initialCtx: Record<string, unknown> = {
        documentId,
        blobKey: document.file_path,
        fileName: document.original_filename,
        fileType,
        contentType,
        modelId,
      };

      // Start Temporal graph workflow
      const workflowExecutionId =
        await this.temporalClientService.startGraphWorkflow(
          documentId,
          workflowConfigId,
          initialCtx,
        );

      // Update document with workflow configuration ID and Temporal workflow execution ID
      // Note: Status is set automatically by workflow pre-execution hook
      const updateResult = await this.databaseService.updateDocument(
        documentId,
        {
          workflow_config_id: workflowConfigId || undefined,
          workflow_execution_id: workflowExecutionId,
        },
      );

      this.logger.log(
        `Started OCR workflow for document ${documentId}, Temporal execution ID: ${workflowExecutionId}${workflowConfigId ? `, using workflow config: ${workflowConfigId}` : ", using default workflow"}`,
      );

      // Return the workflow execution ID
      // Status is set by workflow pre-execution hook
      return {
        apimRequestId:
          updateResult.workflow_execution_id || workflowExecutionId,
        workflowId: workflowExecutionId,
        status: DocumentStatus.ongoing_ocr,
      };
    } catch (error) {
      this.logger.error(`Error processing document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (document != null) {
        await this.databaseService.updateDocument(documentId, {
          status: DocumentStatus.failed,
        });
      }

      // Ensure error is a string for the response
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        status: DocumentStatus.failed,
        error: errorMessage,
      };
    }
  }
}
