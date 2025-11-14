import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { DatabaseService, DocumentData } from '../database/database.service';
import { OcrResult } from '../ocr/ocr.service';

@Controller('api')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get('protected')
  getProtectedData(@Req() req: Request): {
    message: string;
    user: {
      idirUsername?: string;
      displayName?: string;
      email?: string;
    };
  } {
    const user = req.user; // Contains decoded token
    return {
      message: 'Protected data',
      user: {
        idirUsername: user?.idir_username,
        displayName: user?.display_name,
        email: user?.email,
      }
    };
  }

  @Get('admin')
  @Roles('admin')
  getAdminData(@Req() req: Request): {
    message: string;
    user: {
      idirUsername?: string;
      displayName?: string;
      email?: string;
      roles: string[];
    };
  } {
    const user = req.user;
    return {
      message: 'Admin only data',
      user: {
        idirUsername: user?.idir_username,
        displayName: user?.display_name,
        email: user?.email,
        roles: user?.roles || [],
      }
    };
  }

  @Get('documents')
  @HttpCode(HttpStatus.OK)
  async getAllDocuments(): Promise<DocumentData[]> {
    this.logger.debug('=== DocumentController.getAllDocuments ===');

    try {
      const documents = await this.databaseService.findAllDocuments();

      this.logger.debug(`Retrieved ${documents.length} documents`);
      this.logger.debug('=== DocumentController.getAllDocuments completed ===');

      return documents;
    } catch (error) {
      this.logger.error(`Error retrieving documents: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      throw new NotFoundException(
        error.message || 'Failed to retrieve documents',
      );
    }
  }

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

