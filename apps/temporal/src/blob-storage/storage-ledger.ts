/**
 * Storage Ledger utilities for the Temporal worker.
 *
 * Provides functions for maintaining GroupStorageLedger rows that track
 * blob storage write and delete operations. Called by the BlobStorageClient
 * after successful operations so that storage usage can be computed as
 * GB-hours without querying the underlying storage provider.
 *
 * Blobs under the `_shared/` prefix are not attributed to any group and
 * are excluded from the ledger.
 */

import { buildUsageEventWriteOps } from "@ai-di/billing";
import type { PrismaClient } from "@generated/client";
import { activityInfo } from "@temporalio/activity";
import { createActivityLogger } from "../logger";

const SHARED_PREFIX = "_shared/";
const log = createActivityLogger("storage-ledger");

/**
 * Inserts a GroupStorageLedger row after a successful blob write.
 * Extracts the group_id from the first path segment of the key.
 * No-op for keys beginning with `_shared/`.
 *
 * @param prisma - Prisma client instance
 * @param key - The blob key (e.g. "group-123/documents/doc-1/original.pdf")
 * @param sizeBytes - Size of the written data in bytes
 */
export async function recordLedgerWrite(
  prisma: PrismaClient,
  key: string,
  sizeBytes: number,
): Promise<void> {
  if (key.startsWith(SHARED_PREFIX)) return;

  const groupId = key.split("/")[0];
  try {
    await prisma.groupStorageLedger.upsert({
      where: {
        blob_key: key,
      },
      create: {
        group_id: groupId,
        blob_key: key,
        size_bytes: BigInt(sizeBytes),
        written_at: new Date(),
        deleted_at: null,
      },
      update: {
        size_bytes: BigInt(sizeBytes),
        written_at: new Date(),
        deleted_at: null,
      },
    });

    const rateVersion = await prisma.rateVersion.findFirst({
      where: { effective_from: { lte: new Date() } },
      orderBy: { effective_from: "desc" },
      include: { activity_costs: { where: { activity_name: "blob.write" } } },
    });

    if (!rateVersion || rateVersion.activity_costs.length === 0) return;

    const readCost = rateVersion.activity_costs[0];
    const unitsConsumed = Number(readCost.units);
    if (unitsConsumed === 0) return;

    const info = activityInfo();
    const workflowId = info.workflowExecution.workflowId;

    const { createData, upsertArgs } = buildUsageEventWriteOps({
      event_type: "blob_storage",
      activity_name: "blob.write",
      group_id: groupId,
      rate_version_id: rateVersion.id,
      unit_cost_dollars: Number(rateVersion.unit_cost_dollars),
      units_consumed: unitsConsumed,
      resource_id: key,
      resource_type: "blob",
      workflow_execution_id: workflowId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await tx.usagePeriodSummary.upsert(upsertArgs);
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    log.error(`Failed to record ledger write for key "${key}": ${err.message}`);
  }
}

/**
 * Sets deleted_at on the GroupStorageLedger row for a deleted blob key.
 *
 * @param prisma - Prisma client instance
 * @param key - The blob key that was deleted
 */
export async function recordLedgerDelete(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  try {
    await prisma.groupStorageLedger.updateMany({
      where: { blob_key: key, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    log.error(
      `Failed to record ledger delete for key "${key}": ${err.message}`,
    );
  }
}

/**
 * Records a blob_read UsageEvent for a successful read() call.
 * Extracts the group_id from the first path segment of the key.
 * No-op for keys beginning with `_shared/` or if no "blob.read" cost is configured.
 *
 * @param prisma - Prisma client instance
 * @param key - The blob key that was read
 */
export async function recordLedgerRead(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  if (key.startsWith(SHARED_PREFIX)) return;

  const groupId = key.split("/")[0];

  try {
    const rateVersion = await prisma.rateVersion.findFirst({
      where: { effective_from: { lte: new Date() } },
      orderBy: { effective_from: "desc" },
      include: { activity_costs: { where: { activity_name: "blob.read" } } },
    });

    if (!rateVersion || rateVersion.activity_costs.length === 0) return;

    const readCost = rateVersion.activity_costs[0];
    const unitsConsumed = Number(readCost.units);
    if (unitsConsumed === 0) return;

    const info = activityInfo();
    const workflowId = info.workflowExecution.workflowId;

    const { createData, upsertArgs } = buildUsageEventWriteOps({
      event_type: "blob_storage",
      activity_name: "blob.read",
      group_id: groupId,
      rate_version_id: rateVersion.id,
      unit_cost_dollars: Number(rateVersion.unit_cost_dollars),
      units_consumed: unitsConsumed,
      resource_id: key,
      resource_type: "blob",
      workflow_execution_id: workflowId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await tx.usagePeriodSummary.upsert(upsertArgs);
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    log.error(
      `Failed to record blob read billing for key "${key}": ${err.message}`,
    );
  }
}

/**
 * Sets deleted_at on all GroupStorageLedger rows whose blob_key begins with
 * the given prefix. Uses a single bulk UPDATE query.
 *
 * @param prisma - Prisma client instance
 * @param prefix - The blob key prefix used for deletion
 */
export async function recordLedgerDeleteByPrefix(
  prisma: PrismaClient,
  prefix: string,
): Promise<void> {
  try {
    await prisma.groupStorageLedger.updateMany({
      where: { blob_key: { startsWith: prefix }, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    log.error(
      `Failed to record ledger deleteByPrefix for prefix "${prefix}": ${err.message}`,
    );
  }
}
