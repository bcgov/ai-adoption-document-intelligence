import {
  ClassifierSource,
  ClassifierStatus,
  Document,
  DocumentStatus,
  OcrResult,
  Prisma,
  PrismaClient,
} from "@generated/client";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AnalysisResponse,
  DocumentField,
  ExtractedFields,
  KeyValuePair,
} from "@/ocr/azure-types";
import { getPrismaPgOptions } from "@/utils/database-url";

export type ClassifierConfig = {
  labels: {
    label: string;
    fromFolder: string;
    blobFolder: string;
  }[];
};

interface ClassifierEditableProperties {
  version?: number;
  group_id: string;
  config: ClassifierConfig;
  description: string;
  status: ClassifierStatus;
  source: ClassifierSource;
  last_used_at?: string;
  operation_location?: string;
}

export type DocumentData = Document;

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private prisma: PrismaClient;

  constructor(private configService: ConfigService) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      log: ["query", "info", "warn", "error"],
      adapter: new PrismaPg(dbOptions),
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
          model_id: data.model_id,
          workflow_id: data.workflow_id || null,
          workflow_config_id: data.workflow_config_id || null,
          workflow_execution_id: data.workflow_execution_id || null,
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
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
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
        return null;
      }

      this.logger.debug(`OCR result found for document: ${documentId}`);
      this.logger.debug("=== DatabaseService.findOcrResult completed ===");

      return ocrResult;
    } catch (error) {
      this.logger.error(
        `Failed to find OCR result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Converts prebuilt model keyValuePairs array to the custom model fields format.
   * This ensures a unified format for all OCR results.
   */
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

      // Handle duplicate field names by appending a suffix
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
    this.logger.debug("=== DatabaseService.upsertOcrResult ===");
    this.logger.debug(
      `Creating/Updating OCR result for document: ${data.documentId}`,
    );

    try {
      const analysisResult = data.analysisResponse.analyzeResult;
      const asJson = (obj): Prisma.JsonValue =>
        obj as unknown as Prisma.JsonValue;

      // Determine extracted fields based on model type
      let extractedFields: ExtractedFields | null = null;

      if (analysisResult.documents?.length > 0) {
        // Custom model: use fields directly from documents[0].fields
        extractedFields = analysisResult.documents[0].fields;
        this.logger.debug(
          `Using custom model fields: ${Object.keys(extractedFields).length} fields`,
        );
      } else if (analysisResult.keyValuePairs?.length > 0) {
        // Prebuilt model: convert keyValuePairs to fields format
        extractedFields = this.convertKeyValuePairsToFields(
          analysisResult.keyValuePairs,
        );
        this.logger.debug(
          `Converted ${analysisResult.keyValuePairs.length} keyValuePairs to fields format`,
        );
      }

      const updateObject = {
        processed_at: data.analysisResponse.lastUpdatedDateTime,
        keyValuePairs: asJson(extractedFields),
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

  async createClassifierModel(
    classifierName: string,
    properties: ClassifierEditableProperties,
    userId: string,
  ) {
    return await this.prisma.classifierModel.create({
      data: {
        ...properties,
        created_by: userId,
        updated_by: userId,
        name: classifierName,
      },
    });
  }

  async updateClassifierModel(
    classifierName: string,
    groupId: string,
    properties: Partial<ClassifierEditableProperties>,
    userId: string,
  ) {
    return await this.prisma.classifierModel.update({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
      data: {
        ...properties,
        created_by: userId,
        updated_by: userId,
        name: classifierName,
      },
    });
  }

  async getClassifierModel(classifierName: string, groupId: string) {
    return await this.prisma.classifierModel.findUnique({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
    });
  }

  async getUsersGroups(userId: string) {
    return await this.prisma.userGroup.findMany({
      where: {
        user_id: userId
      }
    })
  }

  async isUserInGroup(userId: string, groupId: string) {
    const entry = await this.prisma.userGroup.findUnique({
      where: {
        user_id_group_id: {
          user_id: userId, 
          group_id: groupId
        }
      }
    })
    return entry != null;
  }
}
