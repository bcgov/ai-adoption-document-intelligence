import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { DocumentStatus } from "../generated/enums";
import { OcrService } from "../ocr/ocr.service";

export interface QueueMessage {
  documentId: string;
  filePath: string;
  fileType: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private ocrService: OcrService,
    private databaseService: DatabaseService,
  ) {}

  /**
   * Process OCR for a document directly (simple implementation)
   */
  async processOcrForDocument(message: QueueMessage): Promise<void> {
    this.logger.debug(
      `=== Starting OCR processing for document ${message.documentId} ===`,
    );

    try {
      // Step 1: Request OCR from Azure
      this.logger.debug(
        `Requesting OCR from Azure for document ${message.documentId}`,
      );
      const ocrRequest = await this.ocrService.requestOcr(message.documentId);
      this.logger.debug(
        `OCR request sent. Status: ${ocrRequest.status}, APIM Request ID: ${ocrRequest.apimRequestId}`,
      );

      if (ocrRequest.status === DocumentStatus.failed) {
        throw new Error(`OCR request failed: ${ocrRequest.error}`);
      }

      // Step 2: Poll for OCR results (simplified - in production you'd want better polling logic)
      this.logger.debug(`Waiting for OCR results...`);
      await this.waitForOcrCompletion(message.documentId);

      this.logger.debug(
        `=== OCR processing completed for document ${message.documentId} ===`,
      );
    } catch (error) {
      this.logger.error(
        `OCR processing failed for document ${message.documentId}: ${error.message}`,
      );
      // Update document status to failed
      await this.databaseService.updateDocument(message.documentId, {
        status: DocumentStatus.failed,
      });
      throw error;
    }
  }

  /**
   * Wait for OCR completion by polling Azure (simplified polling)
   */
  private async waitForOcrCompletion(
    documentId: string,
    maxAttempts: number = 30,
    delayMs: number = 2000,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.debug(
          `Polling OCR results attempt ${attempt}/${maxAttempts} for document ${documentId}`,
        );

        // Try to retrieve OCR results
        const ocrResults = await this.ocrService.retrieveOcrResults(documentId);

        if (ocrResults && ocrResults.content) {
          this.logger.debug(
            `OCR results retrieved successfully for document ${documentId}`,
          );
          this.logger.debug(`OCR content length: ${ocrResults.content.length}`);
          // Update document status to completed
          await this.databaseService.updateDocument(documentId, {
            status: DocumentStatus.completed_ocr,
          });
          return;
        } else {
          // Either null (processing running) or no valid results yet
          this.logger.debug(
            `OCR results not ready yet for document ${documentId} (results: ${ocrResults}), will retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        if (
          error.message.includes("not yet been sent for OCR") ||
          error.message.includes("Failed to retrieve OCR results")
        ) {
          // OCR still processing, wait and try again
          this.logger.debug(
            `OCR still processing, waiting... (${error.message})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          // Other error, fail immediately
          throw error;
        }
      }
    }

    throw new Error(`OCR processing timed out after ${maxAttempts} attempts`);
  }

}
