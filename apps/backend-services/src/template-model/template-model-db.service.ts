import {
  FieldDefinition,
  FieldType,
  LabelingStatus,
  Prisma,
  PrismaClient,
  TemplateModelStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import type {
  LabeledDocumentData,
  TemplateModelData,
} from "./template-model-db.types";

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

  /**
   * Creates a new template model.
   *
   * @param data - The template model creation data including name, model_id, optional description, creator ID, and group ID.
   * @returns The created template model with its field schema.
   */
  async createTemplateModel(
    data: {
      name: string;
      model_id: string;
      description?: string;
      created_by: string;
      group_id: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<TemplateModelData> {
    const client = tx ?? this.prisma;
    this.logger.debug("Creating template model", { name: data.name });
    const templateModel = await client.templateModel.create({
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

  /**
   * Finds a template model by its model_id (Azure-safe identifier).
   *
   * @param modelId - The model_id to search for.
   * @returns The template model with field schema, or null if not found.
   */
  async findTemplateModelByModelId(
    modelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TemplateModelData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding template model by model_id", { modelId });
    const templateModel = await client.templateModel.findUnique({
      where: { model_id: modelId },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
      },
    });
    return templateModel as TemplateModelData | null;
  }

  /**
   * Finds a template model by its ID, including field schema and documents.
   *
   * @param id - The template model ID.
   * @returns The template model with documents and labels, or null if not found.
   */
  async findTemplateModel(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TemplateModelData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding template model", { id });
    const templateModel = await client.templateModel.findUnique({
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

  /**
   * Finds all template models, optionally filtered by group IDs.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @returns An array of template models with their field schemas.
   */
  async findAllTemplateModels(
    groupIds?: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<TemplateModelData[]> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding all template models");
    const templateModels = await client.templateModel.findMany({
      where: groupIds ? { group_id: { in: groupIds } } : undefined,
      orderBy: { updated_at: "desc" },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
        _count: { select: { documents: true } },
      },
    });
    return templateModels as TemplateModelData[];
  }

  /**
   * Updates a template model by its ID.
   *
   * @param id - The template model ID.
   * @param data - The fields to update.
   * @returns The updated template model, or null if not found.
   */
  async updateTemplateModel(
    id: string,
    data: { name?: string; description?: string; status?: TemplateModelStatus },
    tx?: Prisma.TransactionClient,
  ): Promise<TemplateModelData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Updating template model", { id });
    try {
      const templateModel = await client.templateModel.update({
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

  /**
   * Deletes a template model by its ID.
   *
   * @param id - The template model ID.
   * @returns True if deleted, false if not found.
   */
  async deleteTemplateModel(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    this.logger.debug("Deleting template model", { id });
    try {
      await client.templateModel.delete({ where: { id } });
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

  /**
   * Creates a new field definition for a template model.
   *
   * @param templateModelId - The template model ID to add the field to.
   * @param data - The field definition data.
   * @returns The created field definition.
   */
  async createFieldDefinition(
    templateModelId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinition> {
    const client = tx ?? this.prisma;
    this.logger.debug("Creating field definition for template model", {
      field_key: data.field_key,
      templateModelId,
    });
    if (data.display_order === undefined) {
      const maxOrder = await client.fieldDefinition.aggregate({
        where: { template_model_id: templateModelId },
        _max: { display_order: true },
      });
      data.display_order = (maxOrder._max.display_order ?? -1) + 1;
    }
    return client.fieldDefinition.create({
      data: {
        template_model_id: templateModelId,
        field_key: data.field_key,
        field_type: data.field_type,
        field_format: data.field_format,
        display_order: data.display_order,
      },
    });
  }

  /**
   * Updates an existing field definition.
   *
   * @param id - The field definition ID.
   * @param data - The fields to update.
   * @returns The updated field definition, or null if not found.
   */
  async updateFieldDefinition(
    id: string,
    data: { field_format?: string; display_order?: number },
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinition | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Updating field definition", { id });
    try {
      return await client.fieldDefinition.update({
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

  /**
   * Deletes a field definition by its ID.
   *
   * @param id - The field definition ID.
   * @returns True if deleted, false if not found.
   */
  async deleteFieldDefinition(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    this.logger.debug("Deleting field definition", { id });
    try {
      await client.fieldDefinition.delete({ where: { id } });
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

  /**
   * Adds a labeling document to a template model by creating a labeled document record.
   *
   * @param templateModelId - The template model ID.
   * @param labelingDocumentId - The labeling document ID to add.
   * @returns The created labeled document with its labeling document and labels.
   */
  async addDocumentToTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LabeledDocumentData> {
    const client = tx ?? this.prisma;
    this.logger.debug("Adding document to template model", {
      labelingDocumentId,
      templateModelId,
    });
    const labeledDoc = await client.labeledDocument.create({
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

  /**
   * Finds a specific labeled document within a template model.
   *
   * @param templateModelId - The template model ID.
   * @param labelingDocumentId - The labeling document ID.
   * @returns The labeled document with its labeling document and labels, or null if not found.
   */
  async findLabeledDocument(
    templateModelId: string,
    labelingDocumentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LabeledDocumentData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding labeled document in template model", {
      labelingDocumentId,
      templateModelId,
    });
    const labeledDoc = await client.labeledDocument.findUnique({
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

  /**
   * Finds all labeled documents belonging to a template model.
   *
   * @param templateModelId - The template model ID.
   * @returns An array of labeled documents with their labeling documents and labels.
   */
  async findLabeledDocuments(
    templateModelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LabeledDocumentData[]> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding labeled documents for template model", {
      templateModelId,
    });
    const docs = await client.labeledDocument.findMany({
      where: { template_model_id: templateModelId },
      orderBy: { created_at: "desc" },
      include: {
        labeling_document: true,
        labels: true,
      },
    });
    return docs as LabeledDocumentData[];
  }

  /**
   * Removes a labeled document from a template model.
   *
   * @param templateModelId - The template model ID.
   * @param labelingDocumentId - The labeling document ID.
   * @returns True if removed, false if not found.
   */
  async removeDocumentFromTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    this.logger.debug("Removing document from template model", {
      labelingDocumentId,
      templateModelId,
    });
    try {
      await client.labeledDocument.delete({
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

  /**
   * Updates the labeling status of a labeled document.
   *
   * @param labeledDocId - The labeled document ID.
   * @param status - The new labeling status.
   */
  async updateLabeledDocument(
    labeledDocId: string,
    status: LabelingStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    this.logger.debug("Updating labeled document status", { labeledDocId });
    await client.labeledDocument.update({
      where: { id: labeledDocId },
      data: { status },
    });
  }

  /**
   * Replaces all labels on a labeled document with the provided set.
   *
   * @param labeledDocId - The labeled document ID.
   * @param labels - The new set of labels to persist.
   * @returns The saved document labels.
   */
  async upsertDocumentLabels(
    labeledDocId: string,
    labels: Array<{
      field_key: string;
      label_name: string;
      value?: string;
      page_number: number;
      bounding_box: unknown;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<import("@generated/client").DocumentLabel[]> {
    this.logger.debug("Saving labels for document", {
      count: labels.length,
      labeledDocId,
    });
    if (tx) {
      await tx.documentLabel.deleteMany({
        where: { labeled_doc_id: labeledDocId },
      });
      for (const label of labels) {
        await tx.documentLabel.create({
          data: {
            labeled_doc_id: labeledDocId,
            field_key: label.field_key,
            label_name: label.label_name,
            value: label.value,
            page_number: label.page_number,
            bounding_box: label.bounding_box as JsonValue,
          },
        });
      }
      return tx.documentLabel.findMany({
        where: { labeled_doc_id: labeledDocId },
      });
    }
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

  /**
   * Deletes a single document label by its ID.
   *
   * @param labelId - The document label ID.
   * @returns True if deleted, false if not found.
   */
  async deleteDocumentLabel(
    labelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    this.logger.debug("Deleting document label", { labelId });
    try {
      await client.documentLabel.delete({ where: { id: labelId } });
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
