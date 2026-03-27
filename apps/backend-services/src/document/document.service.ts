import { DocumentStatus, Prisma } from "@generated/client";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DatabaseService, DocumentData } from "../database/database.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { WorkflowService } from "../workflow/workflow.service";

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
    private databaseService: DatabaseService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    private readonly workflowService: WorkflowService,
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

      let workflowLineageId: string | null = null;
      let workflowVersionId: string | null = null;
      const trimmedWorkflowId = workflowId?.trim();
      if (trimmedWorkflowId) {
        const wf =
          await this.workflowService.getWorkflowById(trimmedWorkflowId);
        if (!wf) {
          throw new BadRequestException(
            `Workflow not found for id: ${trimmedWorkflowId}`,
          );
        }
        workflowLineageId = wf.id;
        workflowVersionId = wf.workflowVersionId;
      }

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
        workflow_id: workflowLineageId,
        workflow_config_id: workflowVersionId,
        workflow_execution_id: null, // Will be set when workflow starts
        model_id: modelId,
        group_id: groupId,
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
      group_id: document.group_id,
    };
  }

  /**
   * Updates editable fields of a document.
   *
   * @param id - The document ID.
   * @param data - Fields to update (title and/or metadata).
   * @returns The updated document, or `null` if not found.
   */
  async updateDocument(
    id: string,
    data: { title?: string; metadata?: Record<string, unknown> },
  ): Promise<UploadedDocument | null> {
    this.logger.debug(`DocumentService.updateDocument: ${id}`);
    const updated = await this.databaseService.updateDocument(id, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.metadata !== undefined
        ? { metadata: data.metadata as Prisma.JsonValue }
        : {}),
    });
    if (!updated) {
      return null;
    }
    return {
      id: updated.id!,
      title: updated.title,
      original_filename: updated.original_filename,
      file_path: updated.file_path,
      file_type: updated.file_type,
      file_size: updated.file_size,
      metadata: updated.metadata as Record<string, unknown>,
      source: updated.source,
      status: updated.status,
      created_at: updated.created_at || new Date(),
      updated_at: updated.updated_at || new Date(),
      model_id: updated.model_id,
      group_id: updated.group_id,
    };
  }

  /**
   * Deletes a document and its associated blob storage file.
   *
   * @param id - The document ID.
   * @returns `true` if deleted, `false` if not found.
   */
  async deleteDocument(id: string): Promise<boolean> {
    this.logger.debug(`DocumentService.deleteDocument: ${id}`);
    const document = await this.databaseService.findDocument(id);
    if (!document) {
      return false;
    }
    await this.databaseService.deleteDocument(id);
    try {
      await this.blobStorage.delete(document.file_path);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blob for document ${id}: ${(error as Error).message}`,
      );
    }
    return true;
  }
}
