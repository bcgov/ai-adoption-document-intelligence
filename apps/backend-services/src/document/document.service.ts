import { DocumentStatus, Prisma } from "@generated/client";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DatabaseService, DocumentData } from "../database/database.service";

export interface UploadedDocument {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown>;
  source: string;
  status: DocumentStatus;
  created_at: Date;
  updated_at: Date;
  model_id: string;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private databaseService: DatabaseService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
  ) {}

  private getFileExtension(fileType: string): string {
    const typeMap: Record<string, string> = {
      pdf: "pdf",
      image: "jpg",
      scan: "pdf",
    };
    return typeMap[fileType.toLowerCase()] || "bin";
  }

  async uploadDocument(
    title: string,
    fileBase64: string,
    fileType: string,
    originalFilename: string,
    modelId: string,
    metadata?: Record<string, unknown>,
    workflowId?: string,
  ): Promise<UploadedDocument> {
    this.logger.debug("=== DocumentService.uploadDocument ===");
    this.logger.debug(
      `Title: ${title}, FileType: ${fileType}, OriginalFilename: ${originalFilename}`,
    );

    try {
      // Decode base64 file
      let fileBuffer: Buffer;
      try {
        // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
        const base64Data = fileBase64.includes(",")
          ? fileBase64.split(",")[1]
          : fileBase64;
        fileBuffer = Buffer.from(base64Data, "base64");
      } catch (error) {
        this.logger.error(`Failed to decode base64 file: ${error.message}`);
        throw new Error("Invalid base64 file data");
      }

      const fileSize = fileBuffer.length;
      this.logger.debug(`Decoded file size: ${fileSize} bytes`);

      const documentId = uuidv4();
      const extension = this.getFileExtension(fileType);
      const blobKey = `documents/${documentId}/original.${extension}`;

      await this.blobStorage.write(blobKey, fileBuffer);
      this.logger.debug(`File saved to blob storage: ${blobKey}`);

      // Store metadata in database via API
      const documentData: Omit<DocumentData, "created_at" | "updated_at"> = {
        id: documentId,
        title,
        original_filename: originalFilename,
        file_path: blobKey,
        file_type: fileType,
        file_size: fileSize,
        metadata: (metadata || {}) as Prisma.JsonValue,
        source: "api",
        status: DocumentStatus.ongoing_ocr,
        apim_request_id: null,
        workflow_id: workflowId || null, // Legacy field, kept for backward compatibility
        workflow_config_id: workflowId || null, // New field for workflow configuration ID
        workflow_execution_id: null, // Will be set when workflow starts
        model_id: modelId,
      };

      const savedDocument =
        await this.databaseService.createDocument(documentData);
      this.logger.debug(`Document saved to database: ${savedDocument.id}`);

      const result: UploadedDocument = {
        id: savedDocument.id!,
        title: savedDocument.title,
        original_filename: savedDocument.original_filename,
        file_path: savedDocument.file_path,
        file_type: savedDocument.file_type,
        file_size: savedDocument.file_size,
        metadata: savedDocument.metadata as Record<string, unknown>,
        source: savedDocument.source,
        status: savedDocument.status,
        created_at: savedDocument.created_at || new Date(),
        updated_at: savedDocument.updated_at || new Date(),
        model_id: savedDocument.model_id,
      };

      this.logger.debug("=== DocumentService.uploadDocument completed ===");
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
      metadata: document.metadata as Record<string, unknown>,
      source: document.source,
      status: document.status,
      created_at: document.created_at || new Date(),
      updated_at: document.updated_at || new Date(),
      model_id: document.model_id,
    };
  }
}
