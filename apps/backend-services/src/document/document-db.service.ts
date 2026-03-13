import {
  DocumentStatus,
  OcrResult,
  Prisma,
  PrismaClient,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  AnalysisResponse,
  DocumentField,
  ExtractedFields,
  KeyValuePair,
} from "@/ocr/azure-types";
import { PrismaService } from "../database/prisma.service";
import type { DocumentData } from "./document-db.types";

@Injectable()
export class DocumentDbService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new document record in the database.
   *
   * @param data - Document data without auto-generated timestamps.
   * @returns The created document record.
   */
  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    this.logger.debug("Creating document", { title: data.title });
    try {
      const document = await this.prisma.document.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          title: data.title,
          original_filename: data.original_filename,
          file_path: data.file_path,
          file_type: data.file_type,
          file_size: data.file_size,
          metadata: data.metadata,
          source: data.source,
          status: data.status as DocumentStatus,
          model_id: data.model_id,
          workflow_id: data.workflow_id || null,
          workflow_config_id: data.workflow_config_id || null,
          workflow_execution_id: data.workflow_execution_id || null,
          group_id: data.group_id,
        },
      });
      this.logger.debug("Document created", { id: document.id });
      return document;
    } catch (error) {
      this.logger.error("Failed to create document", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Finds a document by its ID.
   *
   * @param id - The unique identifier of the document.
   * @returns The document record, or `null` if not found.
   */
  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug("Finding document", { id });
    try {
      const document = await this.prisma.document.findUnique({
        where: { id },
      });
      if (document) {
        this.logger.debug("Document found", { id: document.id });
      } else {
        this.logger.debug("Document not found", { id });
      }
      return document;
    } catch (error) {
      this.logger.error("Failed to find document", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Returns all documents, optionally filtered by group IDs.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @returns Array of matching document records ordered by creation date descending.
   */
  async findAllDocuments(groupIds?: string[]): Promise<DocumentData[]> {
    this.logger.debug("Finding all documents");
    try {
      const documents = await this.prisma.document.findMany({
        where: groupIds ? { group_id: { in: groupIds } } : undefined,
        orderBy: { created_at: "desc" },
      });
      this.logger.debug("Found documents", { count: documents.length });
      return documents;
    } catch (error) {
      this.logger.error("Failed to find documents", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Updates a document by its ID.
   *
   * @param id - The unique identifier of the document to update.
   * @param data - Partial document fields to update (excludes id and created_at).
   * @returns The updated document, or `null` if not found.
   */
  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    this.logger.debug("Updating document", { id });
    try {
      const document = await this.prisma.document.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });
      this.logger.debug("Document updated", { id: document.id });
      return document;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        this.logger.debug("Document not found for update", { id });
        return null;
      }
      this.logger.error("Failed to update document", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Deletes a document by its ID.
   *
   * @param id - The unique identifier of the document to delete.
   * @returns `true` if the document was deleted, `false` if not found.
   */
  async deleteDocument(id: string): Promise<boolean> {
    this.logger.debug("Deleting document", { id });
    try {
      await this.prisma.document.delete({
        where: { id },
      });
      this.logger.debug("Document deleted", { id });
      return true;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        this.logger.debug("Document not found for deletion", { id });
        return false;
      }
      this.logger.error("Failed to delete document", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retrieves the most recent OCR result for a document.
   *
   * @param documentId - The ID of the document whose OCR result to fetch.
   * @returns The OCR result record, or `null` if none exists.
   */
  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    this.logger.debug("Finding OCR result for document", { documentId });
    try {
      const ocrResult = await this.prisma.ocrResult.findFirst({
        where: { document_id: documentId },
        orderBy: { processed_at: "desc" },
      });
      if (!ocrResult) {
        this.logger.debug("No OCR result found for document", { documentId });
        return null;
      }
      this.logger.debug("OCR result found for document", { documentId });
      return ocrResult;
    } catch (error) {
      this.logger.error("Failed to find OCR result", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private convertKeyValuePairsToFields(
    keyValuePairs: KeyValuePair[],
  ): ExtractedFields {
    const fields: ExtractedFields = {};
    for (const pair of keyValuePairs) {
      const fieldName = pair.key?.content || "unknown";
      const field: DocumentField = {
        type: "string",
        content: pair.value?.content || null,
        confidence: pair.confidence,
        boundingRegions:
          pair.value?.boundingRegions || pair.key?.boundingRegions,
        spans: pair.value?.spans || pair.key?.spans,
      };
      let uniqueName = fieldName;
      let counter = 1;
      while (fields[uniqueName]) {
        uniqueName = `${fieldName}_${counter}`;
        counter++;
      }
      fields[uniqueName] = field;
    }
    return fields;
  }

  /**
   * Creates or updates the OCR result for a document.
   *
   * @param data - Object containing the document ID, analysis response, and optional metadata.
   */
  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.debug("Creating/updating OCR result for document", {
      documentId: data.documentId,
    });
    try {
      const analysisResult = data.analysisResponse.analyzeResult;
      const asJson = (obj: unknown): Prisma.JsonValue =>
        obj as Prisma.JsonValue;

      let extractedFields: ExtractedFields | null = null;
      if (analysisResult.documents?.length > 0) {
        extractedFields = analysisResult.documents[0].fields;
        this.logger.debug("Using custom model fields", {
          fieldCount: Object.keys(extractedFields).length,
        });
      } else if (analysisResult.keyValuePairs?.length > 0) {
        extractedFields = this.convertKeyValuePairsToFields(
          analysisResult.keyValuePairs,
        );
        this.logger.debug("Converted keyValuePairs to fields format", {
          count: analysisResult.keyValuePairs.length,
        });
      }

      const updateObject = {
        processed_at: data.analysisResponse.lastUpdatedDateTime,
        keyValuePairs: asJson(extractedFields),
      };

      await this.prisma.ocrResult.upsert({
        where: { document_id: data.documentId },
        update: updateObject,
        create: {
          document_id: data.documentId,
          ...updateObject,
        },
      });
      this.logger.debug("OCR result created/updated for document", {
        documentId: data.documentId,
      });
    } catch (error) {
      this.logger.error("Failed to create/update OCR result", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
