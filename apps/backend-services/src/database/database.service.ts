import type {
  CorrectionAction,
  DocumentStatus,
  FieldType,
  LabelingStatus,
  OcrResult,
  Prisma,
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
    groupIds?: string[],
  ): Promise<LabelingProjectData[]> {
    return this.labelingProjectDb.findAllLabelingProjects(groupIds);
  }

  async updateLabelingProject(
    id: string,
    data: {
      name?: string;
      description?: string;
      status?: ProjectStatus;
    },
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
