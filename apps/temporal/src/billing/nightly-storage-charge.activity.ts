/**
 * Nightly Storage Charge Activity
 *
 * Temporal activity that reads GroupStorageLedger data to compute GB-hours
 * per group for a target UTC day, then records a storage_daily_charge
 * UsageEvent for each group with non-zero storage activity.
 *
 * Also provides the end-of-month archival activity that purges stale ledger
 * rows and old UsageEvent rows (US-011).
 */

import { getPrismaClient } from "../activities/database-client";
import { createActivityLogger } from "../logger";
import { UsageEventWriter } from "./usage-event-writer";

const ACTIVITY_NAME = "billing.nightlyStorageCharge";
const ARCHIVAL_ACTIVITY_NAME = "billing.monthEndArchival";

const MS_PER_HOUR = 3_600_000;
const BYTES_PER_GB = 1_073_741_824;
// Settled on 2 years for standard.
const DEFAULT_RETENTION_DAYS = 365 * 2;

export interface NightlyStorageChargeInput {
  /** UTC epoch milliseconds for the start of the target day (midnight UTC). */
  targetDayStartMs: number;
}

export interface NightlyStorageChargeResult {
  /** Number of groups that received a storage_daily_charge event. */
  groupsCharged: number;
  /** Total GB-hours computed across all groups. */
  totalGbHours: number;
  /** Number of UsageEvents recorded. */
  eventsRecorded: number;
}

/**
 * Computes GB-hours per group for the given day and records storage_daily_charge
 * UsageEvents for groups with non-zero usage.
 *
 * The day window is [targetDayStartMs, targetDayStartMs + 24h).
 * Only ledger rows where written_at < end_of_day AND (deleted_at IS NULL OR deleted_at > start_of_day)
 * are included.
 *
 * GB-hour rate is derived from cost_per_gb_units_per_month / (days_in_month * 24).
 *
 * @param input - Contains the target day start in UTC epoch milliseconds
 */
export async function runNightlyStorageCharge(
  input: NightlyStorageChargeInput,
): Promise<NightlyStorageChargeResult> {
  const log = createActivityLogger(ACTIVITY_NAME, {
    targetDayStartMs: input.targetDayStartMs,
  });

  const prisma = getPrismaClient();

  const startOfDay = new Date(input.targetDayStartMs);
  const endOfDay = new Date(input.targetDayStartMs + 24 * MS_PER_HOUR);

  log.info(
    `Computing storage charges for ${startOfDay.toISOString()} – ${endOfDay.toISOString()}`,
  );

  // Resolve the currently active rate version
  const rateVersion = await prisma.rateVersion.findFirst({
    where: { effective_from: { lte: endOfDay } },
    orderBy: { effective_from: "desc" },
  });

  if (!rateVersion) {
    log.warn("No active rate version found; skipping nightly storage charge");
    return { groupsCharged: 0, totalGbHours: 0, eventsRecorded: 0 };
  }

  // Compute the per-GB-hour rate from the monthly rate
  // days_in_month is the number of calendar days in the billing month
  const billingYear = startOfDay.getUTCFullYear();
  const billingMonth = startOfDay.getUTCMonth(); // 0-indexed
  const daysInMonth = new Date(billingYear, billingMonth + 1, 0).getUTCDate();
  const unitsPerGbPerMonth = Number(rateVersion.units_per_gb_per_month);
  const costPerGbHour = unitsPerGbPerMonth / (daysInMonth * 24);

  // Query ledger rows active during the day window
  const ledgerRows = await prisma.groupStorageLedger.findMany({
    where: {
      written_at: { lt: endOfDay },
      OR: [{ deleted_at: null }, { deleted_at: { gt: startOfDay } }],
    },
    select: {
      group_id: true,
      size_bytes: true,
      written_at: true,
      deleted_at: true,
    },
  });

  // Group ledger rows by group_id and accumulate GB-hours
  const gbHoursByGroup = new Map<string, number>();
  for (const row of ledgerRows) {
    const aliveFrom = Math.max(row.written_at.getTime(), startOfDay.getTime());
    const aliveUntil = Math.min(
      row.deleted_at ? row.deleted_at.getTime() : endOfDay.getTime(),
      endOfDay.getTime(),
    );
    const hoursAlive = (aliveUntil - aliveFrom) / MS_PER_HOUR;
    if (hoursAlive <= 0) continue;

    const gbHours = (Number(row.size_bytes) / BYTES_PER_GB) * hoursAlive;
    gbHoursByGroup.set(
      row.group_id,
      (gbHoursByGroup.get(row.group_id) ?? 0) + gbHours,
    );
  }

  const writer = new UsageEventWriter(prisma);
  let groupsCharged = 0;
  let totalGbHours = 0;
  let eventsRecorded = 0;

  for (const [groupId, gbHours] of gbHoursByGroup) {
    if (gbHours <= 0) continue;

    const unitsConsumed = gbHours * costPerGbHour;

    await writer.recordUsageEvent({
      event_type: "blob_storage",
      group_id: groupId,
      rate_version_id: rateVersion.id,
      unit_cost_dollars: Number(rateVersion.unit_cost_dollars),
      units_consumed: unitsConsumed,
      storage_gb_hours: gbHours,
      activity_name: "storage_daily_charge",
    });

    groupsCharged += 1;
    totalGbHours += gbHours;
    eventsRecorded += 1;
  }

  log.info(
    `Storage charge complete: ${groupsCharged} groups charged, ${totalGbHours.toFixed(4)} total GB-hours`,
  );

  return { groupsCharged, totalGbHours, eventsRecorded };
}

