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
import { OcrResult } from "@/generated/client";
import { DocumentStatus } from "@/generated/enums";
import { AnalysisResult, KeyValuePair } from "@/ocr/azure-types";
import { TemporalClientService } from "@/temporal/temporal-client.service";

export interface OcrRequestResponse {
  status: DocumentStatus;
  workflowId?: string;
  apimRequestId?: string;
  error?: string; // Error message as string for serialization
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  // OCR result conversion constants
  private readonly OCR_CONSTANTS = {
    apiVersion: "2024-11-30",
    stringIndexType: "textElements",
    contentFormat: "text",
  } as const;

  // Retry configuration for waiting for workflow results
  private readonly RETRY_CONFIG = {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 2000,
    backoffMultiplier: 1.5,
  };

  constructor(
    _configService: ConfigService,
    private databaseService: DatabaseService,
    private temporalClientService: TemporalClientService,
  ) {}

  /**
   * Sends a document to Azure for OCR processing via Temporal workflow.
   * @param documentId ID from documents table
   * @returns New status of document and workflow ID.
   */
  async requestOcr(documentId: string): Promise<OcrRequestResponse> {
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

      // Convert file to base64
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

      // Get model_id from document (for future use when Temporal workflow supports it)
      const modelId = document.model_id;
      this.logger.debug(`Document model_id: ${modelId}`);

      // Start Temporal workflow
      // NOTE: Currently the Temporal workflow hardcodes "prebuilt-layout" model.
      // The workflow needs to be updated to accept and use model_id from the document.
      const workflowId = await this.temporalClientService.startOCRWorkflow(
        documentId,
        {
          binaryData: base64Data,
          fileName: document.original_filename,
          fileType: fileType,
          contentType: contentType,
        },
      );

      // Update document with workflow ID
      const updateResult = await this.databaseService.updateDocument(
        documentId,
        {
          workflow_id: workflowId,
          status: DocumentStatus.ongoing_ocr,
        },
      );

      this.logger.debug(
        `Started OCR workflow for document ${documentId}, workflowId: ${workflowId}`,
      );

      // Return the workflow ID
      return {
        workflowId: updateResult.workflow_id || workflowId,
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

  /**
   * Converts database OCR result to AnalysisResult format
   * @param ocrResult Database OCR result
   * @param modelId Model ID from document (optional, defaults to prebuilt-layout)
   * @returns AnalysisResult formatted for API response
   */
  private convertDbResultToAnalysisResult(
    ocrResult: OcrResult,
    modelId?: string,
  ): AnalysisResult {
    // The simplified schema only stores keyValuePairs, so we need to reconstruct
    // a minimal AnalysisResult for backward compatibility
    const keyValuePairs =
      (ocrResult.keyValuePairs as unknown as KeyValuePair[]) || [];

    // Extract content from the OCR result
    // Support both test mocks (extracted_text) and real data (keyValuePairs._content)
    let content = "";

    // Type for OCR result with possible extracted_text field (used in tests)
    type OcrResultWithExtractedText = OcrResult & {
      extracted_text?: string;
    };

    // Check for extracted_text (used in tests)
    const ocrResultWithText = ocrResult as OcrResultWithExtractedText;
    if (
      ocrResultWithText.extracted_text &&
      typeof ocrResultWithText.extracted_text === "string"
    ) {
      content = ocrResultWithText.extracted_text;
    } else if (
      ocrResult.keyValuePairs &&
      typeof ocrResult.keyValuePairs === "object"
    ) {
      // Check if content is stored as a special field in keyValuePairs
      // Type for keyValuePairs object that might contain _content
      type KeyValuePairsWithContent = {
        _content?: string | { content?: string };
        [key: string]: unknown;
      };

      const kvpObj = ocrResult.keyValuePairs as KeyValuePairsWithContent;
      if (kvpObj._content && typeof kvpObj._content === "string") {
        content = kvpObj._content;
      } else if (
        kvpObj._content &&
        typeof kvpObj._content === "object" &&
        "content" in kvpObj._content &&
        typeof kvpObj._content.content === "string"
      ) {
        content = kvpObj._content.content;
      }
    }

    return {
      apiVersion: this.OCR_CONSTANTS.apiVersion,
      modelId: modelId || "prebuilt-layout",
      stringIndexType: this.OCR_CONSTANTS.stringIndexType,
      content: content,
      contentFormat: this.OCR_CONSTANTS.contentFormat,
      pages: [],
      tables: [],
      paragraphs: [],
      styles: [],
      sections: [],
      figures: [],
      keyValuePairs: keyValuePairs,
    };
  }

  /**
   * Checks if an error is a Temporal client error
   * @param error Error to check
   * @returns true if error is related to Temporal client unavailability
   */
  private isTemporalUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes("temporal client not initialized") ||
      message.includes("failed to get workflow status") ||
      message.includes("failed to query workflow")
    );
  }

