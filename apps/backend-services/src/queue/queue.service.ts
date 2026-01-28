import { Injectable, Logger } from "@nestjs/common";
import { OcrService } from "../ocr/ocr.service";

export interface QueueMessage {
  documentId: string;
  filePath: string;
  fileType: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Queue Service for processing OCR documents via Temporal workflows
 * This service delegates OCR processing to Temporal workflows which handle
 * all polling, retries, and status management automatically.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private ocrService: OcrService) {}

  /**
   * Process OCR for a document using Temporal workflow
   * The workflow handles all polling, retries, and status updates automatically
   */
  async processOcrForDocument(message: QueueMessage): Promise<void> {
    this.logger.log(
      `Starting OCR processing for document ${message.documentId} via Temporal workflow`,
    );

    try {
      // Request OCR - this will start a Temporal workflow that handles
      // all the polling, retries, and status updates automatically
      const ocrRequest = await this.ocrService.requestOcr(message.documentId);

      if (ocrRequest.error) {
        this.logger.error(
          `Failed to start OCR workflow for document ${message.documentId}: ${ocrRequest.error}`,
        );
        throw new Error(`OCR workflow failed to start: ${ocrRequest.error}`);
      }

      this.logger.log(
        `OCR workflow started for document ${message.documentId}, workflowId: ${ocrRequest.workflowId}`,
      );

      // The workflow will handle everything asynchronously:
      // - Submitting to Azure OCR
      // - Polling for results
      // - Storing results in database
      // - Updating document status
      // No need to wait or poll here - Temporal handles it all
    } catch (error) {
      this.logger.error(
        `Failed to process OCR for document ${message.documentId}: ${error.message}`,
      );
      throw error;
    }
  }
}
