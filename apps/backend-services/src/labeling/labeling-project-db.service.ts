import {
  FieldDefinition,
  FieldType,
  LabelingStatus,
  Prisma,
  PrismaClient,
  ProjectStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import type {
  LabeledDocumentData,
  LabelingProjectData,
} from "./labeling-project-db.types";

type JsonValue = Prisma.JsonValue;

@Injectable()
export class LabelingProjectDbService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new labeling project.
   *
   * @param data - The project creation data including name, optional description, creator ID, and group ID.
   * @returns The created labeling project with its field schema.
   */
  async createLabelingProject(data: {
    name: string;
    description?: string;
    created_by: string;
    group_id: string;
  }): Promise<LabelingProjectData> {
    this.logger.debug("Creating labeling project", { name: data.name });
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

  /**
   * Finds a labeling project by its ID, including field schema and documents.
   *
   * @param id - The project ID.
   * @returns The labeling project with documents and labels, or null if not found.
   */
  async findLabelingProject(id: string): Promise<LabelingProjectData | null> {
    this.logger.debug("Finding labeling project", { id });
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

  /**
   * Finds all labeling projects, optionally filtered by group IDs.
   *
   * @param groupIds - Optional list of group IDs to filter by.
   * @returns An array of labeling projects with their field schemas.
   */
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

  /**
   * Updates a labeling project by its ID.
   *
   * @param id - The project ID.
   * @param data - The fields to update.
   * @returns The updated project, or null if not found.
   */
  async updateLabelingProject(
    id: string,
    data: { name?: string; description?: string; status?: ProjectStatus },
  ): Promise<LabelingProjectData | null> {
    this.logger.debug("Updating labeling project", { id });
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

  /**
   * Deletes a labeling project by its ID.
   *
   * @param id - The project ID.
   * @returns True if deleted, false if not found.
   */
  async deleteLabelingProject(id: string): Promise<boolean> {
    this.logger.debug("Deleting labeling project", { id });
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

  /**
   * Creates a new field definition for a labeling project.
   *
   * @param projectId - The project ID to add the field to.
   * @param data - The field definition data.
   * @returns The created field definition.
   */
  async createFieldDefinition(
    projectId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
  ): Promise<FieldDefinition> {
    this.logger.debug("Creating field definition for project", {
      field_key: data.field_key,
      projectId,
    });
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

  /**
   * Deletes a field definition by its ID.
   *
   * @param id - The field definition ID.
   * @returns True if deleted, false if not found.
   */
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

  /**
   * Adds a labeling document to a project by creating a labeled document record.
   *
   * @param projectId - The project ID.
   * @param labelingDocumentId - The labeling document ID to add.
   * @returns The created labeled document with its labeling document and labels.
   */
  async createLabeledDocument(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    this.logger.debug("Adding document to project", {
      labelingDocumentId,
      projectId,
    });
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

  /**
   * Finds a specific labeled document within a project.
   *
   * @param projectId - The project ID.
   * @param labelingDocumentId - The labeling document ID.
   * @returns The labeled document with its labeling document and labels, or null if not found.
   */
  async findLabeledDocument(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData | null> {
    this.logger.debug("Finding labeled document in project", {
      labelingDocumentId,
      projectId,
    });
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

  /**
   * Finds all labeled documents belonging to a project.
   *
   * @param projectId - The project ID.
   * @returns An array of labeled documents with their labeling documents and labels.
   */
  async findAllLabeledDocuments(
    projectId: string,
  ): Promise<LabeledDocumentData[]> {
    this.logger.debug("Finding labeled documents for project", { projectId });
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

  /**
   * Removes a labeled document from a project.
   *
   * @param projectId - The project ID.
   * @param labelingDocumentId - The labeling document ID.
   * @returns True if removed, false if not found.
   */
  async deleteLabeledDocument(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<boolean> {
    this.logger.debug("Removing document from project", {
      labelingDocumentId,
      projectId,
    });
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

  /**
   * Updates the labeling status of a labeled document.
   *
   * @param labeledDocId - The labeled document ID.
   * @param status - The new labeling status.
   */
  async updateLabeledDocument(
    labeledDocId: string,
    status: LabelingStatus,
  ): Promise<void> {
    this.logger.debug("Updating labeled document status", { labeledDocId });
    await this.prisma.labeledDocument.update({
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

  /**
   * Deletes a single document label by its ID.
   *
   * @param labelId - The document label ID.
   * @returns True if deleted, false if not found.
   */
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
