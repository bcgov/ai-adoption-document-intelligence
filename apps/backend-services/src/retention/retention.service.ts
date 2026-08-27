import { getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus, Prisma } from "@generated/client";
import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";
import { DocumentDbService } from "../document/document-db.service";
import { RetentionDbService } from "./retention-db.service";

/** Env var controlling document retention window (days). */
export const DOCUMENT_RETENTION_ENV_VAR = "DOCUMENT_RETENTION_DAYS";
/** Env var controlling audit_events retention window (days). */
export const AUDIT_EVENT_RETENTION_ENV_VAR = "AUDIT_EVENT_RETENTION_DAYS";
/** Env var controlling benchmark_audit_logs retention window (days). */
export const BENCHMARK_AUDIT_LOG_RETENTION_ENV_VAR =
  "BENCHMARK_AUDIT_LOG_RETENTION_DAYS";
/** Env var controlling completed review_sessions retention window (days). */
export const REVIEW_SESSION_RETENTION_ENV_VAR = "REVIEW_SESSION_RETENTION_DAYS";

/** Max documents deleted per run — blob I/O makes per-doc cost non-trivial. */
const DOCUMENT_BATCH_SIZE = 500;
/** Max rows deleted per run for pure-DB jobs (no blob I/O). */
const SIMPLE_BATCH_SIZE = 2000;

/**
 * Terminal document statuses eligible for retention-based deletion.
 * In-progress (`pre_ocr`, `ongoing_ocr`) and human-review (`awaiting_review`,
 * `extracted`) documents are never deleted regardless of age.
 */
const DELETABLE_STATUSES: DocumentStatus[] = [
  DocumentStatus.complete,
  DocumentStatus.failed,
  DocumentStatus.conversion_failed,
];

enum CronLockKeys {
  DOCUMENTS,
  AUDIT_EVENTS,
  BENCHMARK_AUDIT_LOGS,
  REVIEW_SESSIONS,
}

/**
 * Periodic janitor that enforces configurable retention windows across the
 * system's main unbounded data stores.
 *
 * Each store is controlled by its own environment variable (see exported
 * `*_ENV_VAR` constants). When the variable is absent or invalid the job for
 * that store is skipped — behaviour is unchanged on deploy unless the variable
 * is explicitly set.
 *
 * Jobs run in two groups to spread DB pressure:
 *   Every 6 hours (00:00/06:00/12:00/18:00) — documents + blobs
 *   Daily at 02:15/02:30/02:45 — audit_events, benchmark_audit_logs, review_sessions
 */
