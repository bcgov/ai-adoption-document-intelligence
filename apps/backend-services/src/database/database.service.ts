import type {
  CorrectionAction,
  FieldType,
  LabelingStatus,
  ProjectStatus,
  ReviewStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import type { AnalysisResponse } from "@/ocr/azure-types";
import type {
  DocumentData,
  LabeledDocumentData,
  LabelingDocumentData,
  LabelingProjectData,
  ReviewSessionData,
} from "./database.types";
import { DocumentDbService } from "./document-db.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

export type {
  DocumentData,
  LabeledDocumentData,
  LabelingDocumentData,
  LabelingProjectData,
  ReviewSessionData,
};

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
  last_used_at?: Date;
  operation_location?: string;
}

@Injectable()
export class DatabaseService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly documentDb: DocumentDbService,
    private readonly labelingDocumentDb: LabelingDocumentDbService,
    private readonly labelingProjectDb: LabelingProjectDbService,
    private readonly reviewDb: ReviewDbService,
  ) {}

  get prisma() {
    return this.prismaService.prisma;
  }

  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    return this.documentDb.createDocument(data);
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    return this.documentDb.findDocument(id);
  }

  async createLabelingDocument(
    data: Omit<LabelingDocumentData, "id" | "created_at" | "updated_at">,
  ): Promise<LabelingDocumentData> {
    return this.labelingDocumentDb.createLabelingDocument(data);
  }

  async findLabelingDocument(id: string): Promise<LabelingDocumentData | null> {
    return this.labelingDocumentDb.findLabelingDocument(id);
  }

  async updateLabelingDocument(
    id: string,
    data: Partial<LabelingDocumentData>,
  ): Promise<LabelingDocumentData | null> {
    return this.labelingDocumentDb.updateLabelingDocument(id, data);
  }

  async createLabelingDocument(
    data: Omit<LabelingDocumentData, "id" | "created_at" | "updated_at">,
  ): Promise<LabelingDocumentData> {
    this.logger.debug("=== DatabaseService.createLabelingDocument ===");
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
      },
    });
    return labelingDocument as LabelingDocumentData;
  }

  async findLabelingDocument(id: string): Promise<LabelingDocumentData | null> {
    this.logger.debug("=== DatabaseService.findLabelingDocument ===");
    const labelingDocument = await this.prisma.labelingDocument.findUnique({
      where: { id },
    });
    return labelingDocument as LabelingDocumentData | null;
  }

  async updateLabelingDocument(
    id: string,
    data: Partial<LabelingDocumentData>,
  ): Promise<LabelingDocumentData | null> {
    this.logger.debug("=== DatabaseService.updateLabelingDocument ===");
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
    } catch (error) {
      if (error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  async findAllDocuments(): Promise<DocumentData[]> {
    return this.documentDb.findAllDocuments();
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    return this.documentDb.updateDocument(id, data);
  }

  async findOcrResult(documentId: string) {
    return this.documentDb.findOcrResult(documentId);
  }

  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    return this.documentDb.upsertOcrResult(data);
  }

  async createLabelingProject(data: {
    name: string;
    description?: string;
    created_by: string;
  }): Promise<LabelingProjectData> {
    return this.labelingProjectDb.createLabelingProject(data);
  }

  async findLabelingProject(id: string): Promise<LabelingProjectData | null> {
    return this.labelingProjectDb.findLabelingProject(id);
  }

  async findAllLabelingProjects(
    userId?: string,
  ): Promise<LabelingProjectData[]> {
    return this.labelingProjectDb.findAllLabelingProjects(userId);
  }

  async updateLabelingProject(
    id: string,
    data: { name?: string; description?: string; status?: ProjectStatus },
  ): Promise<LabelingProjectData | null> {
    return this.labelingProjectDb.updateLabelingProject(id, data);
  }

  async deleteLabelingProject(id: string): Promise<boolean> {
    return this.labelingProjectDb.deleteLabelingProject(id);
  }

  async createFieldDefinition(
    projectId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
  ) {
    return this.labelingProjectDb.createFieldDefinition(projectId, data);
  }

  async updateFieldDefinition(
    id: string,
    data: { field_format?: string; display_order?: number },
  ) {
    return this.labelingProjectDb.updateFieldDefinition(id, data);
  }

  async deleteFieldDefinition(id: string): Promise<boolean> {
    return this.labelingProjectDb.deleteFieldDefinition(id);
  }

  async addDocumentToProject(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    return this.labelingProjectDb.addDocumentToProject(
      projectId,
      labelingDocumentId,
    );
  }

  async findLabeledDocument(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData | null> {
    return this.labelingProjectDb.findLabeledDocument(
      projectId,
      labelingDocumentId,
    );
  }

  async findLabeledDocuments(
    projectId: string,
  ): Promise<LabeledDocumentData[]> {
    return this.labelingProjectDb.findLabeledDocuments(projectId);
  }

  async removeDocumentFromProject(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<boolean> {
    return this.labelingProjectDb.removeDocumentFromProject(
      projectId,
      labelingDocumentId,
    );
  }

  async updateLabeledDocumentStatus(
    labeledDocId: string,
    status: LabelingStatus,
  ): Promise<void> {
    return this.labelingProjectDb.updateLabeledDocumentStatus(
      labeledDocId,
      status,
    );
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
  ) {
    return this.labelingProjectDb.saveDocumentLabels(labeledDocId, labels);
  }

  async deleteDocumentLabel(labelId: string): Promise<boolean> {
    return this.labelingProjectDb.deleteDocumentLabel(labelId);
  }

  async createReviewSession(
    documentId: string,
    reviewerId: string,
  ): Promise<ReviewSessionData> {
    return this.reviewDb.createReviewSession(documentId, reviewerId);
  }

  async findReviewSession(id: string): Promise<ReviewSessionData | null> {
    return this.reviewDb.findReviewSession(id);
  }

  async findReviewQueue(filters: {
    status?: import("@generated/client").DocumentStatus;
    modelId?: string;
    minConfidence?: number;
    maxConfidence?: number;
    limit?: number;
    offset?: number;
    reviewStatus?: "pending" | "reviewed" | "all";
  }) {
    return this.reviewDb.findReviewQueue(filters);
  }

  async updateReviewSession(
    id: string,
    data: { status?: ReviewStatus; completed_at?: Date },
  ): Promise<ReviewSessionData | null> {
    return this.reviewDb.updateReviewSession(id, data);
  }

  async createFieldCorrection(
    sessionId: string,
    data: {
      field_key: string;
      original_value?: string;
      corrected_value?: string;
      original_conf?: number;
      action: CorrectionAction;
    },
  ) {
    return this.reviewDb.createFieldCorrection(sessionId, data);
  }

  async findSessionCorrections(sessionId: string) {
    return this.reviewDb.findSessionCorrections(sessionId);
  }

  async getReviewAnalytics(filters: {
    startDate?: Date;
    endDate?: Date;
    reviewerId?: string;
  }) {
    return this.reviewDb.getReviewAnalytics(filters);
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
        user_id: userId,
      },
    });
  }

  async isUserInGroup(userId: string, groupId: string) {
    const entry = await this.prisma.userGroup.findUnique({
      where: {
        user_id_group_id: {
          user_id: userId,
          group_id: groupId,
        },
      },
    });
    return entry != null;
  }

  // ========== LABELING PROJECT OPERATIONS ==========

  async createLabelingProject(data: {
    name: string;
    description?: string;
    created_by: string;
  }): Promise<LabelingProjectData> {
    this.logger.debug(`Creating labeling project: ${data.name}`);
    const project = await this.prisma.labelingProject.create({
      data: {
        name: data.name,
        description: data.description,
        created_by: data.created_by,
        status: ProjectStatus.active,
      },
      include: {
        field_schema: { orderBy: { display_order: "asc" } },
      },
    });
    return project as LabelingProjectData;
  }

  async findLabelingProject(id: string): Promise<LabelingProjectData | null> {
    this.logger.debug(`Finding labeling project: ${id}`);
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
    userId?: string,
  ): Promise<LabelingProjectData[]> {
    this.logger.debug("Finding all labeling projects");
    const projects = await this.prisma.labelingProject.findMany({
      where: userId ? { created_by: userId } : undefined,
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
    this.logger.debug(`Updating labeling project: ${id}`);
    try {
      const project = await this.prisma.labelingProject.update({
        where: { id },
        data,
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
      return project as LabelingProjectData;
    } catch (error) {
      if (error.code === "P2025") return null;
      throw error;
    }
  }

  async deleteLabelingProject(id: string): Promise<boolean> {
    this.logger.debug(`Deleting labeling project: ${id}`);
    try {
      await this.prisma.labelingProject.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error.code === "P2025") return false;
      throw error;
    }
  }

  // ========== FIELD DEFINITION OPERATIONS ==========

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
      `Creating field definition: ${data.field_key} for project: ${projectId}`,
    );

    // Get max display_order if not provided
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
    data: {
      field_format?: string;
      display_order?: number;
    },
  ): Promise<FieldDefinition | null> {
    this.logger.debug(`Updating field definition: ${id}`);
    try {
      return await this.prisma.fieldDefinition.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === "P2025") return null;
      throw error;
    }
  }

  async deleteFieldDefinition(id: string): Promise<boolean> {
    this.logger.debug(`Deleting field definition: ${id}`);
    try {
      await this.prisma.fieldDefinition.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error.code === "P2025") return false;
      throw error;
    }
  }

  // ========== LABELED DOCUMENT OPERATIONS ==========

  async addDocumentToProject(
    projectId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    this.logger.debug(
      `Adding document ${labelingDocumentId} to project ${projectId}`,
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
      `Finding labeled document ${labelingDocumentId} in project ${projectId}`,
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
    this.logger.debug(`Finding labeled documents for project: ${projectId}`);
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
      `Removing document ${labelingDocumentId} from project ${projectId}`,
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
    } catch (error) {
      if (error.code === "P2025") return false;
      throw error;
    }
  }

  async updateLabeledDocumentStatus(
    labeledDocId: string,
    status: LabelingStatus,
  ): Promise<void> {
    this.logger.debug(`Updating labeled document status: ${labeledDocId}`);
    await this.prisma.labeledDocument.update({
      where: { id: labeledDocId },
      data: { status },
    });
  }

  // ========== DOCUMENT LABEL OPERATIONS ==========

  async saveDocumentLabels(
    labeledDocId: string,
    labels: Array<{
      field_key: string;
      label_name: string;
      value?: string;
      page_number: number;
      bounding_box: unknown;
    }>,
  ): Promise<DocumentLabel[]> {
    this.logger.debug(
      `Saving ${labels.length} labels for document: ${labeledDocId}`,
    );

    // Delete existing labels and create new ones in a transaction
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

    // Return the created labels
    return this.prisma.documentLabel.findMany({
      where: { labeled_doc_id: labeledDocId },
    });
  }

  async deleteDocumentLabel(labelId: string): Promise<boolean> {
    this.logger.debug(`Deleting document label: ${labelId}`);
    try {
      await this.prisma.documentLabel.delete({ where: { id: labelId } });
      return true;
    } catch (error) {
      if (error.code === "P2025") return false;
      throw error;
    }
  }

  // ========== HITL REVIEW SESSION OPERATIONS ==========

  async createReviewSession(
    documentId: string,
    reviewerId: string,
  ): Promise<ReviewSessionData> {
    this.logger.debug(`Creating review session for document: ${documentId}`);
    const session = await this.prisma.reviewSession.create({
      data: {
        document_id: documentId,
        reviewer_id: reviewerId,
        status: ReviewStatus.in_progress,
      },
      include: {
        document: {
          include: {
            ocr_result: true,
          },
        },
        corrections: true,
      },
    });
    return session as ReviewSessionData;
  }

  async findReviewSession(id: string): Promise<ReviewSessionData | null> {
    this.logger.debug(`Finding review session: ${id}`);
    const session = await this.prisma.reviewSession.findUnique({
      where: { id },
      include: {
        document: {
          include: {
            ocr_result: true,
          },
        },
        corrections: true,
      },
    });
    return session as ReviewSessionData | null;
  }

  async findReviewQueue(filters: {
    status?: DocumentStatus;
    modelId?: string;
    minConfidence?: number;
    maxConfidence?: number;
    limit?: number;
    offset?: number;
    reviewStatus?: "pending" | "reviewed" | "all";
  }): Promise<Document[]> {
    this.logger.debug("Finding review queue");

    const where: Prisma.DocumentWhereInput = {
      status: filters.status ?? DocumentStatus.completed_ocr,
    };

    if (filters.modelId) {
      where.model_id = filters.modelId;
    }

    if (filters.reviewStatus === "pending") {
      where.OR = [
        { review_sessions: { none: {} } },
        {
          review_sessions: {
            every: { status: ReviewStatus.in_progress },
          },
        },
      ];
    } else if (filters.reviewStatus === "reviewed") {
      where.review_sessions = {
        some: {
          status: {
            in: [
              ReviewStatus.approved,
              ReviewStatus.escalated,
              ReviewStatus.skipped,
            ],
          },
        },
      };
    }

    return this.prisma.document.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: {
        ocr_result: true,
        review_sessions: {
          where: {
            status: {
              in: [
                ReviewStatus.approved,
                ReviewStatus.escalated,
                ReviewStatus.skipped,
              ],
            },
          },
          include: {
            corrections: true,
          },
          orderBy: { completed_at: "desc" },
          take: 1,
        },
      },
    });
  }

  async updateReviewSession(
    id: string,
    data: { status?: ReviewStatus; completed_at?: Date },
  ): Promise<ReviewSessionData | null> {
    this.logger.debug(`Updating review session: ${id}`);
    try {
      const session = await this.prisma.reviewSession.update({
        where: { id },
        data,
        include: {
          document: true,
          corrections: true,
        },
      });
      return session as ReviewSessionData;
    } catch (error) {
      if (error.code === "P2025") return null;
      throw error;
    }
  }

  // ========== FIELD CORRECTION OPERATIONS ==========

  async createFieldCorrection(
    sessionId: string,
    data: {
      field_key: string;
      original_value?: string;
      corrected_value?: string;
      original_conf?: number;
      action: CorrectionAction;
    },
  ): Promise<FieldCorrection> {
    this.logger.debug(`Creating field correction for session: ${sessionId}`);
    return this.prisma.fieldCorrection.create({
      data: {
        session_id: sessionId,
        ...data,
      },
    });
  }

  async findSessionCorrections(sessionId: string): Promise<FieldCorrection[]> {
    this.logger.debug(`Finding corrections for session: ${sessionId}`);
    return this.prisma.fieldCorrection.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "asc" },
    });
  }

  async getReviewAnalytics(filters: {
    startDate?: Date;
    endDate?: Date;
    reviewerId?: string;
  }): Promise<{
    totalSessions: number;
    completedSessions: number;
    totalCorrections: number;
    correctionsByAction: Record<string, number>;
    averageConfidence: number;
  }> {
    this.logger.debug("Getting review analytics");

    const where: Prisma.ReviewSessionWhereInput = {};
    if (filters.startDate || filters.endDate) {
      where.started_at = {};
      if (filters.startDate) where.started_at.gte = filters.startDate;
      if (filters.endDate) where.started_at.lte = filters.endDate;
    }
    if (filters.reviewerId) {
      where.reviewer_id = filters.reviewerId;
    }

    const [sessions, corrections] = await Promise.all([
      this.prisma.reviewSession.findMany({ where }),
      this.prisma.fieldCorrection.findMany({
        where: {
          session: where,
        },
      }),
    ]);

    const correctionsByAction = corrections.reduce(
      (acc, c) => {
        acc[c.action] = (acc[c.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calculate average confidence from corrections with original_conf values
    const correctionsWithConfidence = corrections.filter(
      (c) => c.original_conf !== null && c.original_conf !== undefined,
    );
    const averageConfidence =
      correctionsWithConfidence.length > 0
        ? correctionsWithConfidence.reduce(
            (sum, c) => sum + (c.original_conf ?? 0),
            0,
          ) / correctionsWithConfidence.length
        : 0;

    return {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(
        (s) => s.status === ReviewStatus.approved,
      ).length,
      totalCorrections: corrections.length,
      correctionsByAction,
      averageConfidence: Math.round(averageConfidence * 10000) / 10000, // Round to 4 decimal places
    };
  }
}
