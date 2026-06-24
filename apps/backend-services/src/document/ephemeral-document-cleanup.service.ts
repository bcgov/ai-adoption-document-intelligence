import type { EphemeralConfig } from "@ai-di/graph-workflow";
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
import { TemporalClientService } from "../temporal/temporal-client.service";
import {
  DocumentDbService,
  type PurgeableEphemeralDocument,
} from "./document-db.service";

/** Maximum documents purged per run. */
const BATCH_SIZE = 100;

/**
 * Resolves a workflow's ephemeral policy to concrete delete targets.
 * `true` deletes both; the object form deletes each opted-in target.
 */
function resolveEphemeralPolicy(ephemeral: EphemeralConfig): {
  files: boolean;
  temporalRecord: boolean;
} {
  if (ephemeral === true) {
    return { files: true, temporalRecord: true };
  }
  if (ephemeral && typeof ephemeral === "object") {
    return {
      files: ephemeral.files === true,
      temporalRecord: ephemeral.temporalRecord === true,
    };
  }
  return { files: false, temporalRecord: false };
}

/**
 * Terminal statuses safe to purge: the document is no longer being processed
 * and its source/intermediate blobs are no longer needed. `awaiting_review`
 * and `extracted` are intentionally excluded because a HITL or follow-on step
 * may still read the blobs.
 */
const PURGEABLE_STATUSES: DocumentStatus[] = [
  DocumentStatus.complete,
  DocumentStatus.failed,
  DocumentStatus.conversion_failed,
];

/**
 * Periodic janitor that makes documents transient when their workflow opts in.
 * A workflow declares `metadata.ephemeral = true` in its config; once any
 * document it processed reaches a terminal status, this job deletes that
 * document's blob-storage files and Temporal execution record. The extracted
 * OCR result in Postgres (`ocr_results`) is intentionally retained so API
 * clients can still poll it.
 *
 * Ephemerality is configured entirely on the workflow — there is no global
 * enable flag and no per-group setting. When no workflow is marked ephemeral,
 * the query matches nothing and the job is a no-op.
 */
@Injectable()
export class EphemeralDocumentCleanupService {
  constructor(
    private readonly documentDb: DocumentDbService,
    private readonly temporalClient: TemporalClientService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Runs every minute: purges blob files and Temporal records for terminal
   * documents whose workflow is marked ephemeral.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async purgeEphemeralDocuments(): Promise<void> {
    let documents: Awaited<
      ReturnType<DocumentDbService["findPurgeableEphemeralDocuments"]>
    >;
    try {
      documents = await this.documentDb.findPurgeableEphemeralDocuments(
        PURGEABLE_STATUSES,
        BATCH_SIZE,
      );
    } catch (err) {
      this.logger.error("Failed to query purgeable documents — aborting run", {
        stack: getErrorStack(err),
      });
      return;
    }

    if (documents.length === 0) {
      return;
    }

    let purged = 0;
    let errors = 0;
    for (const doc of documents) {
      try {
        await this.purgeDocument(doc);
        purged++;
      } catch (err) {
        errors++;
        this.logger.error(`Failed to purge ephemeral document ${doc.id}`, {
          documentId: doc.id,
          groupId: doc.group_id,
          stack: getErrorStack(err),
        });
      }
    }

    this.logger.log("Ephemeral document cleanup run complete", {
      candidates: documents.length,
      purged,
      errors,
    });
  }

  /**
   * Applies a document's workflow ephemeral policy: deletes its blob files
   * and/or Temporal execution record per the policy, then stamps it purged.
   * Throws on failure so the document is retried next run (every step is
   * idempotent, so retries are safe).
   */
  private async purgeDocument(doc: PurgeableEphemeralDocument): Promise<void> {
    const { files, temporalRecord } = resolveEphemeralPolicy(doc.ephemeral);

    if (files) {
      const prefix = buildBlobPrefixPath(doc.group_id, OperationCategory.OCR, [
        doc.id,
      ]);
      await this.blobStorage.deleteByPrefix(prefix);
    }

    if (temporalRecord && doc.workflow_execution_id) {
      await this.temporalClient.deleteWorkflowExecution(
        doc.workflow_execution_id,
      );
    }

    await this.documentDb.markDocumentPurged(doc.id);
  }
}
