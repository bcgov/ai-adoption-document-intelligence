import { getErrorMessage } from "@ai-di/shared-logging";
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
import { ConfigService } from "@nestjs/config";
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
import {
  applyExperimentFieldFilter,
  EXPERIMENT_FIELD_FILTER_ENV,
} from "./experiment-field-filter";
import { ExperimentOcrLoaderService } from "./experiment-ocr-loader.service";
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

/** Marker placed on Document.metadata by the SDPR HITL experiment seeder. */
const EXPERIMENT_TAG = "sdpr-hitl-timing-experiment";

interface ExperimentMarker {
  sampleId: string;
}

/** Read the experiment marker from Document.metadata; null when not present. */
function readExperimentMarkerFromMetadata(
  metadata: unknown,
): ExperimentMarker | null {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  if (obj.experiment !== EXPERIMENT_TAG) return null;
  const sampleId = obj.sampleId;
  if (typeof sampleId !== "string" || sampleId.length === 0) return null;
  return { sampleId };
}

function readTemplateModelIdFromMetadata(
  metadata: unknown,
): string | undefined {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }
  const raw = (metadata as Record<string, unknown>).templateModelId;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
    private readonly configService: ConfigService,
    private readonly experimentOcrLoader: ExperimentOcrLoaderService,
  ) {}

  /** Apply the experiment field filter when EXPERIMENT_FIELD_FILTER is set. */
  private filterFields(
    fields: unknown,
    allowlist?: Set<string> | null,
  ): ExtractedFields | Record<string, unknown> {
    return applyExperimentFieldFilter(
      fields as ExtractedFields | Record<string, unknown> | null | undefined,
      this.configService.get<string>(EXPERIMENT_FIELD_FILTER_ENV),
      allowlist,
    );
  }

  /**
   * Get the OCR field map for a document. For experiment documents, this
   * pulls from the in-memory ExperimentOcrLoaderService (which streams the
   * benchmark JSON from the share on first call). For all other documents,
   * returns the DB-stored keyValuePairs unchanged.
   */
  private async getOcrFieldsForDocument(doc: {
    metadata?: unknown;
    ocr_result?: { keyValuePairs?: unknown } | null;
  }): Promise<unknown> {
    const marker = readExperimentMarkerFromMetadata(doc.metadata);
    if (marker && this.experimentOcrLoader.isEnabled()) {
      const fields = await this.experimentOcrLoader.getFieldsForSample(
        marker.sampleId,
      );
      return fields ?? {};
    }
    return doc.ocr_result?.keyValuePairs ?? {};
  }

  /**
   * Get the exact per-document allow-list for HITL display. For experiment
   * documents the loader returns the same field set as reviewable-items.csv.
   * Returns null for non-experiment documents (the filter falls back to
   * category-based rules in that case).
   */
  private async getDisplayAllowlistForDocument(doc: {
    metadata?: unknown;
  }): Promise<Set<string> | null> {
    const marker = readExperimentMarkerFromMetadata(doc.metadata);
    if (!marker || !this.experimentOcrLoader.isEnabled()) return null;
    return this.experimentOcrLoader.getReviewableFieldsForSample(
      marker.sampleId,
    );
  }

  async getQueue(
    filters: QueueFilterDto,
    groupIds?: string[],
    currentReviewerId?: string,
  ) {
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

    const documents = (await this.reviewDb.findReviewQueue({
      status,
      modelId: filters.modelId,
      maxConfidence: filters.maxConfidence ?? 0.9,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      reviewStatus: reviewStatusFilter,
      groupIds,
      currentReviewerId,
    })) as DocumentWithOcrResult[];

    // Resolve OCR fields + per-doc allow-list. For experiment docs both
    // come from the in-memory loader (exact reviewable-items.csv match);
    // for regular docs the allow-list is null and the filter falls back to
    // category rules (or passthrough when EXPERIMENT_FIELD_FILTER is unset).
    const docsWithFields = await Promise.all(
      documents.map(async (doc) => ({
        doc,
        fields: await this.getOcrFieldsForDocument(doc),
        allowlist: await this.getDisplayAllowlistForDocument(doc),
      })),
    );

    // Filter by confidence if any field's confidence is below threshold.
    const filtered = docsWithFields.filter(({ fields }) => {
      if (!fields || typeof fields !== "object") return false;
      return Object.values(fields as Record<string, DocumentField>).some(
        (field: DocumentField) => {
          if (field?.confidence !== undefined) {
            return field.confidence < maxConfidence;
          }
          return false;
        },
      );
    });

    return {
      documents: filtered.map(({ doc, fields, allowlist }) => ({
        id: doc.id,
        original_filename: doc.original_filename,
        status: doc.status,
        model_id: doc.model_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        ocr_result: {
          fields: this.filterFields(fields, allowlist),
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

    const allDocs = (await this.reviewDb.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      limit: 1000,
      reviewStatus: reviewStatusFilter,
      groupIds,
    })) as DocumentWithOcrResult[];

    const lowConfidenceDocs = allDocs.filter((doc) => {
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
      reviewerId: session.actor_id,
      status: session.status,
      startedAt: session.started_at,
      document: {
        id: session.document.id,
        original_filename: session.document.original_filename,
        storage_path: session.document.file_path,
        ocr_result: {
          fields: this.filterFields(
            await this.getOcrFieldsForDocument(
              session.document as ReviewSessionWithDocument["document"],
            ),
            await this.getDisplayAllowlistForDocument(
              session.document as ReviewSessionWithDocument["document"],
            ),
          ),
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

    // Fetch field definitions for format-aware HITL validation. Prefer the exact
    // template model recorded on the document (a Group can hold many templates;
    // only one was actually used). Fall back to the group lookup for older docs.
    const templateModelId = readTemplateModelIdFromMetadata(
      session.document.metadata,
    );
    const fieldDefinitions =
      templateModelId || session.document.group_id
        ? await this.reviewDb.findFieldDefinitionsForDocument({
            templateModelId,
            groupId: session.document.group_id,
          })
        : [];

    return {
      id: session.id,
      documentId: session.document_id,
      reviewerId: session.actor_id,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      document: {
        id: session.document.id,
        original_filename: session.document.original_filename,
        storage_path: session.document.file_path,
        ocr_result: {
          fields: this.filterFields(
            await this.getOcrFieldsForDocument(doc),
            await this.getDisplayAllowlistForDocument(doc),
          ),
          enrichment_summary: doc.ocr_result?.enrichment_summary ?? undefined,
        },
      },
      corrections: session.corrections,
      fieldDefinitions,
    };
  }

  async submitCorrections(sessionId: string, dto: SubmitCorrectionsDto) {
    this.logger.debug(`Submitting corrections for session: ${sessionId}`);

    const session = await this.reviewDb.findReviewSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

    // For SDPR HITL experiment docs, drop the actual values before persistence
    // so PII (predicted values, user-typed corrections) never lands in the DB.
    // Action + timestamps + field_key are sufficient for timing analysis.
    const isExperimentDoc =
      readExperimentMarkerFromMetadata(
        (session.document as { metadata?: unknown }).metadata,
      ) !== null;

    // Save all corrections
    const savedCorrections = await Promise.all(
      dto.corrections.map((correction) =>
        this.reviewDb.createFieldCorrection(sessionId, {
          field_key: correction.field_key,
          original_value: isExperimentDoc
            ? undefined
            : (correction.original_value ?? undefined),
          corrected_value: isExperimentDoc
            ? undefined
            : (correction.corrected_value ?? undefined),
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
          await gtService.completeJob(job.id, sessionId);
          this.logger.log(
            `Ground truth generated for job ${job.id} via session ${sessionId}`,
          );
        }
      }
    } catch (error) {
      // Non-critical: log but don't fail the approval
      this.logger.warn(
        `Ground truth post-approval hook error: ${getErrorMessage(error)}`,
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

    if (!updated) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

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

    if (!updated) {
      throw new NotFoundException(`Review session ${sessionId} not found`);
    }

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

    if (session.actor_id !== reviewerId) {
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
        throw new ConflictException("Cannot reopen: dataset version is frozen");
      }
    } else {
      // Regular workflow: allow within 5 minutes of completion
      const fiveMinutesMs = 5 * 60 * 1000;
      if (
        !session.completed_at ||
        Date.now() - session.completed_at.getTime() > fiveMinutesMs
      ) {
        throw new ConflictException("Cannot reopen: reopen window has expired");
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
    let gtService: GroundTruthGenerationService | undefined;
    try {
      gtService = this.moduleRef.get(GroundTruthGenerationService, {
        strict: false,
      });
    } catch {
      // Service not available (e.g. test environment)
    }
    if (gtService) {
      const job = await gtService.getJobByDocumentId(session.document_id);
      if (job) {
        await gtService.reopenJob(job.id);
        this.logger.log(
          `Ground truth job ${job.id} reverted for reopened session ${sessionId}`,
        );
      }
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

    const documents = (await this.reviewDb.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      modelId: filters.modelId,
      maxConfidence,
      limit: 10,
      reviewStatus: reviewStatusFilter,
      groupIds,
    })) as DocumentWithOcrResult[];

    // Filter by confidence — same logic as getQueue, with experiment-doc
    // OCR fields pulled from the in-memory loader.
    const docsWithFields = await Promise.all(
      documents.map(async (doc: DocumentWithOcrResult) => ({
        doc,
        fields: await this.getOcrFieldsForDocument(doc),
      })),
    );
    const eligible = docsWithFields.filter(({ fields }) => {
      if (!fields || typeof fields !== "object") return false;
      return Object.values(fields as Record<string, DocumentField>).some(
        (field: DocumentField) => {
          if (field?.confidence !== undefined) {
            return field.confidence < maxConfidence;
          }
          return false;
        },
      );
    });

    if (eligible.length === 0) {
      return null;
    }

    const firstDoc = eligible[0].doc;
    return this.startSession({ documentId: firstDoc.id }, reviewerId);
  }
}
