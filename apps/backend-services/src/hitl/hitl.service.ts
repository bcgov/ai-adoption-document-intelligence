import {
  CorrectionAction,
  Document,
  DocumentStatus,
  OcrResult,
  Prisma,
  ReviewSession,
  ReviewStatus,
} from "@generated/client";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { AuditService } from "@/audit/audit.service";
import { DocumentField, ExtractedFields } from "@/ocr/azure-types";
import { GroundTruthGenerationService } from "../benchmark/ground-truth-generation.service";
import { DocumentService } from "../document/document.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { AnalyticsService } from "./analytics.service";
import { EscalateDto, SubmitCorrectionsDto } from "./dto/correction.dto";
import { AnalyticsFilterDto, QueueFilterDto } from "./dto/queue-filter.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import {
  DocumentStatusFilter,
  ReviewStatusFilter,
} from "./dto/status-constants.dto";
import { ReviewDbService } from "./review-db.service";
import type { ReviewSessionData } from "./review-db.types";

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
  constructor(
    private readonly documentService: DocumentService,
    private readonly reviewDb: ReviewDbService,
    private readonly analyticsService: AnalyticsService,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getQueue(filters: QueueFilterDto, groupIds?: string[]) {
    this.logger.debug("Getting review queue with filters", { ...filters });

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

    const documents = await this.reviewDb.findReviewQueue({
      status,
      modelId: filters.modelId,
      maxConfidence: filters.maxConfidence ?? 0.9,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      reviewStatus: reviewStatusFilter,
      groupIds,
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

  async getQueueStats(reviewStatus?: ReviewStatusFilter, groupIds?: string[]) {
    this.logger.debug("Getting queue statistics");

    const reviewStatusFilter =
      reviewStatus === ReviewStatusFilter.ALL
        ? "all"
        : reviewStatus === ReviewStatusFilter.REVIEWED
          ? "reviewed"
          : "pending";

    const allDocs = await this.reviewDb.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      limit: 1000,
      reviewStatus: reviewStatusFilter,
      groupIds,
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

    const analytics = await this.analyticsService.getAnalytics({}, groupIds);

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
    const document = await this.documentService.findDocument(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document ${dto.documentId} not found`);
    }

    // Check for existing lock
    const existingLock = await this.reviewDb.findActiveLock(dto.documentId);
    if (existingLock) {
      if (existingLock.reviewer_id === reviewerId) {
        // Same reviewer — return existing session
        return this.getSession(existingLock.session_id);
      }
      throw new ConflictException(
        "Document is currently locked by another reviewer",
      );
    }

    // Create review session
    const session = await this.reviewDb.createReviewSession(
      dto.documentId,
      reviewerId,
    );

    // Acquire document lock with 10-minute TTL
    const lockTtlMs = 10 * 60 * 1000;
    await this.reviewDb.acquireDocumentLock({
      document_id: dto.documentId,
      reviewer_id: reviewerId,
      session_id: session.id,
      expires_at: new Date(Date.now() + lockTtlMs),
    });

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_session_started",
      resource_type: "review_session",
      resource_id: session.id,
      actor_id: reviewerId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { document_id: session.document_id },
    });

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

  /**
   * Returns a raw review session for authorization checks (e.g. group membership).
   * @param id - The review session ID.
   * @param tx - Optional transaction client for atomic operations.
   * @returns The review session data, or null if not found.
   */
  async findReviewSession(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewSessionData | null> {
    return this.reviewDb.findReviewSession(id, tx);
  }

  /**
   * Returns raw documents from the review queue for data access needs.
   * @param filters - Filtering options for the queue.
   * @param tx - Optional transaction client for atomic operations.
   * @returns Array of documents matching the filters.
   */
  async findReviewQueue(
    filters: {
      status?: DocumentStatus;
      modelId?: string;
      minConfidence?: number;
      maxConfidence?: number;
      limit?: number;
      offset?: number;
      reviewStatus?: "pending" | "reviewed" | "all";
      groupIds?: string[];
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Document[]> {
    return this.reviewDb.findReviewQueue(filters, tx);
  }

  async getSession(id: string) {
    this.logger.debug(`Getting session: ${id}`);

    const session = await this.reviewDb.findReviewSession(id);
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

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // Save all corrections
    const savedCorrections = await Promise.all(
      dto.corrections.map((correction) =>
        this.reviewDb.createFieldCorrection(sessionId, {
          field_key: correction.field_key,
          original_value: correction.original_value,
          corrected_value: correction.corrected_value,
          original_conf: correction.original_conf,
          action: correction.action,
        }),
      ),
    );

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_corrections_submitted",
      resource_type: "review_session",
      resource_id: sessionId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { correction_count: savedCorrections.length },
    });

    return {
      sessionId,
      corrections: savedCorrections,
      message: `Saved ${savedCorrections.length} corrections`,
    };
  }

  async approveSession(sessionId: string) {
    this.logger.debug(`Approving session: ${sessionId}`);

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const updated = await this.reviewDb.updateReviewSession(sessionId, {
      status: ReviewStatus.approved,
      completed_at: new Date(),
    });

    await this.reviewDb.releaseDocumentLock(sessionId);

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_session_approved",
      resource_type: "review_session",
      resource_id: sessionId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { document_id: session.document_id },
    });

    if (!updated) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // Post-approval hook: complete ground truth job if this document is part of GT generation.
    // ModuleRef.get() lazily resolves GroundTruthGenerationService at runtime to avoid a circular
    // module dependency between HitlModule and BenchmarkModule. The call is one-directional
    // (HITL notifies Benchmark) and non-critical (approval succeeds even if the service is unavailable).
    try {
      const gtService = this.moduleRef.get(GroundTruthGenerationService, {
        strict: false,
      });
      if (gtService) {
        const job = await gtService.getJobByDocumentId(session.document_id);
        if (job) {
          await gtService.completeJob(job.id, sessionId, session.corrections);
          this.logger.log(
            `Ground truth generated for job ${job.id} via session ${sessionId}`,
          );
        }
      }
    } catch (error) {
      // Non-critical: log but don't fail the approval
      this.logger.warn(
        `Ground truth post-approval hook error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      id: updated.id,
      status: updated.status,
      completedAt: updated.completed_at,
      message: "Review session approved",
    };
  }

  async escalateSession(sessionId: string, dto: EscalateDto) {
    this.logger.debug(`Escalating session: ${sessionId}`);

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // Create a correction record to track the escalation reason
    await this.reviewDb.createFieldCorrection(sessionId, {
      field_key: "_escalation",
      original_value: dto.reason,
      action: CorrectionAction.flagged,
    });

    const updated = await this.reviewDb.updateReviewSession(sessionId, {
      status: ReviewStatus.escalated,
      completed_at: new Date(),
    });

    await this.reviewDb.releaseDocumentLock(sessionId);

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_session_escalated",
      resource_type: "review_session",
      resource_id: sessionId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { document_id: session.document_id, reason: dto.reason },
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

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const updated = await this.reviewDb.updateReviewSession(sessionId, {
      status: ReviewStatus.skipped,
      completed_at: new Date(),
    });

    await this.reviewDb.releaseDocumentLock(sessionId);

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_session_skipped",
      resource_type: "review_session",
      resource_id: sessionId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { document_id: session.document_id },
    });

    return {
      id: updated.id,
      status: updated.status,
      message: "Review session skipped",
    };
  }

  async getCorrections(sessionId: string) {
    this.logger.debug(`Getting corrections for session: ${sessionId}`);

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    const corrections = await this.reviewDb.findSessionCorrections(sessionId);

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

  async getAnalytics(filters: AnalyticsFilterDto, groupIds?: string[]) {
    this.logger.debug("Getting analytics");
    return this.analyticsService.getAnalytics(filters, groupIds);
  }

  async heartbeat(sessionId: string) {
    const lockTtlMs = 10 * 60 * 1000;
    const newExpiry = new Date(Date.now() + lockTtlMs);
    const refreshed = await this.reviewDb.refreshLockHeartbeat(
      sessionId,
      newExpiry,
    );
    if (!refreshed) {
      throw new ConflictException("Lock expired or session not found");
    }
    return { ok: true, expiresAt: newExpiry };
  }

  async deleteCorrection(sessionId: string, correctionId: string) {
    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }
    const deleted = await this.reviewDb.deleteCorrection(
      correctionId,
      sessionId,
    );
    if (!deleted) {
      throw new NotFoundException(`Correction ${correctionId} not found`);
    }
    return { deleted: true };
  }

  async reopenSession(sessionId: string, reviewerId: string) {
    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    if (session.reviewer_id !== reviewerId) {
      throw new ForbiddenException(
        "Only the original reviewer can reopen this session",
      );
    }

    if (session.status === ReviewStatus.in_progress) {
      throw new ConflictException("Session is already in progress");
    }

    // Determine reopen eligibility based on workflow type
    const groundTruthJob = session.document.groundTruthJob;
    if (groundTruthJob) {
      // Dataset labeling workflow: block if dataset version is frozen
      if (groundTruthJob.datasetVersion.frozen) {
        throw new ConflictException(
          "Cannot reopen: dataset version is frozen",
        );
      }
    } else {
      // Regular workflow: allow within 5 minutes of completion
      const fiveMinutesMs = 5 * 60 * 1000;
      if (
        !session.completed_at ||
        Date.now() - session.completed_at.getTime() > fiveMinutesMs
      ) {
        throw new ConflictException(
          "Cannot reopen: reopen window has expired",
        );
      }
    }

    // Update session to in_progress
    await this.reviewDb.updateReviewSession(sessionId, {
      status: ReviewStatus.in_progress,
      completed_at: null,
    });

    // Re-acquire document lock
    const lockTtlMs = 10 * 60 * 1000;
    await this.reviewDb.acquireDocumentLock({
      document_id: session.document_id,
      reviewer_id: reviewerId,
      session_id: sessionId,
      expires_at: new Date(Date.now() + lockTtlMs),
    });

    const doc = session.document as {
      group_id?: string;
      workflow_execution_id?: string;
    };
    await this.auditService.recordEvent({
      event_type: "review_session_reopened",
      resource_type: "review_session",
      resource_id: sessionId,
      actor_id: reviewerId,
      document_id: session.document_id,
      workflow_execution_id: doc.workflow_execution_id ?? undefined,
      group_id: doc.group_id ?? undefined,
      payload: { document_id: session.document_id },
    });

    // Revert ground truth job to awaiting_review if this document is part of GT generation
    try {
      const gtService = this.moduleRef.get(GroundTruthGenerationService, {
        strict: false,
      });
      if (gtService) {
        const job = await gtService.getJobByDocumentId(session.document_id);
        if (job) {
          await gtService.reopenJob(job.id);
          this.logger.log(
            `Ground truth job ${job.id} reverted for reopened session ${sessionId}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Ground truth reopen hook error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      id: sessionId,
      status: ReviewStatus.in_progress,
      message: "Review session reopened",
    };
  }

  async getNextSession(
    filters: {
      modelId?: string;
      maxConfidence?: number;
      reviewStatus?: ReviewStatusFilter;
      group_id?: string;
    },
    reviewerId: string,
    groupIds: string[],
  ) {
    const maxConfidence = filters.maxConfidence ?? 0.9;

    const reviewStatusFilter =
      filters.reviewStatus === ReviewStatusFilter.ALL
        ? "all"
        : filters.reviewStatus === ReviewStatusFilter.REVIEWED
          ? "reviewed"
          : "pending";

    const documents = await this.reviewDb.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      modelId: filters.modelId,
      maxConfidence,
      limit: 10,
      reviewStatus: reviewStatusFilter,
      groupIds,
    });

    // Filter by confidence — same logic as getQueue
    const eligible = documents.filter((doc: DocumentWithOcrResult) => {
      if (!doc.ocr_result) return false;

      const fields = doc.ocr_result
        .keyValuePairs as unknown as ExtractedFields | null;
      if (!fields) return false;
      if (typeof fields !== "object") return false;

      return Object.values(fields).some((field: DocumentField) => {
        if (field?.confidence !== undefined) {
          return field.confidence < maxConfidence;
        }
        return false;
      });
    });

    if (eligible.length === 0) {
      return null;
    }

    const firstDoc = eligible[0];
    return this.startSession({ documentId: firstDoc.id }, reviewerId);
  }
}
