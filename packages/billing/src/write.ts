import type {
  RecordUsageEventInput,
  UsageEventCreateData,
  UsagePeriodSummaryUpsertArgs,
} from "./types";

/** Pre-built arguments for both Prisma operations, ready to pass directly to the caller's transaction. */
export interface UsageEventWriteOps {
  /** Pass to `tx.usageEvent.create({ data: createData })` */
  createData: UsageEventCreateData;
  /** Pass to `tx.usagePeriodSummary.upsert(upsertArgs)` */
  upsertArgs: UsagePeriodSummaryUpsertArgs;
}

/**
 * Builds the Prisma arguments for writing a UsageEvent and upserting the
 * UsagePeriodSummary for the event's group and current UTC calendar month.
 *
 * The caller is responsible for executing both operations inside a single
 * database transaction:
 * ```ts
 * const { createData, upsertArgs } = buildUsageEventWriteOps(input);
 * return prisma.$transaction(async (tx) => {
 *   const event = await tx.usageEvent.create({ data: createData });
 *   await tx.usagePeriodSummary.upsert(upsertArgs);
 *   return event;
 * });
 * ```
 *
 * @param input - Event data including rate version context for dollar conversion.
 * @param now - Timestamp used to determine the billing period (defaults to `new Date()`).
 */
export function buildUsageEventWriteOps(
  input: RecordUsageEventInput,
  now = new Date(),
): UsageEventWriteOps {
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;
  const dollarsIncrement = input.units_consumed * input.unit_cost_dollars;

  return {
    createData: {
      event_type: input.event_type,
      group_id: input.group_id,
      rate_version_id: input.rate_version_id,
      units_consumed: input.units_consumed,
      workflow_execution_id: input.workflow_execution_id ?? null,
      activity_name: input.activity_name ?? null,
      metered_quantity: input.metered_quantity ?? null,
      estimated_units: input.estimated_units ?? null,
      storage_gb_hours: input.storage_gb_hours ?? null,
      resource_id: input.resource_id ?? null,
      resource_type: input.resource_type ?? null,
    },
    upsertArgs: {
      where: {
        group_id_period_year_period_month: {
          group_id: input.group_id,
          period_year: periodYear,
          period_month: periodMonth,
        },
      },
      create: {
        group_id: input.group_id,
        period_year: periodYear,
        period_month: periodMonth,
        total_units_consumed: input.units_consumed,
        total_dollars_spent: dollarsIncrement,
      },
      update: {
        total_units_consumed: { increment: input.units_consumed },
        total_dollars_spent: { increment: dollarsIncrement },
      },
    },
  };
}
