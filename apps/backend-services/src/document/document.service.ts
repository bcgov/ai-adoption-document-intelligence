import { DocumentStatus, OcrResult, Prisma } from "@generated/client";
import { Inject, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AppLoggerService } from "../logging/app-logger.service";
import { DocumentDbService } from "./document-db.service";
import type { DocumentData } from "./document-db.types";

export type { DocumentData };

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
  group_id: string;
}

@Injectable()
export class DocumentService {
  constructor(
    private readonly documentDb: DocumentDbService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
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
    groupId: string,
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
        group_id: groupId,
      };

      const savedDocument = await this.documentDb.createDocument(documentData);
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
        group_id: savedDocument.group_id,
      };

      this.logger.debug("=== DocumentService.uploadDocument completed ===");
      return result;
    } catch (error) {
      this.logger.error(`Error uploading document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Updates a document with the provided fields.
   *
   * @param id - The document ID.
   * @param data - Fields to update.
   * @returns The updated document record, or `null` if not found.
   */
  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    this.logger.debug(`DocumentService.updateDocument: ${id}`);
    return this.documentDb.updateDocument(id, data);
  }

  /**
   * Deletes a document and its associated blob storage file.
   *
   * @param id - The document ID.
   * @returns `true` if deleted, `false` if not found.
   */
  async deleteDocument(id: string): Promise<boolean> {
    this.logger.debug(`DocumentService.deleteDocument: ${id}`);
    const document = await this.documentDb.findDocument(id);
    if (!document) {
      return false;
    }
    await this.documentDb.deleteDocument(id);
    try {
      await this.blobStorage.delete(document.file_path);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blob for document ${id}: ${(error as Error).message}`,
      );
    }
    return true;
  }

  /**
   * Finds a document by its ID and returns the raw database record.
   *
   * @param id - The unique identifier of the document.
   * @returns The document record, or `null` if not found.
   */
  async findDocument(id: string): Promise<DocumentData | null> {
    return this.documentDb.findDocument(id);
  }

  /**
   * Returns all documents, optionally filtered by group IDs.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @returns Array of matching document records.
   */
  async findAllDocuments(groupIds?: string[]): Promise<DocumentData[]> {
    return this.documentDb.findAllDocuments(groupIds);
  }

  /**
   * Returns the most recent OCR result for a document.
   *
   * @param documentId - The document ID.
   * @returns The OCR result, or `null` if none exists.
   */
  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    return this.documentDb.findOcrResult(documentId);
  }
}
