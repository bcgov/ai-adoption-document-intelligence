import { DocumentStatus, Prisma, ReviewStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";

// TODO: add ReviewStatus.rejected once it exists in the schema.
/**
 * Review statuses whose sessions are eligible for age-based deletion.
 * `flagged` is excluded: it marks an escalation that still needs action.
 */
const TERMINAL_REVIEW_STATUSES: ReviewStatus[] = [
  ReviewStatus.approved,
  ReviewStatus.abandoned,
];

/** Terminal document statuses indicating the parent workflow has finished. */
const TERMINAL_DOCUMENT_STATUSES: DocumentStatus[] = [
  DocumentStatus.complete,
  DocumentStatus.failed,
  DocumentStatus.conversion_failed,
];

/**
 * How long the lock-holding transaction may stay open (ms). Jobs run inside it can
 * spend minutes on blob-storage calls; Prisma's 5 000 ms default would roll the
 * transaction back mid-run and release the lock early.
 */
const LOCK_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;

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

  /**
   * Runs `fn` only if no other container holds the lock named `label`, using a
   * transaction-scoped Postgres advisory lock that is released when the
   * transaction ends. Logs and returns without running `fn` when the lock is
   * already held.
   *
   * `tx` is the lock-holding transaction. Use it only for database-only work
   * that should commit or roll back as one unit; anything paired with an
   * irreversible side effect (such as a blob delete) must use the ordinary
   * client so it commits immediately.
   *
   * @param label - Lock name; one per cron job.
   * @param fn - The job body.
   */
  async runWithDatabaseLock(
    label: string,
    fn: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    await this.prismaService.transaction(
      async (tx) => {
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
      },
      { timeout: LOCK_TRANSACTION_TIMEOUT_MS },
    );
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
   * `field_corrections`) whose `completed_at` is before `olderThan` and whose
   * parent document's workflow has also reached a terminal state.
   * In-progress sessions, and sessions whose document workflow is still
   * ongoing, are never eligible.
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
        document: { status: { in: TERMINAL_DOCUMENT_STATUSES } },
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