@Injectable()
export class DocumentRetentionService {
  constructor(
    private readonly documentDb: DocumentDbService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly retentionDb: RetentionDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /** Runs every 6 hours: permanently deletes expired terminal documents, their blobs, and cascading OCR results. */
  @Cron("0 */6 * * *")
  async deleteExpiredDocuments(): Promise<void> {
    await this.retentionDb.runWithDatabaseLock(
      CronLockKeys.DOCUMENTS,
      "deleteExpiredDocuments",
      async (tx) => {
        const raw = process.env[DOCUMENT_RETENTION_ENV_VAR];
        const retentionDays = raw !== undefined ? parseInt(raw, 10) : NaN;

        if (!raw || Number.isNaN(retentionDays) || retentionDays <= 0) {
          this.logger.warn(
            `Document retention cleanup skipped: ${DOCUMENT_RETENTION_ENV_VAR} is not set or is not a positive integer`,
            { value: raw },
          );
          return;
        }

        const olderThan = new Date(
          Date.now() - retentionDays * 24 * 60 * 60 * 1000,
        );

        let documents: Awaited<
          ReturnType<DocumentDbService["findExpiredDocuments"]>
        >;
        try {
          documents = await this.documentDb.findExpiredDocuments(
            olderThan,
            DELETABLE_STATUSES,
            DOCUMENT_BATCH_SIZE,
          );
        } catch (err) {
          this.logger.error(
            "Failed to query expired documents — aborting run",
            {
              stack: getErrorStack(err),
            },
          );
          return;
        }

        if (documents.length === 0) {
          return;
        }

        let deleted = 0;
        let errors = 0;
        for (const doc of documents) {
          try {
            await this.deleteDocument(doc, tx);
            deleted++;
          } catch (err) {
            errors++;
            this.logger.error(`Failed to delete expired document ${doc.id}`, {
              documentId: doc.id,
              groupId: doc.group_id,
              stack: getErrorStack(err),
            });
          }
        }

        this.logger.log("Document retention cleanup run complete", {
          olderThanDays: retentionDays,
          candidates: documents.length,
          deleted,
          errors,
        });
      },
    );
  }

  /**
   * Deletes a single document's blobs then its database row.
   * Blob deletion is always attempted first so a DB failure does not leave
   * orphaned blobs. Both operations are idempotent and safe to retry.
   *
   * @param doc - Minimal document record with id and group_id.
   */
  private async deleteDocument(
    doc: {
      id: string;
      group_id: string;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const prefix = buildBlobPrefixPath(doc.group_id, OperationCategory.OCR, [
      doc.id,
    ]);
    await this.blobStorage.deleteByPrefix(prefix);
    await this.documentDb.deleteDocument(doc.id, tx);
  }

  /**
   * Runs daily at 02:15: deletes `audit_events` rows older than
   * `AUDIT_EVENT_RETENTION_DAYS`. Skipped when the variable is unset.
   */
  @Cron("15 2 * * *")
  async deleteExpiredAuditEvents(): Promise<void> {
    await this.retentionDb.runWithDatabaseLock(
      CronLockKeys.AUDIT_EVENTS,
      "deleteExpiredAuditEvents",
      async (tx) => {
        await this.runSimpleRetentionJob(
          AUDIT_EVENT_RETENTION_ENV_VAR,
          "Audit event",
          (olderThan, limit, tx) =>
            this.retentionDb.deleteAuditEventsOlderThan(olderThan, limit, tx),
          tx,
        );
      },
    );
  }

  /**
   * Runs daily at 02:30: deletes `benchmark_audit_logs` rows older than
   * `BENCHMARK_AUDIT_LOG_RETENTION_DAYS`. Skipped when the variable is unset.
   */
  @Cron("30 2 * * *")
  async deleteExpiredBenchmarkAuditLogs(): Promise<void> {
    await this.retentionDb.runWithDatabaseLock(
      CronLockKeys.BENCHMARK_AUDIT_LOGS,
      "deleteExpiredBenchmarkAuditLogs",
      async (tx) => {
        await this.runSimpleRetentionJob(
          BENCHMARK_AUDIT_LOG_RETENTION_ENV_VAR,
          "Benchmark audit log",
          (olderThan, limit, tx) =>
            this.retentionDb.deleteBenchmarkAuditLogsOlderThan(
              olderThan,
              limit,
              tx,
            ),
          tx,
        );
      },
    );
  }

  /**
   * Runs daily at 02:45: deletes completed `review_sessions` (and their
   * cascading `field_corrections`) older than `REVIEW_SESSION_RETENTION_DAYS`.
   * Only terminal-status sessions (approved / escalated / skipped) are
   * eligible. Skipped when the variable is unset.
   */
  @Cron("45 2 * * *")
  async deleteExpiredReviewSessions(): Promise<void> {
    await this.retentionDb.runWithDatabaseLock(
      CronLockKeys.REVIEW_SESSIONS,
      "deleteExpiredReviewSessions",
      async (tx) => {
        await this.runSimpleRetentionJob(
          REVIEW_SESSION_RETENTION_ENV_VAR,
          "Review session",
          (olderThan, limit, tx) =>
            this.retentionDb.deleteCompletedReviewSessionsOlderThan(
              olderThan,
              limit,
              tx,
            ),
          tx,
        );
      },
    );
  }

  /**
   * Shared runner for simple (DB-only, batch-delete) retention jobs.
   * Reads and validates the retention window from `envVar`, computes a cutoff,
   * calls `deleteFn`, and logs the result. Errors from `deleteFn` are caught
   * and logged without re-throwing so one failing job does not block others.
   *
   * @param envVar - Name of the env var holding the retention window in days.
   * @param label - Human-readable data-class label used in log messages.
   * @param deleteFn - Function that deletes eligible rows and returns the count.
   */
  private async runSimpleRetentionJob(
    envVar: string,
    label: string,
    deleteFn: (
      olderThan: Date,
      limit: number,
      tx: Prisma.TransactionClient,
    ) => Promise<number>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const raw = process.env[envVar];
    const retentionDays = raw !== undefined ? parseInt(raw, 10) : NaN;

    if (!raw || Number.isNaN(retentionDays) || retentionDays <= 0) {
      this.logger.warn(
        `${label} retention cleanup skipped: ${envVar} is not set or is not a positive integer`,
        { value: raw },
      );
      return;
    }

    const olderThan = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    let deleted: number;
    try {
      deleted = await deleteFn(olderThan, SIMPLE_BATCH_SIZE, tx);
    } catch (err) {
      this.logger.error(`Failed to delete expired ${label} records`, {
        stack: getErrorStack(err),
      });
      return;
    }

    if (deleted > 0) {
      this.logger.log(`${label} retention cleanup run complete`, {
        olderThanDays: retentionDays,
        deleted,
      });
    }
  }
}
