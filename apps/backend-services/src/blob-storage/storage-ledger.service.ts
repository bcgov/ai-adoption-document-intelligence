/**
 * Storage Ledger Service
 *
 * Business logic layer for blob storage ledger and read-billing operations.
 * Called by BlobStorageInterface implementations after successful storage operations.
 *
 * All database interactions are delegated to StorageLedgerDbService.
 * Blobs under the `_shared/` prefix are not attributed to any group and are
 * excluded from the ledger and read billing.
 */

import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { StorageLedgerDbService } from "./storage-ledger-db.service";

const SHARED_PREFIX = "_shared/";

@Injectable()
export class StorageLedgerService {
  constructor(
    private readonly storageLedgerDb: StorageLedgerDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Inserts a GroupStorageLedger row after a successful blob write and records
   * a blob_write UsageEvent for billing.
   * No-op for keys beginning with `_shared/`.
   *
   * @param key - The blob key (e.g. "group-123/documents/doc-1/original.pdf")
   * @param sizeBytes - Size of the written data in bytes
   */
  async recordWrite(key: string, sizeBytes: number): Promise<void> {
    if (key.startsWith(SHARED_PREFIX)) return;

    const groupId = key.split("/")[0];
    try {
      await this.storageLedgerDb.createLedgerEntry(groupId, key, sizeBytes);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to record storage ledger write for key "${key}": ${err.message}`,
        { alertType: "storage_ledger_write" },
      );
    }

    try {
      const rateInfo =
        await this.storageLedgerDb.findActiveRateVersionWithBlobWriteCost();

      if (!rateInfo || rateInfo.units === 0) return;

      await this.storageLedgerDb.createBlobWriteEvent({
        event_type: "blob_write",
        group_id: groupId,
        rate_version_id: rateInfo.rateVersionId,
        unit_cost_dollars: rateInfo.unitCostDollars,
        units_consumed: rateInfo.units,
        activity_name: "blob.write",
        resource_id: key,
        resource_type: "blob",
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to record blob write billing for key "${key}": ${err.message}`,
        { alertType: "blob_write_billing" },
      );
    }
  }

  /**
   * Sets deleted_at on the GroupStorageLedger row for a deleted blob key.
   *
   * @param key - The blob key that was deleted
   */
  async recordDelete(key: string): Promise<void> {
    try {
      await this.storageLedgerDb.markDeleted(key);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to record storage ledger delete for key "${key}": ${err.message}`,
        { alertType: "storage_ledger_delete" },
      );
    }
  }

  /**
   * Sets deleted_at on all GroupStorageLedger rows whose blob_key begins with
   * the given prefix.
   *
   * @param prefix - The blob key prefix used for deletion
   */
  async recordDeleteByPrefix(prefix: string): Promise<void> {
    try {
      await this.storageLedgerDb.markDeletedByPrefix(prefix);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to record storage ledger deleteByPrefix for prefix "${prefix}": ${err.message}`,
        { alertType: "storage_ledger_delete_by_prefix" },
      );
    }
  }

  /**
   * Records a blob_read UsageEvent for a successful read() call.
   * No-op for keys beginning with `_shared/` or if no "blob.read" cost is configured.
   *
   * @param key - The blob key that was read
   */
  async recordRead(key: string): Promise<void> {
    if (key.startsWith(SHARED_PREFIX)) return;

    const groupId = key.split("/")[0];

    try {
      const rateInfo =
        await this.storageLedgerDb.findActiveRateVersionWithBlobReadCost();

      if (!rateInfo || rateInfo.units === 0) return;

      await this.storageLedgerDb.createBlobReadEvent({
        event_type: "blob_read",
        group_id: groupId,
        rate_version_id: rateInfo.rateVersionId,
        unit_cost_dollars: rateInfo.unitCostDollars,
        units_consumed: rateInfo.units,
        activity_name: "blob.read",
        resource_id: key,
        resource_type: "blob",
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to record blob read billing for key "${key}": ${err.message}`,
        { alertType: "blob_read_billing" },
      );
    }
  }
}
