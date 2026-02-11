import { DocumentStatus, OcrResult } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "fs/promises";
import { join } from "path";
import { DatabaseService } from "@/database/database.service";
import {
  AnalysisResponse,
  AnalysisResult,
  KeyValuePair,
} from "@/ocr/azure-types";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { WorkflowStepsConfig } from "@/workflow/workflow-types";

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
  ) {}

  /**
   * Sends a document to Azure for OCR processing via Temporal workflow.
   * @param documentId ID from documents table
   * @param steps Optional workflow steps configuration
   * @returns New status of document and workflow ID.
   */
  async requestOcr(
    documentId: string,
    steps?: WorkflowStepsConfig,
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
      // Resolve stored relative path to absolute (we only store relative paths)
      const filePath = join(process.cwd(), document.file_path);

      const fileBuffer = await readFile(filePath);
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Get model_id from document
      const modelId = document.model_id;
      this.logger.debug(`Document model_id: ${modelId}`);

      // Convert file buffer to base64
      const base64Data = fileBuffer.toString("base64");

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
      const workflowConfigId =
        document.workflow_config_id || document.workflow_id || undefined;
      if (workflowConfigId) {
        this.logger.log(
          `Document ${documentId} has workflow configuration ID: ${workflowConfigId}`,
        );
      } else {
        this.logger.log(
          `Document ${documentId} has no workflow configuration ID, using default workflow`,
        );
      }

      // Start Temporal workflow with modelId
      const workflowExecutionId =
        await this.temporalClientService.startOCRWorkflow(
          documentId,
          {
            binaryData: base64Data,
            fileName: document.original_filename,
            fileType: fileType,
            contentType: contentType,
            modelId: modelId,
          },
          steps, // Pass optional steps configuration (overridden by workflowConfigId if provided)
          workflowConfigId, // Pass workflow configuration ID from document
        );

      // Update document with workflow configuration ID and Temporal workflow execution ID
      const updateResult = await this.databaseService.updateDocument(
        documentId,
        {
          workflow_config_id: workflowConfigId || undefined,
          workflow_execution_id: workflowExecutionId,
          status: DocumentStatus.ongoing_ocr,
        },
      );

      this.logger.log(
        `Started OCR workflow for document ${documentId}, Temporal execution ID: ${workflowExecutionId}${workflowConfigId ? `, using workflow config: ${workflowConfigId}` : ", using default workflow"}`,
      );

      // Return the workflow execution ID
      return {
        apimRequestId:
          updateResult.workflow_execution_id || workflowExecutionId,
        workflowId: workflowExecutionId,
        status: updateResult.status,
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
