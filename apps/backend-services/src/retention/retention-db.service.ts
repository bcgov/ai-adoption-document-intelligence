import { Prisma, ReviewStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";


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
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async runWithDatabaseLock(
    label: string,
    fn: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    await this.prismaService.transaction(async (tx) => {
      const [result] = await tx.$queryRaw<
        { pg_try_advisory_xact_lock: boolean }[]
      >`
          SELECT pg_try_advisory_xact_lock(hashtext(${label}));
        `;
      if (!result || !result.pg_try_advisory_xact_lock) {
        this.logger.log(
          `[${label} Cron] Already running on another container. Skipping.`,
        );
        return;
      }

      await fn(tx);
    });
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
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const rows = await tx.auditEvent.findMany({
      where: { occurred_at: { lt: olderThan } },
      select: { id: true },
      orderBy: { occurred_at: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await tx.auditEvent.deleteMany({
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
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const rows = await tx.benchmarkAuditLog.findMany({
      where: { timestamp: { lt: olderThan } },
      select: { id: true },
      orderBy: { timestamp: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await tx.benchmarkAuditLog.deleteMany({
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
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const rows = await tx.reviewSession.findMany({
      where: {
        status: { in: TERMINAL_REVIEW_STATUSES },
        completed_at: { lt: olderThan },
      },
      select: { id: true },
      orderBy: { completed_at: "asc" },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await tx.reviewSession.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return result.count;
  }
}
