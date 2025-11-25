import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OcrService } from "../ocr/ocr.service";
import { DatabaseService } from "../database/database.service";
import { DocumentStatus } from "../generated/enums";

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
  private readonly rabbitmqUrl: string;
  private readonly exchangeName: string;
  private readonly routingKey: string;

  constructor(
    private configService: ConfigService,
    private ocrService: OcrService,
    private databaseService: DatabaseService,
  ) {
    this.rabbitmqUrl =
      this.configService.get<string>("RABBITMQ_URL") || "amqp://localhost:5672";
    this.exchangeName =
      this.configService.get<string>("RABBITMQ_EXCHANGE") || "document_upload";
    this.routingKey =
      this.configService.get<string>("RABBITMQ_ROUTING_KEY") ||
      "document.uploaded";
    this.logger.log(`RabbitMQ URL: ${this.rabbitmqUrl}`);
    this.logger.log(
      `Exchange: ${this.exchangeName}, Routing Key: ${this.routingKey}`,
    );
  }

  async publishDocumentUploaded(message: QueueMessage): Promise<boolean> {
    this.logger.debug("=== QueueService.publishDocumentUploaded ===");
    this.logger.debug(`Processing document for OCR: ${message.documentId}`);

    try {
      // Start OCR processing immediately instead of queuing
      await this.processOcrForDocument(message);
      this.logger.debug(
        "=== QueueService.publishDocumentUploaded completed ===",
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to process OCR for document ${message.documentId}: ${error.message}`,
      );
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Process OCR for a document directly (simple implementation)
   */
  private async processOcrForDocument(message: QueueMessage): Promise<void> {
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
          continue;
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
          continue;
        } else {
          // Other error, fail immediately
          throw error;
        }
      }
    }

    throw new Error(`OCR processing timed out after ${maxAttempts} attempts`);
  }

  async connect(): Promise<void> {
    this.logger.debug("=== QueueService.connect (STUBBED) ===");
    this.logger.debug(`Would connect to RabbitMQ at: ${this.rabbitmqUrl}`);
    // Stubbed - in real implementation would establish connection
  }

  async disconnect(): Promise<void> {
    this.logger.debug("=== QueueService.disconnect (STUBBED) ===");
    this.logger.debug("Would disconnect from RabbitMQ");
    // Stubbed - in real implementation would close connection
  }
}
