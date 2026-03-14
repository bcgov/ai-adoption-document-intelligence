import type { OcrResult } from "@generated/client";
import { DocumentStatus, Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import type { AnalysisResponse } from "@/ocr/azure-types";
import type { DocumentData } from "./database.types";
import { PrismaService } from "./prisma.service";

export type { DocumentData };

@Injectable()
export class DatabaseService {
  constructor(private readonly prismaService: PrismaService) {}

  get prisma() {
    return this.prismaService.prisma;
  }

  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    return this.prisma.document.create({
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
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    return this.prisma.document.findUnique({ where: { id } });
  }

  async findAllDocuments(groupIds?: string[]): Promise<DocumentData[]> {
    return this.prisma.document.findMany({
      where: groupIds ? { group_id: { in: groupIds } } : undefined,
      orderBy: { created_at: "desc" },
    });
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    try {
      return await this.prisma.document.update({
        where: { id },
        data: { ...data, updated_at: new Date() },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      await this.prisma.document.delete({ where: { id } });
      return true;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return false;
      }
      throw error;
    }
  }

  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    return this.prisma.ocrResult.findFirst({
      where: { document_id: documentId },
      orderBy: { processed_at: "desc" },
    });
  }

  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const analysisResult = data.analysisResponse.analyzeResult;
    const asJson = (obj: unknown): Prisma.JsonValue => obj as Prisma.JsonValue;

    let extractedFields: Record<string, unknown> | null = null;
    if (analysisResult.documents?.length > 0) {
      extractedFields = analysisResult.documents[0].fields;
    } else if (analysisResult.keyValuePairs?.length > 0) {
      const fields: Record<string, unknown> = {};
      for (const pair of analysisResult.keyValuePairs) {
        const fieldName = pair.key?.content || "unknown";
        const field = {
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
      extractedFields = fields;
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
  }
}