  /**
   * Waits for OCR results to appear in database with exponential backoff
   * @param documentId Document ID to check
   * @returns OCR result if found, null otherwise
   */
  private async waitForResultsInDatabase(
    documentId: string,
  ): Promise<OcrResult | null> {
    let delay: number = this.RETRY_CONFIG.initialDelayMs;

    for (let attempt = 0; attempt < this.RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const result = await this.databaseService.findOcrResult(documentId);
        if (result) {
          this.logger.debug(
            `OCR results found in database after ${attempt + 1} attempt(s) for document ${documentId}`,
          );
          return result;
        }
      } catch (error) {
        // NotFoundException is expected if results aren't ready yet
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }

      if (attempt < this.RETRY_CONFIG.maxRetries - 1) {
        this.logger.debug(
          `Waiting ${delay}ms before retry ${attempt + 2}/${this.RETRY_CONFIG.maxRetries} for document ${documentId}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(
          delay * this.RETRY_CONFIG.backoffMultiplier,
          this.RETRY_CONFIG.maxDelayMs,
        );
      }
    }

    return null;
  }

  /**
   * Retrieves the results of an Azure OCR request.
   * Database-first approach: checks database first, then Temporal if needed.
   * Uses Temporal queries for better status information when available.
   * @param documentId ID from documents table
   * @returns The AnalysisResult of OCR processing.
   * @throws NotFoundException if document not found
   * @throws BadRequestException if document hasn't been sent for OCR
   * @throws ServiceUnavailableException if OCR is still processing
   */
  async retrieveOcrResults(documentId: string): Promise<AnalysisResult> {
    // Get document from database
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`,
      );
    }

    // First, check if OCR results exist in database
    try {
      const ocrResult = await this.databaseService.findOcrResult(documentId);
      if (ocrResult != null) {
        this.logger.debug(
          `OCR results found in database for document ${documentId}`,
        );
        return this.convertDbResultToAnalysisResult(
          ocrResult,
          document.model_id,
        );
      }
    } catch (error) {
      // NotFoundException is expected if results don't exist yet
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    // OCR results not in database - check workflow status
    const workflowId = document.workflow_id;
    if (!workflowId) {
      // Document was never sent for OCR or doesn't have a workflow
      if (
        document.status === DocumentStatus.pre_ocr ||
        document.status === DocumentStatus.failed
      ) {
        throw new BadRequestException(
          `Document ID ${documentId} has not yet been sent for OCR or processing failed.`,
        );
      }
      throw new BadRequestException(
        `Document ID ${documentId} does not have an associated workflow.`,
      );
    }

    try {
      // Get basic workflow status first (required for state determination)
      const workflowStatus =
        await this.temporalClientService.getWorkflowStatus(workflowId);

      // Get detailed query status only if workflow is running or failed
      // (for better error messages and progress info)
      let workflowQueryStatus = null;
      if (
        workflowStatus.status === "RUNNING" ||
        workflowStatus.status === "FAILED"
      ) {
        try {
          workflowQueryStatus =
            await this.temporalClientService.queryWorkflowStatus(workflowId);
        } catch (queryError) {
          // Query is optional - log but continue with basic status
          this.logger.debug(
            `Could not get detailed workflow status: ${queryError.message}`,
          );
        }
      }

      if (workflowStatus.status === "COMPLETED") {
        // Workflow completed - results should be in DB soon
        // Use exponential backoff to wait for results
        this.logger.debug(
          `Workflow ${workflowId} completed, waiting for results in database...`,
        );

        const retryResult = await this.waitForResultsInDatabase(documentId);
        if (retryResult != null) {
          return this.convertDbResultToAnalysisResult(
            retryResult,
            document.model_id,
          );
        }

        throw new ServiceUnavailableException(
          `Workflow ${workflowId} completed but OCR results not found in database. The results may still be processing.`,
        );
      } else if (workflowStatus.status === "RUNNING") {
        // Workflow still running - provide detailed status if available
        const statusMessage = workflowQueryStatus
          ? `OCR processing is in progress for document ID ${documentId}. Current step: ${workflowQueryStatus.currentStep}. Retry ${workflowQueryStatus.retryCount}/${workflowQueryStatus.maxRetries}.`
          : `OCR processing is still in progress for document ID ${documentId}. Please try again later.`;

        throw new ServiceUnavailableException(statusMessage);
      } else if (workflowStatus.status === "FAILED") {
        // Workflow failed - update database status if not already updated
        if (document.status !== DocumentStatus.failed) {
          await this.databaseService.updateDocument(documentId, {
            status: DocumentStatus.failed,
          });
        }

        const errorMessage = workflowQueryStatus?.error
          ? `OCR processing failed for document ID ${documentId}. Error: ${workflowQueryStatus.error}`
          : `OCR processing failed for document ID ${documentId}. Workflow status: ${workflowStatus.status}`;

        throw new ServiceUnavailableException(errorMessage);
      } else {
        // Unknown status
        throw new ServiceUnavailableException(
          `OCR processing has unknown status for document ID ${documentId}. Workflow status: ${workflowStatus.status}`,
        );
      }
    } catch (error) {
      // If Temporal is unavailable, check if we can still get results from DB
      if (this.isTemporalUnavailableError(error)) {
        this.logger.warn(
          `Temporal unavailable, checking database again for document ${documentId}`,
        );
        try {
          const fallbackResult =
            await this.databaseService.findOcrResult(documentId);
          if (fallbackResult != null) {
            return this.convertDbResultToAnalysisResult(
              fallbackResult,
              document.model_id,
            );
          }
        } catch (dbError) {
          // If database also fails, log and continue to throw original error
          this.logger.error(
            `Database fallback also failed: ${dbError.message}`,
          );
        }
      }

      // Re-throw if it's already a NestJS exception
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      // Wrap other errors in ServiceUnavailableException
      throw new ServiceUnavailableException(
        `Failed to retrieve OCR results for document ${documentId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
