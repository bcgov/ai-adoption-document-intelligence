import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, Document, OcrResult } from "../generated/client";
import { JsonValue } from "../generated/internal/prismaNamespace";
import { DocumentStatus } from "../generated/enums";
import { AnalysisResponse } from "@/ocr/azureTypes";

export type DocumentData = Document;

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private prisma: PrismaClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.prisma = new PrismaClient({
      log: ["query", "info", "warn", "error"],
    });
    this.logger.log("Database service initialized with Prisma");
  }

  async createDocument(
    data: Omit<DocumentData, "id" | "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    this.logger.debug("=== DatabaseService.createDocument ===");
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
      this.logger.debug("=== DatabaseService.createDocument completed ===");

      return document;
    } catch (error) {
      this.logger.error(
        `Failed to create document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug("=== DatabaseService.findDocument ===");
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

      this.logger.debug("=== DatabaseService.findDocument completed ===");
      return document;
    } catch (error) {
      this.logger.error(
        `Failed to find document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findAllDocuments(): Promise<DocumentData[]> {
    this.logger.debug("=== DatabaseService.findAllDocuments ===");

    try {
      const documents = await this.prisma.document.findMany({
        orderBy: { created_at: "desc" },
      });

      this.logger.debug(`Found ${documents.length} documents`);
      this.logger.debug("=== DatabaseService.findAllDocuments completed ===");

      return documents;
    } catch (error) {
      this.logger.error(
        `Failed to find documents: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateDocument(
    id: string,
    data: Partial<DocumentData>,
  ): Promise<DocumentData | null> {
    this.logger.debug("=== DatabaseService.updateDocument ===");
    this.logger.debug(`Updating document: ${id}`);
    this.logger.debug(`Update data: ${JSON.stringify(data, null, 2)}`);

    try {
      const document = await this.prisma.document.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      this.logger.debug(`Document updated: ${document.id}`);
      this.logger.debug("=== DatabaseService.updateDocument completed ===");

      return document;
    } catch (error) {
      if (error.code === "P2025") {
        this.logger.debug(`Document not found for update: ${id}`);
        return null;
      }
      this.logger.error(
        `Failed to update document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    this.logger.debug("=== DatabaseService.findOcrResult ===");
    this.logger.debug(`Finding OCR result for document: ${documentId}`);

    try {
      const ocrResult = await this.prisma.ocrResult.findFirst({
        where: { document_id: documentId },
        orderBy: { processed_at: "desc" },
      });

      if (!ocrResult) {
        this.logger.debug(`No OCR result found for document: ${documentId}`);
        this.logger.debug("=== DatabaseService.findOcrResult completed ===");
        throw new NotFoundException(
          `No OCR result found for document: ${documentId}`,
        );
      }

      // Transform Prisma result to OcrResult interface
      const result: OcrResult = {
        ...ocrResult,
        pages: ocrResult.pages || [],
      };

      this.logger.debug(`OCR result found for document: ${documentId}`);
      this.logger.debug("=== DatabaseService.findOcrResult completed ===");

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to find OCR result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.debug("=== DatabaseService.upsertOcrResult ===");
    this.logger.debug(
      `Creating/Updating OCR result for document: ${data.documentId}`,
    );

    try {
      const analysisResult = data.analysisResponse.analyzeResult;
      const asJson = (obj) => obj as unknown as JsonValue;
      const updateObject = {
        processed_at: data.analysisResponse.lastUpdatedDateTime,
        extracted_text: analysisResult.content,
        pages: asJson(analysisResult.pages),
        tables: asJson(analysisResult.tables),
        paragraphs: asJson(analysisResult.paragraphs),
        styles: asJson(analysisResult.styles),
        sections: asJson(analysisResult.sections),
        figures: asJson(analysisResult.figures),
        keyValuePairs: asJson(analysisResult.keyValuePairs),
      };
      await this.prisma.ocrResult.upsert({
        where: {
          document_id: data.documentId,
        },
        update: updateObject,
        create: {
          document_id: data.documentId,
          ...updateObject,
        },
      });

      this.logger.debug(
        `OCR result created/updated for document: ${data.documentId}`,
      );
      this.logger.debug("=== DatabaseService.upsertOcrResult completed ===");
    } catch (error) {
      this.logger.error(
        `Failed to create/update OCR result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
