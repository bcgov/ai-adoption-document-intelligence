import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus, OcrResult, Prisma } from "@generated/client";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AppLoggerService } from "../logging/app-logger.service";
import { DocumentDbService } from "./document-db.service";
import type { DocumentData } from "./document-db.types";
import { extensionForOriginalBlob } from "./original-blob-key.util";
import {
  PdfNormalizationError,
  PdfNormalizationService,
} from "./pdf-normalization.service";

export type { DocumentData };

export interface UploadedDocument {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  normalized_file_path: string | null;
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

export type UploadDocumentResult =
  | { kind: "success"; document: UploadedDocument }
  | { kind: "conversion_failed"; document: UploadedDocument };

@Injectable()
export class DocumentService {
  constructor(
    private readonly documentDb: DocumentDbService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly pdfNormalization: PdfNormalizationService,
    private readonly logger: AppLoggerService,
  ) {}

  private toUploadedDocument(saved: DocumentData): UploadedDocument {
    return {
      id: saved.id!,
      title: saved.title,
      original_filename: saved.original_filename,
      file_path: saved.file_path,
      normalized_file_path: saved.normalized_file_path ?? null,
      file_type: saved.file_type,
      file_size: saved.file_size,
      metadata: saved.metadata as Record<string, unknown>,
      source: saved.source,
      status: saved.status,
      created_at: saved.created_at || new Date(),
      updated_at: saved.updated_at || new Date(),
      model_id: saved.model_id,
      group_id: saved.group_id,
    };
  }

  /**
   * Creates a document record directly in the database without uploading a file.
   * Use this when the file has already been written to blob storage.
   *
   * @param data - Document data without auto-generated timestamps.
   * @param tx - Optional transaction client for atomic operations.
   * @returns The created document record.
   */
  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentData> {
    this.logger.debug(`DocumentService.createDocument: ${data.id}`);
    return this.documentDb.createDocument(data, tx);
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
  ): Promise<UploadDocumentResult> {
    this.logger.debug("=== DocumentService.uploadDocument ===");
    this.logger.debug(
      `Title: ${title}, FileType: ${fileType}, OriginalFilename: ${originalFilename}`,
    );

    try {
      let fileBuffer: Buffer;
      try {
        const base64Data = fileBase64.includes(",")
          ? fileBase64.split(",")[1]
          : fileBase64;
        fileBuffer = Buffer.from(base64Data, "base64");
      } catch (error) {
        this.logger.error(
          `Failed to decode base64 file: ${getErrorMessage(error)}`,
        );
        throw new Error("Invalid base64 file data");
      }

      const fileSize = fileBuffer.length;
      this.logger.debug(`Decoded file size: ${fileSize} bytes`);

      await this.pdfNormalization.validateForUpload(fileBuffer, fileType);

      const documentId = uuidv4();
      const extension = extensionForOriginalBlob(originalFilename, fileType);
      const blobKey = `documents/${documentId}/original.${extension}`;

      await this.blobStorage.write(blobKey, fileBuffer);
      this.logger.debug(`File saved to blob storage: ${blobKey}`);

      const normalizedKey = `documents/${documentId}/normalized.pdf`;
      try {
        const pdfBuffer = await this.pdfNormalization.normalizeToPdf(
          fileBuffer,
          fileType,
        );
        await this.blobStorage.write(normalizedKey, pdfBuffer);
      } catch (e) {
        if (e instanceof BadRequestException) {
          throw e;
        }
        if (!(e instanceof PdfNormalizationError)) {
          this.logger.error(
            `Unexpected normalization error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        const failedDoc: Omit<DocumentData, "created_at" | "updated_at"> = {
          id: documentId,
          title,
          original_filename: originalFilename,
          file_path: blobKey,
          normalized_file_path: null,
          file_type: fileType,
          file_size: fileSize,
          metadata: (metadata || {}) as Prisma.JsonValue,
          source: "api",
          status: DocumentStatus.conversion_failed,
          apim_request_id: null,
          workflow_id: workflowId || null,
          workflow_config_id: workflowId || null,
          workflow_execution_id: null,
          model_id: modelId,
          group_id: groupId,
        };

        const saved = await this.documentDb.createDocument(failedDoc);
        this.logger.warn(
          `Document ${saved.id} stored but PDF normalization failed`,
        );
        return {
          kind: "conversion_failed",
          document: this.toUploadedDocument(saved),
        };
      }

      const documentData: Omit<DocumentData, "created_at" | "updated_at"> = {
        id: documentId,
        title,
        original_filename: originalFilename,
        file_path: blobKey,
        normalized_file_path: normalizedKey,
        file_type: fileType,
        file_size: fileSize,
        metadata: (metadata || {}) as Prisma.JsonValue,
        source: "api",
        status: DocumentStatus.ongoing_ocr,
        apim_request_id: null,
        workflow_id: workflowId || null,
        workflow_config_id: workflowId || null,
        workflow_execution_id: null,
        model_id: modelId,
        group_id: groupId,
      };

      const savedDocument = await this.documentDb.createDocument(documentData);
      this.logger.debug(`Document saved to database: ${savedDocument.id}`);

      this.logger.debug("=== DocumentService.uploadDocument completed ===");
      return {
        kind: "success",
        document: this.toUploadedDocument(savedDocument),
      };
    } catch (error) {
      this.logger.error(`Error uploading document: ${getErrorMessage(error)}`);
      this.logger.error(`Stack: ${getErrorStack(error)}`);
      throw error;
    }
  }

  /**
   * Updates a document with the provided fields.
   *
   * @param id - The document ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client for atomic operations.
   * @returns The updated document record, or `null` if not found.
   */
  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentData | null> {
    this.logger.debug(`DocumentService.updateDocument: ${id}`);
    return this.documentDb.updateDocument(id, data, tx);
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
      await this.blobStorage.deleteByPrefix(`documents/${id}/`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blobs for document ${id}: ${(error as Error).message}`,
      );
    }
    return true;
  }

  /**
   * Finds a document by its ID and returns the raw database record.
   *
   * @param id - The unique identifier of the document.
   * @param tx - Optional transaction client for atomic operations.
   * @returns The document record, or `null` if not found.
   */
  async findDocument(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentData | null> {
    return this.documentDb.findDocument(id, tx);
  }

  /**
   * Returns all documents, optionally filtered by group IDs.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @param tx - Optional transaction client for atomic operations.
   * @returns Array of matching document records.
   */
  async findAllDocuments(
    groupIds?: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentData[]> {
    return this.documentDb.findAllDocuments(groupIds, tx);
  }

  /**
   * Returns the most recent OCR result for a document.
   *
   * @param documentId - The document ID.
   * @param tx - Optional transaction client for atomic operations.
   * @returns The OCR result, or `null` if none exists.
   */
  async findOcrResult(
    documentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OcrResult | null> {
    return this.documentDb.findOcrResult(documentId, tx);
  }
}
