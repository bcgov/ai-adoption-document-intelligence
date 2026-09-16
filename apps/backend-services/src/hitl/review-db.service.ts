import {
  Document,
  DocumentLock,
  DocumentStatus,
  Prisma,
  PrismaClient,
  ReviewStatus,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { PrismaService } from "../database/prisma.service";
import type { ReviewSessionData } from "./review-db.types";

/** Filter criteria shared by the review queue page, its total, and its stats. */
export interface ReviewQueueFilters {
  statuses: DocumentStatus[];
  modelId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
  offset?: number;
  reviewStatus?: "pending" | "reviewed" | "flagged" | "all";
  groupIds?: string[];
  currentReviewerId?: string;
}

@Injectable()
export class ReviewDbService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new review session for a document.
   * @param documentId - The ID of the document to review.
   * @param reviewerId - The ID of the reviewer.
   * @returns The created review session with document and corrections.
   */
  async createReviewSession(
    documentId: string,
    reviewerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewSessionData> {
    const client = tx ?? this.prisma;
    this.logger.debug("Creating review session for document", { documentId });
    const session = await client.reviewSession.create({
      data: {
        document_id: documentId,
        actor_id: reviewerId,
        status: ReviewStatus.in_progress,
      },
      include: {
        document: {
          include: {
            ocr_result: true,
            groundTruthJob: {
              include: {
                datasetVersion: { select: { frozen: true } },
              },
            },
          },
        },
        corrections: true,
      },
    });
    return session as ReviewSessionData;
  }

  /**
   * Finds a review session by ID.
   * @param id - The review session ID.
   * @returns The review session, or null if not found.
   */
  async findReviewSession(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewSessionData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding review session", { id });
    const session = await client.reviewSession.findUnique({
      where: { id },
      include: {
        document: {
          include: {
            ocr_result: true,
            groundTruthJob: {
              include: {
                datasetVersion: { select: { frozen: true } },
              },
            },
          },
        },
        corrections: true,
      },
    });
    return session as ReviewSessionData | null;
  }

  /**
   * Builds the document filter shared by the queue page, its total, and the
   * queue statistics, so a document counted in a stat is the same document the
   * queue would list.
   */
  private buildReviewQueueWhere(
    filters: ReviewQueueFilters,
  ): Prisma.DocumentWhereInput {
    const where: Prisma.DocumentWhereInput = {
      status: { in: filters.statuses },
      // Only documents ingested through the regular API/upload pipeline are
      // eligible for human review. Documents created by ground-truth dataset
      // generation (source = "ground-truth-generation") must never appear in
      // the HITL queue.
      source: "api",
      // Belt-and-braces: even if a future source value is introduced, never
      // surface a document that is currently linked to a ground truth job.
      groundTruthJob: { is: null },
      // Exclude documents locked by other reviewers (keep own locks visible)
      NOT: {
        lock: {
          expires_at: { gt: new Date() },
          ...(filters.currentReviewerId
            ? { reviewer_id: { not: filters.currentReviewerId } }
            : {}),
        },
      },
    };

    if (filters.groupIds) {
      where.group_id = { in: filters.groupIds };
    }

    if (filters.modelId) {
      where.model_id = filters.modelId;
    }

    if (filters.reviewStatus === "pending") {
      where.OR = [
        { review_sessions: { none: {} } },
        {
          review_sessions: {
            every: {
              status: {
                in: [ReviewStatus.in_progress, ReviewStatus.abandoned],
              },
            },
          },
        },
      ];
    } else if (filters.reviewStatus === "flagged") {
      where.review_sessions = {
        some: { status: ReviewStatus.flagged },
        none: { status: ReviewStatus.approved },
      };
    } else if (filters.reviewStatus === "reviewed") {
      where.review_sessions = {
        some: { status: ReviewStatus.approved },
      };
    }

    return where;
  }

  /**
   * Counts every document the queue filter matches, ignoring pagination.
   * @param filters - The same filters passed to findReviewQueue.
   * @returns The number of matching documents.
   */
  async countReviewQueue(
    filters: ReviewQueueFilters,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.document.count({
      where: this.buildReviewQueueWhere(filters),
    });
  }

  /**
   * Reads the extracted fields of every document the filter matches, without
   * pagination, so an average over them covers the whole queue. Only the OCR
   * field payload is selected — the rest of the document row is not needed.
   * @param filters - The same filters passed to findReviewQueue.
   * @returns One entry per document that has an OCR result.
   */
  async findQueueFieldPayloads(
    filters: ReviewQueueFilters,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.JsonValue[]> {
    const client = tx ?? this.prisma;
    const rows = await client.document.findMany({
      where: {
        ...this.buildReviewQueueWhere(filters),
        ocr_result: { isNot: null },
      },
      select: { ocr_result: { select: { keyValuePairs: true } } },
    });
    return rows
      .map((row) => row.ocr_result?.keyValuePairs)
      .filter((fields): fields is Prisma.JsonValue => fields != null);
  }

  /**
   * Counts sessions approved within a time window.
   * @param since - Start of the window (inclusive).
   * @param groupIds - Restrict to documents in these groups.
   * @returns The number of sessions approved since `since`.
   */
  async countApprovedSessionsSince(
    since: Date,
    groupIds?: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.reviewSession.count({
      where: {
        status: ReviewStatus.approved,
        completed_at: { gte: since },
        ...(groupIds ? { document: { group_id: { in: groupIds } } } : {}),
      },
    });
  }

  /**
   * Finds documents in the review queue based on filter criteria.
   * @param filters - Filtering options for the queue.
   * @returns Array of documents matching the filter criteria.
   */
  async findReviewQueue(
    filters: ReviewQueueFilters,
    tx?: Prisma.TransactionClient,
  ): Promise<Document[]> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding review queue");

    const where = this.buildReviewQueueWhere(filters);

    return client.document.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: {
        ocr_result: true,
        lock: true,
        review_sessions: {
          where: {
            // Exclude in_progress — lock record determines "In review" display; these are noise
            status: {
              in: [
                ReviewStatus.approved,
                ReviewStatus.flagged,
                ReviewStatus.abandoned,
              ],
            },
          },
          include: {
            corrections: true,
          },
          orderBy: { started_at: "desc" },
          take: 1,
        },
      },
    });
  }

  /**
   * Updates a review session's status and/or completion timestamp.
   * @param id - The review session ID.
   * @param data - Fields to update on the session.
   * @returns The updated session, or null if not found.
   */
  async updateReviewSession(
    id: string,
    data: { status?: ReviewStatus; completed_at?: Date | null },
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewSessionData | null> {
    const client = tx ?? this.prisma;
    this.logger.debug("Updating review session", { id });
    try {
      const session = await client.reviewSession.update({
        where: { id },
        data,
        include: {
          document: true,
          corrections: true,
        },
      });
      return session as ReviewSessionData;
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
   * Creates a field correction record for a review session.
   * @param sessionId - The review session ID.
   * @param data - The correction data.
   * @returns The created FieldCorrection record.
   */
  async createFieldCorrection(
    sessionId: string,
    data: {
      field_key: string;
      original_value?: string;
      corrected_value?: string;
      original_conf?: number;
      action: import("@generated/client").CorrectionAction;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<import("@generated/client").FieldCorrection> {
    const client = tx ?? this.prisma;
    this.logger.debug("Creating field correction for session", { sessionId });
    return client.fieldCorrection.create({
      data: {
        session_id: sessionId,
        ...data,
      },
    });
  }

  /**
   * Finds all field corrections for a review session.
   * @param sessionId - The review session ID.
   * @returns Array of FieldCorrection records ordered by creation time.
   */
  async findSessionCorrections(
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<import("@generated/client").FieldCorrection[]> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding corrections for session", { sessionId });
    return client.fieldCorrection.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "asc" },
    });
  }

  /**
   * Acquires a document lock for a reviewer session.
   * @param data - Lock details including document_id, reviewer_id, session_id, and expires_at.
   * @returns The created DocumentLock record.
   */
  async acquireDocumentLock(
    data: {
      document_id: string;
      reviewer_id: string;
      session_id: string;
      expires_at: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentLock> {
    const client = tx ?? this.prisma;
    this.logger.debug("Acquiring document lock", {
      document_id: data.document_id,
    });
    // Use upsert to reclaim any stale (expired) lock row for this document.
    // The unique constraint on document_id means a leftover expired row would
    // otherwise cause a P2002 violation. Callers must ensure no *active* lock
    // exists (see findActiveLock) before invoking this method.
    return client.documentLock.upsert({
      where: { document_id: data.document_id },
      update: {
        reviewer_id: data.reviewer_id,
        session_id: data.session_id,
        expires_at: data.expires_at,
        acquired_at: new Date(),
        last_heartbeat: new Date(),
      },
      create: data,
    });
  }

  /**
   * Releases a document lock by session ID.
   * @param sessionId - The session ID whose lock should be released.
   */
  async releaseDocumentLock(
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    this.logger.debug("Releasing document lock", { sessionId });
    await client.documentLock.deleteMany({
      where: { session_id: sessionId },
    });
  }

  /**
   * Refreshes the heartbeat and expiry for a document lock.
   * @param sessionId - The session ID whose lock heartbeat to refresh.
   * @param expiresAt - The new expiry time for the lock.
   * @returns Whether the lock was found and updated.
   */
  async refreshLockHeartbeat(
    sessionId: string,
    expiresAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const result = await client.documentLock.updateMany({
      where: { session_id: sessionId },
      data: {
        last_heartbeat: new Date(),
        expires_at: expiresAt,
      },
    });
    return result.count > 0;
  }

  /**
   * Finds an active (non-expired) lock for a document.
   * @param documentId - The document ID to check for an active lock.
   * @returns The active DocumentLock, or null if none exists.
   */
  async findActiveLock(
    documentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentLock | null> {
    const client = tx ?? this.prisma;
    return client.documentLock.findFirst({
      where: {
        document_id: documentId,
        expires_at: { gt: new Date() },
      },
    });
  }

  /**
   * Finds locks whose expiry has passed, with the group and workflow context an
   * audit event needs.
   * @param now - The cutoff time; locks expiring at or before it are returned.
   * @returns One entry per expired lock.
   */
  async findExpiredLocks(
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Array<{
      session_id: string;
      document_id: string;
      group_id: string;
      workflow_execution_id: string | null;
    }>
  > {
    const client = tx ?? this.prisma;
    const locks = await client.documentLock.findMany({
      where: { expires_at: { lte: now } },
      select: {
        session_id: true,
        document_id: true,
        document: {
          select: { group_id: true, workflow_execution_id: true },
        },
      },
    });
    return locks.map((lock) => ({
      session_id: lock.session_id,
      document_id: lock.document_id,
      group_id: lock.document.group_id,
      workflow_execution_id: lock.document.workflow_execution_id,
    }));
  }

  /**
   * Marks in-progress sessions as abandoned. Sessions in any other status are
   * left alone, so a session that finished between the scan and this write
   * keeps its outcome.
   * @param sessionIds - The sessions to abandon.
   * @returns How many sessions were updated.
   */
  async abandonSessions(
    sessionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.reviewSession.updateMany({
      where: { id: { in: sessionIds }, status: ReviewStatus.in_progress },
      data: { status: ReviewStatus.abandoned },
    });
    return result.count;
  }

  /**
   * Releases locks for several sessions at once.
   * @param sessionIds - The sessions whose locks should be released.
   */
  async releaseDocumentLocks(
    sessionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.documentLock.deleteMany({
      where: { session_id: { in: sessionIds } },
    });
  }

  /**
   * Finds field definitions for the template model that processed a document.
   *
   * Prefers the explicit templateModelId (recorded on Document.metadata at OCR time)
   * because a Group may contain multiple TemplateModels and only one was actually
   * used for this document. Falls back to the first TemplateModel in the group for
   * documents that predate metadata.templateModelId being recorded.
   *
   * @param opts.templateModelId - The TemplateModel.id used by the OCR workflow, if known.
   * @param opts.groupId - The document's group ID, used as fallback.
   * @returns Array of { field_key, format_spec } objects, or [] if nothing resolves.
   */
  async findFieldDefinitionsForDocument(
    opts: {
      templateModelId?: string | null;
      groupId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ field_key: string; format_spec: string | null }>> {
    const client = tx ?? this.prisma;
    const fieldSchemaInclude = {
      field_schema: {
        orderBy: { display_order: "asc" } as const,
        select: { field_key: true, format_spec: true },
      },
    };

    // Fallback branch is required: documents created before metadata.templateModelId
    // was recorded at OCR time won't carry it, so we look up by group_id instead.
    // A Group can hold multiple TemplateModels, so this fallback may pick the wrong
    // one — accepted only for legacy docs that predate the metadata field.
    const templateModel = opts.templateModelId
      ? await client.templateModel.findUnique({
          where: { id: opts.templateModelId },
          include: fieldSchemaInclude,
        })
      : opts.groupId
        ? await client.templateModel.findFirst({
            where: { group_id: opts.groupId },
            include: fieldSchemaInclude,
          })
        : null;

    return (
      templateModel?.field_schema?.map((f) => ({
        field_key: f.field_key,
        format_spec: f.format_spec,
      })) ?? []
    );
  }

  /**
   * Deletes a field correction by ID, scoped to a session.
   * @param correctionId - The correction ID to delete.
   * @param sessionId - The session ID the correction belongs to.
   * @returns Whether the correction was found and deleted.
   */
  async deleteCorrection(
    correctionId: string,
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    this.logger.debug("Deleting correction", { correctionId, sessionId });
    const result = await client.fieldCorrection.deleteMany({
      where: { id: correctionId, session_id: sessionId },
    });
    return result.count > 0;
  }

  /**
   * Returns aggregated analytics for review sessions within optional filters.
   * @param filters - Date range, reviewer, and group filters.
   * @returns Analytics summary including session counts, corrections, and average confidence.
   */
  async getReviewAnalytics(
    filters: {
      startDate?: Date;
      endDate?: Date;
      reviewerId?: string;
      groupIds?: string[];
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{
    totalSessions: number;
    completedSessions: number;
    totalCorrections: number;
    correctionsByAction: Record<string, number>;
    averageConfidence: number;
  }> {
    const client = tx ?? this.prisma;
    this.logger.debug("Getting review analytics");

    const where: Prisma.ReviewSessionWhereInput = {};
    if (filters.startDate || filters.endDate) {
      where.started_at = {};
      if (filters.startDate) where.started_at.gte = filters.startDate;
      if (filters.endDate) where.started_at.lte = filters.endDate;
    }
    if (filters.reviewerId) {
      where.actor_id = filters.reviewerId;
    }
    if (filters.groupIds) {
      where.document = { group_id: { in: filters.groupIds } };
    }

    const [sessions, corrections] = await Promise.all([
      client.reviewSession.findMany({ where }),
      client.fieldCorrection.findMany({
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
      averageConfidence: Math.round(averageConfidence * 10000) / 10000,
    };
  }
}
