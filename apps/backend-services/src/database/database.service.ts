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
    group_id: string;
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
    userId?: string,
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

  async getClassifierModelsForGroups(groupIds: string[]) {
    return await this.prisma.classifierModel.findMany({
      where: {
        group_id: { in: groupIds },
      },
      include: {
        group: true,
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
}
