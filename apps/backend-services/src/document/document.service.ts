import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus, OcrResult, Prisma } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  buildBlobFilePath,
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AppLoggerService } from "../logging/app-logger.service";
import { UploadNormalizationLimiter } from "../upload/upload-normalization-limiter";
import { computeContentHash } from "./content-hash.util";
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
  content_hash: string;
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
  | {
      kind: "conversion_failed";
      document: UploadedDocument;
      /** Machine-readable failure reason, e.g. `password_protected`. */
      code: string;
      /** Human-readable reason surfaced to the upload caller. */
      reason: string;
    };

@Injectable()
export class DocumentService {
  constructor(
    private readonly documentDb: DocumentDbService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly pdfNormalization: PdfNormalizationService,
    private readonly uploadNormalizationLimiter: UploadNormalizationLimiter,
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
      content_hash: saved.content_hash!,
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
    data: Omit<DocumentData, "created_at" | "updated_at" | "purged_at">,
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
        throw new BadRequestException("Invalid base64 file data");
      }

      const fileSize = fileBuffer.length;
      this.logger.debug(`Decoded file size: ${fileSize} bytes`);

      const contentHash = computeContentHash(fileBuffer);

      await this.pdfNormalization.validateForUpload(fileBuffer, fileType);

      const documentId = uuidv4();
      const extension = extensionForOriginalBlob(originalFilename, fileType);
      const blobKey = buildBlobFilePath(
        groupId,
        OperationCategory.OCR,
        [documentId],
        `original.${extension}`,
      );

      const normalizedKey = buildBlobFilePath(
        groupId,
        OperationCategory.OCR,
        [documentId],
        "normalized.pdf",
      );
      const originalWrite = this.blobStorage.write(blobKey, fileBuffer);
      // Normalization can run long enough for an early write failure to look
      // unhandled; the original promise is still awaited below.
      void originalWrite.catch(() => undefined);
      this.logger.debug(`Original file write started: ${blobKey}`);

      try {
        const pdfBuffer = await this.uploadNormalizationLimiter.run(() =>
          this.pdfNormalization.normalizeToPdf(fileBuffer, fileType),
        );
        await originalWrite;
        // Drop the decoded upload buffer before the normalized blob write so
        // original bytes and pdf-lib workspace are not retained together.
        fileBuffer = Buffer.alloc(0);
        await this.blobStorage.write(normalizedKey, pdfBuffer);
        this.logger.debug(
          `Files saved to blob storage: ${blobKey}, ${normalizedKey}`,
        );

        const thumbnailKey = buildBlobFilePath(
          groupId,
          OperationCategory.OCR,
          [documentId],
          "thumbnail.webp",
        );
        try {
          const thumbnailBuffer =
            await this.pdfNormalization.generateThumbnailWebp(pdfBuffer, "pdf");
          await this.blobStorage.write(thumbnailKey, thumbnailBuffer);
          this.logger.debug(`Thumbnail saved: ${thumbnailKey}`);
        } catch (thumbErr) {
          this.logger.warn(
            `Thumbnail generation skipped for ${documentId}: ${thumbErr instanceof Error ? thumbErr.message : String(thumbErr)}`,
          );
        }
      } catch (e) {
        // Ensure the overlapping original write finished before we record failure.
        // We intentionally keep the original blob (no rollback): the API returns
        // conversion_failed, status is conversion_failed, normalized_file_path is
        // null, OCR is not started, but GET .../download still serves the upload.
        await originalWrite;

        if (e instanceof BadRequestException) {
          throw e;
        }

        // Surface the specific reason only for our controlled normalization
        // errors. Unexpected errors fall back to the generic message/code so
        // internal details are never leaked to the caller.
        let code = "conversion_failed";
        let reason = "Document could not be converted to PDF";
        if (e instanceof PdfNormalizationError) {
          reason = e.message;
          if (e.code) {
            code = e.code;
          }
        } else {
          this.logger.error(
            `Unexpected normalization error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        const failedDoc: Omit<
          DocumentData,
          "created_at" | "updated_at" | "purged_at"
        > = {
          id: documentId,
          title,
          original_filename: originalFilename,
          file_path: blobKey,
          normalized_file_path: null,
          file_type: fileType,
          file_size: fileSize,
          content_hash: contentHash,
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
          code,
          reason,
        };
      }

      const documentData: Omit<
        DocumentData,
        "created_at" | "updated_at" | "purged_at"
      > = {
        id: documentId,
        title,
        original_filename: originalFilename,
        file_path: blobKey,
        normalized_file_path: normalizedKey,
        file_type: fileType,
        file_size: fileSize,
        content_hash: contentHash,
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

      this.logger.debug("=== DocumentService.uploadDocument completed ===", {
        alertType: "document_upload",
      });
      return {
        kind: "success",
        document: this.toUploadedDocument(savedDocument),
      };
    } catch (error) {
      this.logger.error(`Error uploading document: ${getErrorMessage(error)}`, {
        alertType: "document_upload",
      });
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
   * Deletes a document and its associated blob storage under the OCR prefix.
   *
   * Removes all objects under `{groupId}/ocr/{documentId}/` (workflow OCR payload
   * refs: azure-response.json, ocr-result.json, cleaned-result.json, pages/, etc.)
   * in addition to the document row. Deletion is best-effort if blob storage fails.
   *
   * Refuses to delete documents whose OCR pipeline is still in flight
   * (`pre_ocr` or `ongoing_ocr`) to avoid orphaning Temporal workflows. The
   * caller must wait for processing to settle before retrying.
   *
   * @param id - The document ID.
   * @returns `true` if deleted, `false` if not found.
   * @throws ConflictException if the document is currently being processed.
   */
  async deleteDocument(id: string): Promise<boolean> {
    this.logger.debug(`DocumentService.deleteDocument: ${id}`);
    const document = await this.documentDb.findDocument(id);
    if (!document) {
      return false;
    }
    if (
      document.status === DocumentStatus.pre_ocr ||
      document.status === DocumentStatus.ongoing_ocr
    ) {
      throw new ConflictException(
        "Document is currently being processed; try again once OCR completes",
      );
    }
    await this.documentDb.deleteDocument(id);
    try {
      const documentPath = buildBlobPrefixPath(
        document.group_id,
        OperationCategory.OCR,
        [id],
      );
      await this.blobStorage.deleteByPrefix(documentPath);
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
   * Returns documents, optionally filtered by group IDs, with pagination, search, status filter, and sorting.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @param options - Query options: pagination, search, status filter, and sort parameters.
   * @param tx - Optional transaction client for atomic operations.
   * @returns Object with matching document records (including workflow_name) and total count.
   */
  async findAllDocuments(
    groupIds?: string[],
    options?: {
      limit?: number;
      offset?: number;
      search?: string;
      status?: DocumentStatus | "all";
      sortBy?: string;
      sortDir?: "asc" | "desc";
      source?: string;
      contentHash?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{
    documents: (DocumentData & { workflow_name?: string | null })[];
    total: number;
  }> {
    return this.documentDb.findAllDocuments(groupIds, options, tx);
  }

  /**
   * Returns document counts grouped by status, plus a grand total.
   *
   * @param groupIds - Optional list of group IDs to scope the counts.
   * @returns Per-status counts and a grand total.
   */
  async getDocumentStatusCounts(groupIds?: string[]): Promise<{
    total: number;
    pre_ocr: number;
    ongoing_ocr: number;
    extracted: number;
    awaiting_review: number;
    complete: number;
    failed: number;
    rejected_by_human: number;
    conversion_failed: number;
  }> {
    return this.documentDb.getDocumentStatusCounts(groupIds);
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
