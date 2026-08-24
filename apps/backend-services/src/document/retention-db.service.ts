import { PrismaClient, ReviewStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

/** Terminal review statuses whose sessions are eligible for age-based deletion. */
const TERMINAL_REVIEW_STATUSES: ReviewStatus[] = [
  ReviewStatus.approved,
  ReviewStatus.escalated, // TODO: Is this actually terminal?
  ReviewStatus.skipped,
];

/**
 * Database service for bulk retention deletes across tables that do not belong
 * to the Document module but contribute to unbounded row growth.
 *
 * Each method follows a two-step pattern: find up to `limit` eligible IDs,
 * then delete exactly those rows in a single `deleteMany`. This keeps batches
 * predictable and avoids long-running DELETE scans.
 */
@Injectable()
export class RetentionDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Deletes up to `limit` audit events whose `occurred_at` is before `olderThan`.
   *
   * @param olderThan - Delete events that occurred before this timestamp.
   * @param limit - Maximum rows to delete per call.
   * @returns Number of rows actually deleted.
   */
  async deleteAuditEventsOlderThan(
    olderThan: Date,
    limit: number,
  ): Promise<number> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { occurred_at: { lt: olderThan } },
      select: { id: true },
      orderBy: { occurred_at: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.auditEvent.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return result.count;
  }

  /**
   * Deletes up to `limit` benchmark audit logs whose `timestamp` is before
   * `olderThan`.
   *
   * @param olderThan - Delete logs timestamped before this value.
   * @param limit - Maximum rows to delete per call.
   * @returns Number of rows actually deleted.
   */
  async deleteBenchmarkAuditLogsOlderThan(
    olderThan: Date,
    limit: number,
  ): Promise<number> {
    const rows = await this.prisma.benchmarkAuditLog.findMany({
      where: { timestamp: { lt: olderThan } },
      select: { id: true },
      orderBy: { timestamp: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.benchmarkAuditLog.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return result.count;
  }

  /**
   * Deletes up to `limit` completed review sessions (and their cascading
   * `field_corrections`) whose `completed_at` is before `olderThan`.
   * In-progress sessions are never eligible.
   *
   * @param olderThan - Delete sessions completed before this timestamp.
   * @param limit - Maximum rows to delete per call.
   * @returns Number of review session rows actually deleted.
   */
  async deleteCompletedReviewSessionsOlderThan(
    olderThan: Date,
    limit: number,
  ): Promise<number> {
    const rows = await this.prisma.reviewSession.findMany({
      where: {
        status: { in: TERMINAL_REVIEW_STATUSES },
        completed_at: { lt: olderThan },
      },
      select: { id: true },
      orderBy: { completed_at: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.reviewSession.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return result.count;
  }
}
