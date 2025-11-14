import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService, DocumentData } from '../database/database.service';

export interface UploadedDocument {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, any>;
  source: string;
  status: 'pending' | 'processed' | 'failed';
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly storagePath: string;

  constructor(
    private databaseService: DatabaseService,
    private configService: ConfigService,
  ) {
    this.storagePath =
      this.configService.get<string>('STORAGE_PATH') ||
      join(process.cwd(), 'storage', 'documents');
    this.ensureStorageDirectory();
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      if (!existsSync(this.storagePath)) {
        await mkdir(this.storagePath, { recursive: true });
        this.logger.log(`Created storage directory: ${this.storagePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create storage directory: ${error.message}`);
      throw error;
    }
  }

  private getFileExtension(fileType: string): string {
    const typeMap: Record<string, string> = {
      pdf: 'pdf',
      image: 'jpg',
      scan: 'pdf',
    };
    return typeMap[fileType.toLowerCase()] || 'bin';
  }

  private generateFileName(originalFilename: string, fileType: string): string {
    const extension = this.getFileExtension(fileType);
    const uuid = uuidv4();
    const sanitizedOriginal = originalFilename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 50);
    return `${uuid}_${sanitizedOriginal}.${extension}`;
  }

  async uploadDocument(
    title: string,
    fileBase64: string,
    fileType: string,
    originalFilename: string,
    metadata?: Record<string, any>,
  ): Promise<UploadedDocument> {
    this.logger.debug('=== DocumentService.uploadDocument ===');
    this.logger.debug(`Title: ${title}, FileType: ${fileType}, OriginalFilename: ${originalFilename}`);

    try {
      // Decode base64 file
      let fileBuffer: Buffer;
      try {
        // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
        const base64Data = fileBase64.includes(',')
          ? fileBase64.split(',')[1]
          : fileBase64;
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch (error) {
        this.logger.error(`Failed to decode base64 file: ${error.message}`);
        throw new Error('Invalid base64 file data');
      }

      const fileSize = fileBuffer.length;
      this.logger.debug(`Decoded file size: ${fileSize} bytes`);

      // Generate unique filename and path
      const fileName = this.generateFileName(originalFilename, fileType);
      const filePath = join(this.storagePath, fileName);

      // Ensure storage directory exists
      await this.ensureStorageDirectory();

      // Save file to filesystem
      await writeFile(filePath, fileBuffer);
      this.logger.debug(`File saved to: ${filePath}`);

      // Store metadata in database via API
      const documentData: Omit<DocumentData, 'id' | 'created_at' | 'updated_at'> = {
        title,
        original_filename: originalFilename,
        file_path: filePath,
        file_type: fileType,
        file_size: fileSize,
        metadata: metadata || {},
        source: 'api',
        status: 'pending',
      };

      const savedDocument = await this.databaseService.createDocument(documentData);
      this.logger.debug(`Document saved to database: ${savedDocument.id}`);

      const result: UploadedDocument = {
        id: savedDocument.id!,
        title: savedDocument.title,
        original_filename: savedDocument.original_filename,
        file_path: savedDocument.file_path,
        file_type: savedDocument.file_type,
        file_size: savedDocument.file_size,
        metadata: savedDocument.metadata,
        source: savedDocument.source,
        status: savedDocument.status,
        created_at: savedDocument.created_at || new Date(),
        updated_at: savedDocument.updated_at || new Date(),
      };

      this.logger.debug('=== DocumentService.uploadDocument completed ===');
      return result;
    } catch (error) {
      this.logger.error(`Error uploading document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  async getDocument(id: string): Promise<UploadedDocument | null> {
    this.logger.debug(`DocumentService.getDocument: ${id}`);
    const document = await this.databaseService.findDocument(id);
    if (!document) {
      return null;
    }

    return {
      id: document.id!,
      title: document.title,
      original_filename: document.original_filename,
      file_path: document.file_path,
      file_type: document.file_type,
      file_size: document.file_size,
      metadata: document.metadata,
      source: document.source,
      status: document.status,
      created_at: document.created_at || new Date(),
      updated_at: document.updated_at || new Date(),
    };
  }
}

