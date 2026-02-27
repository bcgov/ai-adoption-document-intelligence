import {
  FieldDefinition,
  FieldType,
  LabelingStatus,
  Prisma,
  PrismaClient,
  ProjectStatus,
} from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import type {
  LabeledDocumentData,
  LabelingProjectData,
} from "./database.types";
import { PrismaService } from "./prisma.service";

type JsonValue = Prisma.JsonValue;

@Injectable()
export class LabelingProjectDbService {
  private readonly logger = new Logger(LabelingProjectDbService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createLabelingProject(data: {
    name: string;
    description?: string;
    created_by: string;
    group_id: string;
  }): Promise<LabelingProjectData> {
    this.logger.debug("Creating labeling project: %s", data.name);
    const project = await this.prisma.labelingProject.create({
      data: {
        name: data.name,
        description: data.description,
        created_by: data.created_by,
        group_id: data.group_id,
        status: ProjectStatus.active,
      },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
      },
    });
    return project as LabelingProjectData;
  }

  async findLabelingProject(id: string): Promise<LabelingProjectData | null> {
    this.logger.debug("Finding labeling project: %s", id);
    const project = await this.prisma.labelingProject.findUnique({
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
    return project as LabelingProjectData | null;
  }

  async findAllLabelingProjects(
    groupIds?: string[],
  ): Promise<LabelingProjectData[]> {
    this.logger.debug("Finding all labeling projects");
    const projects = await this.prisma.labelingProject.findMany({
      where: groupIds ? { group_id: { in: groupIds } } : undefined,
      orderBy: { updated_at: "desc" },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
        _count: { select: { documents: true } },
      },
    });
    return projects as LabelingProjectData[];
  }

  async updateLabelingProject(
    id: string,
    data: { name?: string; description?: string; status?: ProjectStatus },
  ): Promise<LabelingProjectData | null> {
    this.logger.debug("Updating labeling project: %s", id);
    try {
      const project = await this.prisma.labelingProject.update({
        where: { id },
        data,
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
      return project as LabelingProjectData;
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

  async deleteLabelingProject(id: string): Promise<boolean> {
    this.logger.debug("Deleting labeling project: %s", id);
    try {
      await this.prisma.labelingProject.delete({ where: { id } });
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
    projectId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
  ): Promise<FieldDefinition> {
    this.logger.debug(
      "Creating field definition: %s for project: %s",
      data.field_key,
      projectId,
    );
    if (data.display_order === undefined) {
      const maxOrder = await this.prisma.fieldDefinition.aggregate({
        where: { project_id: projectId },
        _max: { display_order: true },
      });
      data.display_order = (maxOrder._max.display_order ?? -1) + 1;
    }
    return this.prisma.fieldDefinition.create({
      data: {
        project_id: projectId,
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
    this.logger.debug("Updating field definition: %s", id);
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
    this.logger.debug("Deleting field definition: %s", id);
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

  async addDocumentToProject(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    this.logger.debug(
      "Adding document %s to project %s",
      labelingDocumentId,
      projectId,
    );
    const labeledDoc = await this.prisma.labeledDocument.create({
      data: {
        project_id: projectId,
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
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData | null> {
    this.logger.debug(
      "Finding labeled document %s in project %s",
      labelingDocumentId,
      projectId,
    );
    const labeledDoc = await this.prisma.labeledDocument.findUnique({
      where: {
        project_id_labeling_document_id: {
          project_id: projectId,
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
    projectId: string,
  ): Promise<LabeledDocumentData[]> {
    this.logger.debug("Finding labeled documents for project: %s", projectId);
    const docs = await this.prisma.labeledDocument.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: "desc" },
      include: {
        labeling_document: true,
        labels: true,
      },
    });
    return docs as LabeledDocumentData[];
  }

  async removeDocumentFromProject(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<boolean> {
    this.logger.debug(
      "Removing document %s from project %s",
      labelingDocumentId,
      projectId,
    );
    try {
      await this.prisma.labeledDocument.delete({
        where: {
          project_id_labeling_document_id: {
            project_id: projectId,
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
    this.logger.debug("Updating labeled document status: %s", labeledDocId);
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
    this.logger.debug(
      "Saving %d labels for document: %s",
      labels.length,
      labeledDocId,
    );
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
    this.logger.debug("Deleting document label: %s", labelId);
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
