import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Document } from '../generated/client';
import { JsonValue } from '../generated/internal/prismaNamespace';
import { DocumentStatus } from '../generated/enums';
import { OcrResult } from '../ocr/ocr.service';

export type DocumentData = Omit<Document, 'ocr_results'>;

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private prisma: PrismaClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    this.logger.log('Database service initialized with Prisma');
  }

  async createDocument(data: Omit<DocumentData, 'id' | 'created_at' | 'updated_at'>): Promise<DocumentData> {
    this.logger.debug('=== DatabaseService.createDocument ===');
    this.logger.debug(`Creating document: ${data.title}`);

    try {
      const document = await this.prisma.document.create({
        data: {
          title: data.title,
          original_filename: data.original_filename,
          file_path: data.file_path,
          file_type: data.file_type,
          file_size: data.file_size,
          metadata: data.metadata,
          source: data.source,
          status: data.status as DocumentStatus,
        },
      });

      this.logger.debug(`Document created: ${document.id}`);
      this.logger.debug('=== DatabaseService.createDocument completed ===');

      return document;
    } catch (error) {
      this.logger.error(`Failed to create document: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug('=== DatabaseService.findDocument ===');
    this.logger.debug(`Finding document: ${id}`);

    try {
      const document = await this.prisma.document.findUnique({
        where: { id },
      });

      if (document) {
        this.logger.debug(`Document found: ${document.id}`);
      } else {
        this.logger.debug(`Document not found: ${id}`);
      }

      this.logger.debug('=== DatabaseService.findDocument completed ===');
      return document;
    } catch (error) {
      this.logger.error(`Failed to find document: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, 'id' | 'created_at'>>,
  ): Promise<DocumentData | null> {
    this.logger.debug('=== DatabaseService.updateDocument ===');
    this.logger.debug(`Updating document: ${id}`);
    this.logger.debug(`Update data: ${JSON.stringify(data, null, 2)}`);

    try {
      const document = await this.prisma.document.update({
        where: { id },
        data: {
          title: data.title,
          original_filename: data.original_filename,
          file_path: data.file_path,
          file_type: data.file_type,
          file_size: data.file_size,
          metadata: data.metadata,
          source: data.source,
          status: data.status as DocumentStatus,
          updated_at: new Date(),
        },
      });

      this.logger.debug(`Document updated: ${document.id}`);
      this.logger.debug('=== DatabaseService.updateDocument completed ===');

      return document;
    } catch (error) {
      if (error.code === 'P2025') {
        this.logger.debug(`Document not found for update: ${id}`);
        return null;
      }
      this.logger.error(`Failed to update document: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    this.logger.debug('=== DatabaseService.findOcrResult ===');
    this.logger.debug(`Finding OCR result for document: ${documentId}`);

    try {
      const ocrResult = await this.prisma.ocrResult.findFirst({
        where: { document_id: documentId },
        orderBy: { processed_at: 'desc' },
      });

      if (!ocrResult) {
        this.logger.debug(`No OCR result found for document: ${documentId}`);
        this.logger.debug('=== DatabaseService.findOcrResult completed ===');
        return null;
      }

      // Transform Prisma result to OcrResult interface
      const result: OcrResult = {
        documentId: ocrResult.document_id,
        status: ocrResult.status as 'success' | 'failed' | 'processing',
        extractedText: ocrResult.extracted_text || undefined,
        pages: (ocrResult.pages as unknown as OcrResult['pages']) || [],
        metadata: (ocrResult.metadata as Record<string, unknown>) || undefined,
        processedAt: ocrResult.processed_at,
      };

      this.logger.debug(`OCR result found for document: ${documentId}`);
      this.logger.debug('=== DatabaseService.findOcrResult completed ===');

      return result;
    } catch (error) {
      this.logger.error(`Failed to find OCR result: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createOcrResult(data: {
    documentId: string;
    status: string;
    extractedText?: string;
    pages: OcrResult['pages'];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.debug('=== DatabaseService.createOcrResult ===');
    this.logger.debug(`Creating OCR result for document: ${data.documentId}`);

    try {
      await this.prisma.ocrResult.create({
        data: {
          document_id: data.documentId,
          status: data.status,
          extracted_text: data.extractedText,
          pages: data.pages as unknown as JsonValue,
          metadata: data.metadata as unknown as JsonValue,
        },
      });

      this.logger.debug(`OCR result created for document: ${data.documentId}`);
      this.logger.debug('=== DatabaseService.createOcrResult completed ===');
    } catch (error) {
      this.logger.error(`Failed to create OCR result: ${error.message}`, error.stack);
      throw error;
    }
  }
}

