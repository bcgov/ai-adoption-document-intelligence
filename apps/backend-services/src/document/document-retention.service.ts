import { getErrorStack } from "@ai-di/shared-logging";
import { DocumentStatus } from "@generated/client";
import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";
import { DocumentDbService } from "./document-db.service";

/**
 * Environment variable that controls the retention window.
 * Set to a positive integer (number of days). If absent or invalid the janitor
 * is disabled and no documents are deleted.
 */
export const DOCUMENT_RETENTION_ENV_VAR = "DOCUMENT_RETENTION_DAYS";

/** Maximum documents deleted per janitor run to avoid long-running transactions. */
const BATCH_SIZE = 100;

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

/**
 * Periodic janitor that permanently deletes documents (and their associated
 * `ocr_results` rows, via CASCADE, and blob-storage files) once they exceed
 * the retention window defined by {@link DOCUMENT_RETENTION_DAYS}.
 *
 * Deletion order per document:
 *   1. Delete blobs from storage (idempotent — safe if files are already gone).
 *   2. Delete the `documents` row, which cascades to `ocr_results`.
 *
 * The janitor runs once per day. Documents already processed by the ephemeral
 * cleanup janitor (blobs gone, `purged_at` set) are also collected and their
 * DB rows removed; `deleteByPrefix` is idempotent and produces no error when
 * no matching blobs exist.
 */
@Injectable()
export class DocumentRetentionService {
  constructor(
    private readonly documentDb: DocumentDbService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Runs daily at 02:00: permanently deletes expired terminal documents and
   * their associated blobs and OCR results.
   *
   * Requires `DOCUMENT_RETENTION_DAYS` to be set to a positive integer.
   * If the variable is absent or invalid the run is skipped and a warning is
   * logged — no documents are deleted.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async deleteExpiredDocuments(): Promise<void> {
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
        BATCH_SIZE,
      );
    } catch (err) {
      this.logger.error("Failed to query expired documents — aborting run", {
        stack: getErrorStack(err),
      });
      return;
    }

    if (documents.length === 0) {
      return;
    }

    let deleted = 0;
    let errors = 0;
    for (const doc of documents) {
      try {
        await this.deleteDocument(doc);
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
  }

  /**
   * Deletes a single document's blobs then its database row.
   * Blob deletion is always attempted first so a DB failure does not leave
   * orphaned blobs. Both operations are idempotent and safe to retry.
   *
   * @param doc - Minimal document record with id and group_id.
   */
  private async deleteDocument(doc: {
    id: string;
    group_id: string;
  }): Promise<void> {
    const prefix = buildBlobPrefixPath(doc.group_id, OperationCategory.OCR, [
      doc.id,
    ]);
    await this.blobStorage.deleteByPrefix(prefix);
    await this.documentDb.deleteDocument(doc.id);
  }
}
