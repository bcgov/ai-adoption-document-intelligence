import { DocumentStatus, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { LabelingDocumentData } from "./labeling-document-db.types";

type JsonValue = import("@generated/client").Prisma.JsonValue;

@Injectable()
export class LabelingDocumentDbService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createLabelingDocument(
    data: Omit<LabelingDocumentData, "id" | "created_at" | "updated_at">,
    tx?: Prisma.TransactionClient,
  ): Promise<LabelingDocumentData> {
    const client = tx ?? this.prisma;
    this.logger.debug("Creating labeling document");
    const labelingDocument = await client.labelingDocument.create({
      data: {
        title: data.title,
        original_filename: data.original_filename,
        file_path: data.file_path,
        file_type: data.file_type,
        file_size: data.file_size,
        metadata: data.metadata as JsonValue,
        source: data.source,
        status: data.status as DocumentStatus,
        apim_request_id: data.apim_request_id,
        model_id: data.model_id,
        ocr_result: data.ocr_result as JsonValue,
        group_id: data.group_id,
      },
    });
    return labelingDocument as LabelingDocumentData;
  }

  async findLabelingDocument(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LabelingDocumentData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding labeling document", { id });
    const labelingDocument = await client.labelingDocument.findUnique({
      where: { id },
    });
    return labelingDocument as LabelingDocumentData | null;
  }

  async updateLabelingDocument(
    id: string,
    data: Partial<LabelingDocumentData>,
    tx?: Prisma.TransactionClient,
  ): Promise<LabelingDocumentData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Updating labeling document", { id });
    try {
      const { metadata, ocr_result, ...restData } = data;
      const labelingDocument = await client.labelingDocument.update({
        where: { id },
        data: {
          ...restData,
          ...(metadata !== undefined && { metadata: metadata as JsonValue }),
          ...(ocr_result !== undefined && {
            ocr_result: ocr_result as JsonValue,
          }),
          updated_at: new Date(),
        },
      });
      return labelingDocument as LabelingDocumentData;
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
}
