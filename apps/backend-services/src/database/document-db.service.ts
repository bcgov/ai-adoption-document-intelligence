import {
  DocumentStatus,
  OcrResult,
  Prisma,
  PrismaClient,
} from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import {
  AnalysisResponse,
  DocumentField,
  ExtractedFields,
  KeyValuePair,
} from "@/ocr/azure-types";
import type { DocumentData } from "./database.types";
import { PrismaService } from "./prisma.service";

@Injectable()
export class DocumentDbService {
  private readonly logger = new Logger(DocumentDbService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    this.logger.debug("Creating document: %s", data.title);
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
        },
      });
      this.logger.debug("Document created: %s", document.id);
      return document;
    } catch (error) {
      this.logger.error(
        "Failed to create document: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug("Finding document: %s", id);
    try {
      const document = await this.prisma.document.findUnique({
        where: { id },
      });
      if (document) {
        this.logger.debug("Document found: %s", document.id);
      } else {
        this.logger.debug("Document not found: %s", id);
      }
      return document;
    } catch (error) {
      this.logger.error(
        "Failed to find document: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async findAllDocuments(): Promise<DocumentData[]> {
    this.logger.debug("Finding all documents");
    try {
      const documents = await this.prisma.document.findMany({
        orderBy: { created_at: "desc" },
      });
      this.logger.debug("Found %d documents", documents.length);
      return documents;
    } catch (error) {
      this.logger.error(
        "Failed to find documents: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    this.logger.debug("Updating document: %s", id);
    try {
      const document = await this.prisma.document.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });
      this.logger.debug("Document updated: %s", document.id);
      return document;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        this.logger.debug("Document not found for update: %s", id);
        return null;
      }
      this.logger.error(
        "Failed to update document: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    this.logger.debug("Finding OCR result for document: %s", documentId);
    try {
      const ocrResult = await this.prisma.ocrResult.findFirst({
        where: { document_id: documentId },
        orderBy: { processed_at: "desc" },
      });
      if (!ocrResult) {
        this.logger.debug("No OCR result found for document: %s", documentId);
        return null;
      }
      this.logger.debug("OCR result found for document: %s", documentId);
      return ocrResult;
    } catch (error) {
      this.logger.error(
        "Failed to find OCR result: %s",
        error instanceof Error ? error.message : String(error),
      );
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

  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.debug(
      "Creating/updating OCR result for document: %s",
      data.documentId,
    );
    try {
      const analysisResult = data.analysisResponse.analyzeResult;
      const asJson = (obj: unknown): Prisma.JsonValue =>
        obj as Prisma.JsonValue;

      let extractedFields: ExtractedFields | null = null;
      if (analysisResult.documents?.length > 0) {
        extractedFields = analysisResult.documents[0].fields;
        this.logger.debug(
          "Using custom model fields: %d fields",
          Object.keys(extractedFields).length,
        );
      } else if (analysisResult.keyValuePairs?.length > 0) {
        extractedFields = this.convertKeyValuePairsToFields(
          analysisResult.keyValuePairs,
        );
        this.logger.debug(
          "Converted %d keyValuePairs to fields format",
          analysisResult.keyValuePairs.length,
        );
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
      this.logger.debug(
        "OCR result created/updated for document: %s",
        data.documentId,
      );
    } catch (error) {
      this.logger.error(
        "Failed to create/update OCR result: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
