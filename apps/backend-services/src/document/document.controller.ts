import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OcrResult } from '../ocr/ocr.service';

@Controller('api')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get('documents/:documentId/ocr')
  @HttpCode(HttpStatus.OK)
  async getOcrResult(@Param('documentId') documentId: string): Promise<OcrResult> {
    this.logger.debug(`=== DocumentController.getOcrResult ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    try {
      const ocrResult = await this.databaseService.findOcrResult(documentId);

      if (!ocrResult) {
        this.logger.warn(`OCR result not found for document: ${documentId}`);
        throw new NotFoundException(`OCR result not found for document: ${documentId}`);
      }

      this.logger.debug(`OCR result retrieved successfully for document: ${documentId}`);
      this.logger.debug('=== DocumentController.getOcrResult completed ===');

      return ocrResult as OcrResult;
    } catch (error) {
      this.logger.error(`Error retrieving OCR result: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new NotFoundException(
        error.message || `Failed to retrieve OCR result for document: ${documentId}`,
      );
    }
  }
}

