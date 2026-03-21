import {
  FieldDefinition,
  FieldType,
  LabelingStatus,
  Prisma,
  PrismaClient,
  TemplateModelStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import type {
  LabeledDocumentData,
  TemplateModelData,
} from "./database.types";
import { PrismaService } from "./prisma.service";

type JsonValue = Prisma.JsonValue;

@Injectable()
export class TemplateModelDbService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createTemplateModel(data: {
    name: string;
    model_id: string;
    description?: string;
    created_by: string;
    group_id: string;
  }): Promise<TemplateModelData> {
    this.logger.debug("Creating template model", { name: data.name });
    const templateModel = await this.prisma.templateModel.create({
      data: {
        name: data.name,
        model_id: data.model_id,
        description: data.description,
        created_by: data.created_by,
        group_id: data.group_id,
        status: TemplateModelStatus.draft,
      },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
      },
    });
    return templateModel as TemplateModelData;
  }

  async findTemplateModelByModelId(
    modelId: string,
  ): Promise<TemplateModelData | null> {
    this.logger.debug("Finding template model by model_id", { modelId });
    const templateModel = await this.prisma.templateModel.findUnique({
      where: { model_id: modelId },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
      },
    });
    return templateModel as TemplateModelData | null;
  }

  async findTemplateModel(id: string): Promise<TemplateModelData | null> {
    this.logger.debug("Finding template model", { id });
    const templateModel = await this.prisma.templateModel.findUnique({
      where: { id },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
        documents: {
          include: {
            labeling_document: true,
            labels: true,
          },
        },
      },
    });
    return templateModel as TemplateModelData | null;
  }

  async findAllTemplateModels(
    groupIds?: string[],
  ): Promise<TemplateModelData[]> {
    this.logger.debug("Finding all template models");
    const templateModels = await this.prisma.templateModel.findMany({
      where: groupIds ? { group_id: { in: groupIds } } : undefined,
      orderBy: { updated_at: "desc" },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
        _count: { select: { documents: true } },
      },
    });
    return templateModels as TemplateModelData[];
  }

  async updateTemplateModel(
    id: string,
    data: { name?: string; description?: string; status?: TemplateModelStatus },
  ): Promise<TemplateModelData | null> {
    this.logger.debug("Updating template model", { id });
    try {
      const templateModel = await this.prisma.templateModel.update({
        where: { id },
        data,
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
      return templateModel as TemplateModelData;
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

  async deleteTemplateModel(id: string): Promise<boolean> {
    this.logger.debug("Deleting template model", { id });
    try {
      await this.prisma.templateModel.delete({ where: { id } });
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

  async createFieldDefinition(
    templateModelId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
  ): Promise<FieldDefinition> {
    this.logger.debug("Creating field definition for template model", {
      field_key: data.field_key,
      templateModelId,
    });
    if (data.display_order === undefined) {
      const maxOrder = await this.prisma.fieldDefinition.aggregate({
        where: { template_model_id: templateModelId },
        _max: { display_order: true },
      });
      data.display_order = (maxOrder._max.display_order ?? -1) + 1;
    }
    return this.prisma.fieldDefinition.create({
      data: {
        template_model_id: templateModelId,
        field_key: data.field_key,
        field_type: data.field_type,
        field_format: data.field_format,
        display_order: data.display_order,
      },
    });
  }

  async updateFieldDefinition(
    id: string,
    data: { field_format?: string; display_order?: number },
  ): Promise<FieldDefinition | null> {
    this.logger.debug("Updating field definition", { id });
    try {
      return await this.prisma.fieldDefinition.update({
        where: { id },
        data,
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

  async deleteFieldDefinition(id: string): Promise<boolean> {
    this.logger.debug("Deleting field definition", { id });
    try {
      await this.prisma.fieldDefinition.delete({ where: { id } });
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

  async addDocumentToTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    this.logger.debug("Adding document to template model", {
      labelingDocumentId,
      templateModelId,
    });
    const labeledDoc = await this.prisma.labeledDocument.create({
      data: {
        template_model_id: templateModelId,
        labeling_document_id: labelingDocumentId,
        status: LabelingStatus.unlabeled,
      },
      include: {
        labeling_document: true,
        labels: true,
      },
    });
    return labeledDoc as LabeledDocumentData;
  }

  async findLabeledDocument(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData | null> {
    this.logger.debug("Finding labeled document in template model", {
      labelingDocumentId,
      templateModelId,
    });
    const labeledDoc = await this.prisma.labeledDocument.findUnique({
      where: {
        template_model_id_labeling_document_id: {
          template_model_id: templateModelId,
          labeling_document_id: labelingDocumentId,
        },
      },
      include: {
        labeling_document: true,
        labels: true,
      },
    });
    return labeledDoc as LabeledDocumentData | null;
  }

  async findLabeledDocuments(
    templateModelId: string,
  ): Promise<LabeledDocumentData[]> {
    this.logger.debug("Finding labeled documents for template model", { templateModelId });
    const docs = await this.prisma.labeledDocument.findMany({
      where: { template_model_id: templateModelId },
      orderBy: { created_at: "desc" },
      include: {
        labeling_document: true,
        labels: true,
      },
    });
    return docs as LabeledDocumentData[];
  }

  async removeDocumentFromTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<boolean> {
    this.logger.debug("Removing document from template model", {
      labelingDocumentId,
      templateModelId,
    });
    try {
      await this.prisma.labeledDocument.delete({
        where: {
          template_model_id_labeling_document_id: {
            template_model_id: templateModelId,
            labeling_document_id: labelingDocumentId,
          },
        },
      });
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

  async updateLabeledDocumentStatus(
    labeledDocId: string,
    status: LabelingStatus,
  ): Promise<void> {
    this.logger.debug("Updating labeled document status", { labeledDocId });
    await this.prisma.labeledDocument.update({
      where: { id: labeledDocId },
      data: { status },
    });
  }

  async saveDocumentLabels(
    labeledDocId: string,
    labels: Array<{
      field_key: string;
      label_name: string;
      value?: string;
      page_number: number;
      bounding_box: unknown;
    }>,
  ): Promise<import("@generated/client").DocumentLabel[]> {
    this.logger.debug("Saving labels for document", {
      count: labels.length,
      labeledDocId,
    });
    await this.prisma.$transaction([
      this.prisma.documentLabel.deleteMany({
        where: { labeled_doc_id: labeledDocId },
      }),
      ...labels.map((label) =>
        this.prisma.documentLabel.create({
          data: {
            labeled_doc_id: labeledDocId,
            field_key: label.field_key,
            label_name: label.label_name,
            value: label.value,
            page_number: label.page_number,
            bounding_box: label.bounding_box as JsonValue,
          },
        }),
      ),
    ]);
    return this.prisma.documentLabel.findMany({
      where: { labeled_doc_id: labeledDocId },
    });
  }

  async deleteDocumentLabel(labelId: string): Promise<boolean> {
    this.logger.debug("Deleting document label", { labelId });
    try {
      await this.prisma.documentLabel.delete({ where: { id: labelId } });
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
}
