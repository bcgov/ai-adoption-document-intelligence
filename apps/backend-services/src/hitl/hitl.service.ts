import {
  CorrectionAction,
  Document,
  DocumentStatus,
  OcrResult,
  ReviewSession,
  ReviewStatus,
} from "@generated/client";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DocumentField, ExtractedFields } from "@/ocr/azure-types";
import { DatabaseService } from "../database/database.service";
import { AnalyticsService } from "./analytics.service";
import { EscalateDto, SubmitCorrectionsDto } from "./dto/correction.dto";
import { AnalyticsFilterDto, QueueFilterDto } from "./dto/queue-filter.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import {
  DocumentStatusFilter,
  ReviewStatusFilter,
} from "./dto/status-constants.dto";

interface DocumentWithOcrResult extends Document {
  ocr_result: OcrResult | null;
  review_sessions?: Array<{
    id: string;
    reviewer_id: string;
    status: ReviewStatus;
    completed_at: Date | null;
    corrections?: unknown[];
  }>;
}

interface ReviewSessionWithDocument extends ReviewSession {
  document: DocumentWithOcrResult;
}

@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async getQueue(filters: QueueFilterDto) {
    this.logger.debug("Getting review queue with filters", filters);

    const maxConfidence = filters.maxConfidence ?? 0.9;

    const status =
      filters.status === DocumentStatusFilter.ALL
        ? undefined
        : DocumentStatus.completed_ocr;

    const reviewStatusFilter =
      filters.reviewStatus === ReviewStatusFilter.ALL
        ? "all"
        : filters.reviewStatus === ReviewStatusFilter.REVIEWED
          ? "reviewed"
          : "pending";

    const documents = await this.db.findReviewQueue({
      status,
      modelId: filters.modelId,
      maxConfidence: filters.maxConfidence ?? 0.9,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      reviewStatus: reviewStatusFilter,
    });

    // Filter by confidence if OCR results exist
    const filtered = documents.filter((doc: DocumentWithOcrResult) => {
      if (!doc.ocr_result) return false;

      const fields = doc.ocr_result
        .keyValuePairs as unknown as ExtractedFields | null;
      if (!fields) return false;
      if (typeof fields !== "object") return false;

      // Check if any field has confidence below threshold
      const hasLowConfidence = Object.values(fields).some(
        (field: DocumentField) => {
          if (field?.confidence !== undefined) {
            return field.confidence < maxConfidence;
          }
          return false;
        },
      );

      return hasLowConfidence;
    });

    return {
      documents: filtered.map((doc: DocumentWithOcrResult) => ({
        id: doc.id,
        original_filename: doc.original_filename,
        status: doc.status,
        model_id: doc.model_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        ocr_result: {
          fields: doc.ocr_result?.keyValuePairs || {},
        },
        lastSession: doc.review_sessions?.[0]
          ? {
              id: doc.review_sessions[0].id,
              reviewer_id: doc.review_sessions[0].reviewer_id,
              status: doc.review_sessions[0].status,
              completed_at: doc.review_sessions[0].completed_at,
              corrections_count:
                doc.review_sessions[0].corrections?.length || 0,
            }
          : undefined,
      })),
      total: filtered.length,
    };
  }

  async getQueueStats(reviewStatus?: ReviewStatusFilter) {
    this.logger.debug("Getting queue statistics");

    const reviewStatusFilter =
      reviewStatus === ReviewStatusFilter.ALL
        ? "all"
        : reviewStatus === ReviewStatusFilter.REVIEWED
          ? "reviewed"
          : "pending";

    const allDocs = await this.db.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      limit: 1000,
      reviewStatus: reviewStatusFilter,
    });

    const lowConfidenceDocs = allDocs.filter((doc: DocumentWithOcrResult) => {
      if (!doc.ocr_result?.keyValuePairs) return false;
      const fields = doc.ocr_result.keyValuePairs as unknown as ExtractedFields;
      if (typeof fields !== "object") return false;

      return Object.values(fields).some((field: DocumentField) => {
        if (field?.confidence !== undefined) {
          return field.confidence < 0.9;
        }
        return false;
      });
    });

    const analytics = await this.analyticsService.getAnalytics({});

    return {
      totalDocuments: allDocs.length,
      requiresReview: lowConfidenceDocs.length,
      averageConfidence: analytics.averageConfidence,
      reviewedToday: analytics.reviewedDocuments,
    };
  }

  async startSession(dto: ReviewSessionDto, reviewerId: string) {
    this.logger.debug(
      `Starting review session for document: ${dto.documentId}`,
    );

    // Verify document exists
    const document = await this.db.findDocument(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document ${dto.documentId} not found`);
    }

    // Create review session
    const session = await this.db.createReviewSession(
      dto.documentId,
      reviewerId,
    );

    return {
      id: session.id,
      documentId: session.document_id,
      reviewerId: session.reviewer_id,
      status: session.status,
      startedAt: session.started_at,
      document: {
        id: session.document.id,
        original_filename: session.document.original_filename,
        storage_path: session.document.file_path,
        ocr_result: {
          fields:
            (session.document as ReviewSessionWithDocument["document"])
              .ocr_result?.keyValuePairs || {},
        },
      },
    };
  }

  async getSession(id: string) {
    this.logger.debug(`Getting session: ${id}`);

    const session = await this.db.findReviewSession(id);
    if (!session) {
      throw new NotFoundException(`Review session ${id} not found`);
    }

    const doc = session.document as ReviewSessionWithDocument["document"];
    return {
      id: session.id,
      documentId: session.document_id,
      reviewerId: session.reviewer_id,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      document: {
        id: session.document.id,
        original_filename: session.document.original_filename,
        storage_path: session.document.file_path,
        ocr_result: {
          fields: doc.ocr_result?.keyValuePairs || {},
          enrichment_summary: doc.ocr_result?.enrichment_summary ?? undefined,
        },
      },
      corrections: session.corrections,
    };
  }

  async submitCorrections(sessionId: string, dto: SubmitCorrectionsDto) {
    this.logger.debug(`Submitting corrections for session: ${sessionId}`);

    const session = await this.db.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // Save all corrections
    const savedCorrections = await Promise.all(
      dto.corrections.map((correction) =>
        this.db.createFieldCorrection(sessionId, {
          field_key: correction.field_key,
          original_value: correction.original_value,
          corrected_value: correction.corrected_value,
          original_conf: correction.original_conf,
          action: correction.action,
        }),
      ),
    );

    return {
      sessionId,
      corrections: savedCorrections,
      message: `Saved ${savedCorrections.length} corrections`,
    };
  }

  async approveSession(sessionId: string) {
    this.logger.debug(`Approving session: ${sessionId}`);

    const session = await this.db.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const updated = await this.db.updateReviewSession(sessionId, {
      status: ReviewStatus.approved,
      completed_at: new Date(),
    });

    return {
      id: updated.id,
      status: updated.status,
      completedAt: updated.completed_at,
      message: "Review session approved",
    };
  }

  async escalateSession(sessionId: string, dto: EscalateDto) {
    this.logger.debug(`Escalating session: ${sessionId}`);

    const session = await this.db.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // Create a correction record to track the escalation reason
    await this.db.createFieldCorrection(sessionId, {
      field_key: "_escalation",
      original_value: dto.reason,
      action: CorrectionAction.flagged,
    });

    const updated = await this.db.updateReviewSession(sessionId, {
      status: ReviewStatus.escalated,
      completed_at: new Date(),
    });

    return {
      id: updated.id,
      status: updated.status,
      reason: dto.reason,
      message: "Review session escalated",
    };
  }

  async skipSession(sessionId: string) {
    this.logger.debug(`Skipping session: ${sessionId}`);

    const session = await this.db.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const updated = await this.db.updateReviewSession(sessionId, {
      status: ReviewStatus.skipped,
      completed_at: new Date(),
    });

    return {
      id: updated.id,
      status: updated.status,
      message: "Review session skipped",
    };
  }

  async getCorrections(sessionId: string) {
    this.logger.debug(`Getting corrections for session: ${sessionId}`);

    const session = await this.db.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const corrections = await this.db.findSessionCorrections(sessionId);

    return {
      sessionId,
      corrections: corrections.map((c) => ({
        id: c.id,
        fieldKey: c.field_key,
        originalValue: c.original_value,
        correctedValue: c.corrected_value,
        originalConfidence: c.original_conf,
        action: c.action,
        createdAt: c.created_at,
      })),
    };
  }

  async getAnalytics(filters: AnalyticsFilterDto) {
    this.logger.debug("Getting analytics");
    return this.analyticsService.getAnalytics(filters);
  }
}
