import {
  CorrectionAction,
  ClassifierSource,
  ClassifierStatus,
  Document,
  DocumentLabel,
  DocumentStatus,
  FieldCorrection,
  FieldDefinition,
  FieldType,
  LabeledDocument,
  LabelingProject,
  LabelingStatus,
  OcrResult,
  Prisma,
  PrismaClient,
  ProjectStatus,
  ReviewSession,
  ReviewStatus,
} from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import {
  AnalysisResponse,
  DocumentField,
  ExtractedFields,
  KeyValuePair,
} from "@/ocr/azure-types";

type JsonValue = Prisma.JsonValue;

import { getPrismaPgOptions } from "@/utils/database-url";

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

export type DocumentData = Document;
export type LabelingProjectData = LabelingProject & {
  field_schema: FieldDefinition[];
  documents?: LabeledDocument[];
};
export type LabelingDocumentData = {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown> | null;
  source: string;
  status: DocumentStatus;
  created_at: Date;
  updated_at: Date;
  apim_request_id?: string | null;
  model_id: string;
  ocr_result?: JsonValue | null;
};
export type LabeledDocumentData = LabeledDocument & {
  labeling_document: LabelingDocumentData;
  labels: DocumentLabel[];
};
export type ReviewSessionData = ReviewSession & {
  document: Document & {
    ocr_result: OcrResult | null;
  };
  corrections: FieldCorrection[];
};

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private prisma: PrismaClient;

  constructor(private configService: ConfigService) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      log: ["error", "warn"],
      adapter: new PrismaPg(dbOptions),
    });
    this.logger.log("Database service initialized with Prisma");
  }

  async createDocument(
    data: Omit<DocumentData, "created_at" | "updated_at">,
  ): Promise<DocumentData> {
    this.logger.debug("=== DatabaseService.createDocument ===");
    this.logger.debug(`Creating document: ${data.title}`);

    try {
      const document = await this.prisma.document.create({
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
        },
      });

      this.logger.debug(`Document created: ${document.id}`);
      this.logger.debug("=== DatabaseService.createDocument completed ===");

      return document;
    } catch (error) {
      this.logger.error(
        `Failed to create document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug("=== DatabaseService.findDocument ===");
    this.logger.debug(`Finding document: ${id}`);

    try {
      const document = await this.prisma.document.findUnique({
        where: { id },
      });

      if (document) {
        this.logger.debug(`Document found: ${document.id}`);
      } else {
        this.logger.debug(`Document not found: ${id}`);
      }

      this.logger.debug("=== DatabaseService.findDocument completed ===");
      return document;
    } catch (error) {
      this.logger.error(
        `Failed to find document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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
    this.logger.debug("=== DatabaseService.findAllDocuments ===");

    try {
      const documents = await this.prisma.document.findMany({
        orderBy: { created_at: "desc" },
      });

      this.logger.debug(`Found ${documents.length} documents`);
      this.logger.debug("=== DatabaseService.findAllDocuments completed ===");

      return documents;
    } catch (error) {
      this.logger.error(
        `Failed to find documents: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, "id" | "created_at">>,
  ): Promise<DocumentData | null> {
    this.logger.debug("=== DatabaseService.updateDocument ===");
    this.logger.debug(`Updating document: ${id}`);
    this.logger.debug(`Update data: ${JSON.stringify(data, null, 2)}`);

    try {
      const document = await this.prisma.document.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      this.logger.debug(`Document updated: ${document.id}`);
      this.logger.debug("=== DatabaseService.updateDocument completed ===");

      return document;
    } catch (error) {
      if (error.code === "P2025") {
        this.logger.debug(`Document not found for update: ${id}`);
        return null;
      }
      this.logger.error(
        `Failed to update document: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findOcrResult(documentId: string): Promise<OcrResult | null> {
    this.logger.debug("=== DatabaseService.findOcrResult ===");
    this.logger.debug(`Finding OCR result for document: ${documentId}`);

    try {
      const ocrResult = await this.prisma.ocrResult.findFirst({
        where: { document_id: documentId },
        orderBy: { processed_at: "desc" },
      });

      if (!ocrResult) {
        this.logger.debug(`No OCR result found for document: ${documentId}`);
        this.logger.debug("=== DatabaseService.findOcrResult completed ===");
        return null;
      }

      this.logger.debug(`OCR result found for document: ${documentId}`);
      this.logger.debug("=== DatabaseService.findOcrResult completed ===");

      return ocrResult;
    } catch (error) {
      this.logger.error(
        `Failed to find OCR result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Converts prebuilt model keyValuePairs array to the custom model fields format.
   * This ensures a unified format for all OCR results.
   */
  private convertKeyValuePairsToFields(
    keyValuePairs: KeyValuePair[],
  ): ExtractedFields {
    const fields: ExtractedFields = {};

    for (const pair of keyValuePairs) {
      const fieldName = pair.key?.content || "unknown";
      const field: DocumentField = {
        type: "string",
        content: pair.value?.content || null,
        confidence: pair.confidence,
        boundingRegions:
          pair.value?.boundingRegions || pair.key?.boundingRegions,
        spans: pair.value?.spans || pair.key?.spans,
      };

      // Handle duplicate field names by appending a suffix
      let uniqueName = fieldName;
      let counter = 1;
      while (fields[uniqueName]) {
        uniqueName = `${fieldName}_${counter}`;
        counter++;
      }

      fields[uniqueName] = field;
    }

    return fields;
  }

  async upsertOcrResult(data: {
    documentId: string;
    analysisResponse: AnalysisResponse;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.logger.debug("=== DatabaseService.upsertOcrResult ===");
    this.logger.debug(
      `Creating/Updating OCR result for document: ${data.documentId}`,
    );

    try {
      const analysisResult = data.analysisResponse.analyzeResult;
      const asJson = (obj): Prisma.JsonValue =>
        obj as unknown as Prisma.JsonValue;

      // Determine extracted fields based on model type
      let extractedFields: ExtractedFields | null = null;

      if (analysisResult.documents?.length > 0) {
        // Custom model: use fields directly from documents[0].fields
        extractedFields = analysisResult.documents[0].fields;
        this.logger.debug(
          `Using custom model fields: ${Object.keys(extractedFields).length} fields`,
        );
      } else if (analysisResult.keyValuePairs?.length > 0) {
        // Prebuilt model: convert keyValuePairs to fields format
        extractedFields = this.convertKeyValuePairsToFields(
          analysisResult.keyValuePairs,
        );
        this.logger.debug(
          `Converted ${analysisResult.keyValuePairs.length} keyValuePairs to fields format`,
        );
      }

      const updateObject = {
        processed_at: data.analysisResponse.lastUpdatedDateTime,
        keyValuePairs: asJson(extractedFields),
      };

      await this.prisma.ocrResult.upsert({
        where: {
          document_id: data.documentId,
        },
        update: updateObject,
        create: {
          document_id: data.documentId,
          ...updateObject,
        },
      });

      this.logger.debug(
        `OCR result created/updated for document: ${data.documentId}`,
      );
      this.logger.debug("=== DatabaseService.upsertOcrResult completed ===");
    } catch (error) {
      this.logger.error(
        `Failed to create/update OCR result: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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
}
