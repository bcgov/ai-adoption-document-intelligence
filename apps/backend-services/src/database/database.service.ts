import type {
  CorrectionAction,
  FieldType,
  LabelingStatus,
  ReviewStatus,
  TemplateModelStatus,
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
  ReviewSessionData,
  TemplateModelData,
} from "./database.types";
import { DocumentDbService } from "./document-db.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { TemplateModelDbService } from "./template-model-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

export type {
  DocumentData,
  LabeledDocumentData,
  LabelingDocumentData,
  ReviewSessionData,
  TemplateModelData,
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
    private readonly templateModelDb: TemplateModelDbService,
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

  async findAllDocuments(groupIds?: string[]): Promise<DocumentData[]> {
    return this.documentDb.findAllDocuments(groupIds);
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    return this.documentDb.updateDocument(id, data);
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.documentDb.deleteDocument(id);
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

  async createTemplateModel(data: {
    name: string;
    model_id: string;
    description?: string;
    created_by: string;
    group_id: string;
  }): Promise<TemplateModelData> {
    return this.templateModelDb.createTemplateModel(data);
  }

  async findTemplateModel(id: string): Promise<TemplateModelData | null> {
    return this.templateModelDb.findTemplateModel(id);
  }

  async findTemplateModelByModelId(
    modelId: string,
  ): Promise<TemplateModelData | null> {
    return this.templateModelDb.findTemplateModelByModelId(modelId);
  }

  async findAllTemplateModels(
    groupIds?: string[],
  ): Promise<TemplateModelData[]> {
    return this.templateModelDb.findAllTemplateModels(groupIds);
  }

  async updateTemplateModel(
    id: string,
    data: {
      name?: string;
      description?: string;
      status?: TemplateModelStatus;
    },
  ): Promise<TemplateModelData | null> {
    return this.templateModelDb.updateTemplateModel(id, data);
  }

  async deleteTemplateModel(id: string): Promise<boolean> {
    return this.templateModelDb.deleteTemplateModel(id);
  }

  async createFieldDefinition(
    templateModelId: string,
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      display_order?: number;
    },
  ) {
    return this.templateModelDb.createFieldDefinition(templateModelId, data);
  }

  async updateFieldDefinition(
    id: string,
    data: { field_format?: string; display_order?: number },
  ) {
    return this.templateModelDb.updateFieldDefinition(id, data);
  }

  async deleteFieldDefinition(id: string): Promise<boolean> {
    return this.templateModelDb.deleteFieldDefinition(id);
  }

  async addDocumentToTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData> {
    return this.templateModelDb.addDocumentToTemplateModel(
      templateModelId,
      labelingDocumentId,
    );
  }

  async findLabeledDocument(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<LabeledDocumentData | null> {
    return this.templateModelDb.findLabeledDocument(
      templateModelId,
      labelingDocumentId,
    );
  }

  async findLabeledDocuments(
    templateModelId: string,
  ): Promise<LabeledDocumentData[]> {
    return this.templateModelDb.findLabeledDocuments(templateModelId);
  }

  async removeDocumentFromTemplateModel(
    templateModelId: string,
    labelingDocumentId: string,
  ): Promise<boolean> {
    return this.templateModelDb.removeDocumentFromTemplateModel(
      templateModelId,
      labelingDocumentId,
    );
  }

  async updateLabeledDocumentStatus(
    labeledDocId: string,
    status: LabelingStatus,
  ): Promise<void> {
    return this.templateModelDb.updateLabeledDocumentStatus(
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
    return this.templateModelDb.saveDocumentLabels(labeledDocId, labels);
  }

  async deleteDocumentLabel(labelId: string): Promise<boolean> {
    return this.templateModelDb.deleteDocumentLabel(labelId);
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
    groupIds?: string[];
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
    groupIds?: string[];
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

  /**
   * Checks whether a user is a system admin.
   *
   * @param userId - The ID of the user to check.
   * @returns `true` when the user has `is_system_admin` set to `true`, `false` otherwise.
   */
  async isUserSystemAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { is_system_admin: true },
    });
    return user?.is_system_admin ?? false;
  }
}
