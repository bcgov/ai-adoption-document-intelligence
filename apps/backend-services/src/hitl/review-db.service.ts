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
   * Finds documents in the review queue based on filter criteria.
   * @param filters - Filtering options for the queue.
   * @returns Array of documents matching the filter criteria.
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
      currentReviewerId?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Document[]> {
    const client = tx ?? this.prisma;
    this.logger.debug("Finding review queue");

    const where: Prisma.DocumentWhereInput = {
      status: filters.status ?? DocumentStatus.completed_ocr,
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

    return client.document.findMany({
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
                ReviewStatus.in_progress,
                ReviewStatus.approved,
                ReviewStatus.escalated,
                ReviewStatus.skipped,
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
