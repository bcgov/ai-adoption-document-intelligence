/**
 * Nightly Storage Charge Workflow
 *
 * A Temporal scheduled workflow that runs once per UTC day to:
 * 1. Compute GB-hours per group for the previous calendar day and record
 *    storage_daily_charge UsageEvents (US-010).
 * 2. On the last day of the month, also run the end-of-month archival step
 *    that purges stale GroupStorageLedger rows and old UsageEvent rows (US-011).
 *
 * This workflow is triggered by a Temporal Schedule and should not be started
 * manually except for backfill purposes.
 */

import { proxyActivities } from "@temporalio/workflow";
import type {
  MonthEndArchivalInput,
  MonthEndArchivalResult,
  NightlyStorageChargeInput,
  NightlyStorageChargeResult,
} from "./nightly-storage-charge.activity";

// Activities are proxied for Temporal determinism
const { runNightlyStorageCharge, runMonthEndArchival } = proxyActivities<{
  runNightlyStorageCharge(
    input: NightlyStorageChargeInput,
  ): Promise<NightlyStorageChargeResult>;
  runMonthEndArchival(
    input: MonthEndArchivalInput,
  ): Promise<MonthEndArchivalResult>;
}>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
  },
});

/**
 * Determines whether a given UTC date is the last day of its calendar month.
 *
 * @param date - Date to check
 * @returns true if the date is the last day of the month in UTC
 */
function isLastDayOfMonth(date: Date): boolean {
  const nextDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return nextDay.getUTCDate() === 1;
}

/**
 * Returns UTC epoch milliseconds for the start of the given UTC month.
 *
 * @param date - Any date within the target month
 * @returns UTC epoch ms for midnight on the first day of the month
 */
function getStartOfMonth(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/**
 * Nightly storage charge workflow.
 *
 * Computes storage charges for yesterday's UTC day window and optionally
 * runs end-of-month archival on the last day of the month.
 *
 * The target day is derived from the current workflow clock so the workflow
 * is deterministic and backfillable.
 */
export async function nightlyStorageChargeWorkflow(): Promise<void> {
  // Use Date.now() — safe in workflow context as Temporal replaces it with
  // deterministic time. Compute "yesterday" as the previous UTC calendar day.
  const now = new Date(Date.now());
  const yesterday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const targetDayStartMs = yesterday.getTime();

  // Step 1: Record daily storage charges for yesterday
  await runNightlyStorageCharge({ targetDayStartMs });

  // Step 2: If yesterday was the last day of the month, run archival
  if (isLastDayOfMonth(yesterday)) {
    const currentMonthStartMs = getStartOfMonth(now);
    await runMonthEndArchival({ currentMonthStartMs });
  }
}
