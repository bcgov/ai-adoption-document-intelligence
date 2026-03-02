import {
  Document,
  DocumentStatus,
  Prisma,
  PrismaClient,
  ReviewStatus,
} from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import type { ReviewSessionData } from "./database.types";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ReviewDbService {
  private readonly logger = new Logger(ReviewDbService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createReviewSession(
    documentId: string,
    reviewerId: string,
  ): Promise<ReviewSessionData> {
    this.logger.debug("Creating review session for document: %s", documentId);
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
    this.logger.debug("Finding review session: %s", id);
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
    groupIds?: string[];
  }): Promise<Document[]> {
    this.logger.debug("Finding review queue");

    const where: Prisma.DocumentWhereInput = {
      status: filters.status ?? DocumentStatus.completed_ocr,
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
    this.logger.debug("Updating review session: %s", id);
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

  async createFieldCorrection(
    sessionId: string,
    data: {
      field_key: string;
      original_value?: string;
      corrected_value?: string;
      original_conf?: number;
      action: import("@generated/client").CorrectionAction;
    },
  ): Promise<import("@generated/client").FieldCorrection> {
    this.logger.debug("Creating field correction for session: %s", sessionId);
    return this.prisma.fieldCorrection.create({
      data: {
        session_id: sessionId,
        ...data,
      },
    });
  }

  async findSessionCorrections(
    sessionId: string,
  ): Promise<import("@generated/client").FieldCorrection[]> {
    this.logger.debug("Finding corrections for session: %s", sessionId);
    return this.prisma.fieldCorrection.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "asc" },
    });
  }

  async getReviewAnalytics(filters: {
    startDate?: Date;
    endDate?: Date;
    reviewerId?: string;
    groupIds?: string[];
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
    if (filters.groupIds) {
      where.document = { group_id: { in: filters.groupIds } };
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