export interface MonthEndArchivalInput {
  /** UTC epoch milliseconds for the start of the current calendar month. */
  currentMonthStartMs: number;
}

export interface MonthEndArchivalResult {
  /** Number of GroupStorageLedger rows deleted. */
  ledgerRowsArchived: number;
  /** Number of UsageEvent rows deleted. */
  usageEventsArchived: number;
}

/**
 * Purges stale GroupStorageLedger rows and old UsageEvent rows.
 *
 * Ledger purge: deletes rows where deleted_at IS NOT NULL AND deleted_at < start_of_current_month.
 * Live rows (deleted_at IS NULL) are never deleted.
 *
 * UsageEvent purge: deletes rows where created_at < now() - USAGE_EVENT_RETENTION_DAYS.
 * Defaults to 730 days (2 years) if USAGE_EVENT_RETENTION_DAYS is not set.
 *
 * UsagePeriodSummary rows are never purged.
 *
 * @param input - Contains the start of the current calendar month in UTC epoch ms
 */
export async function runMonthEndArchival(
  input: MonthEndArchivalInput,
): Promise<MonthEndArchivalResult> {
  const log = createActivityLogger(ARCHIVAL_ACTIVITY_NAME, {
    currentMonthStartMs: input.currentMonthStartMs,
  });

  const prisma = getPrismaClient();
  const currentMonthStart = new Date(input.currentMonthStartMs);

  const retentionDays = Number(
    process.env.USAGE_EVENT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS,
  );
  const retentionCutoff = new Date(
    Date.now() - retentionDays * 24 * MS_PER_HOUR,
  );

  log.info(
    `Running month-end archival: ledger cutoff=${currentMonthStart.toISOString()}, event retention cutoff=${retentionCutoff.toISOString()}`,
  );

  // Purge stale ledger rows (deleted before the current month)
  const ledgerResult = await prisma.groupStorageLedger.deleteMany({
    where: {
      deleted_at: {
        not: null,
        lt: currentMonthStart,
      },
    },
  });

  // Purge old UsageEvent rows beyond retention window
  const usageEventResult = await prisma.usageEvent.deleteMany({
    where: {
      created_at: { lt: retentionCutoff },
    },
  });

  log.info(
    `Archival complete: ${ledgerResult.count} ledger rows purged, ${usageEventResult.count} usage events purged`,
  );

  return {
    ledgerRowsArchived: ledgerResult.count,
    usageEventsArchived: usageEventResult.count,
  };
}
