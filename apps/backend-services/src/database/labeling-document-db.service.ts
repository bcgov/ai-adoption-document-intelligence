import { DocumentStatus, PrismaClient } from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import type { LabelingDocumentData } from "./database.types";
import { PrismaService } from "./prisma.service";

type JsonValue = import("@generated/client").Prisma.JsonValue;

@Injectable()
export class LabelingDocumentDbService {
  private readonly logger = new Logger(LabelingDocumentDbService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createLabelingDocument(
    data: Omit<LabelingDocumentData, "id" | "created_at" | "updated_at">,
  ): Promise<LabelingDocumentData> {
    this.logger.debug("Creating labeling document");
    const labelingDocument = await this.prisma.labelingDocument.create({
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

  async findLabelingDocument(id: string): Promise<LabelingDocumentData | null> {
    this.logger.debug("Finding labeling document: %s", id);
    const labelingDocument = await this.prisma.labelingDocument.findUnique({
      where: { id },
    });
    return labelingDocument as LabelingDocumentData | null;
  }

  async updateLabelingDocument(
    id: string,
    data: Partial<LabelingDocumentData>,
  ): Promise<LabelingDocumentData | null> {
    this.logger.debug("Updating labeling document: %s", id);
    try {
      const { metadata, ocr_result, ...restData } = data;
      const labelingDocument = await this.prisma.labelingDocument.update({
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
