/**
 * String union matching the UsageEventType Prisma enum.
 * Kept as a string union so this package has no Prisma dependency.
 */
export type BillingEventType =
  | "workflow_started"
  | "activity_completed"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"
  | "model_training_started"
  | "storage_daily_charge";

/** Input data for recording a single UsageEvent and updating the period summary. */
export interface RecordUsageEventInput {
  event_type: BillingEventType;
  group_id: string;
  /** Rate version ID active at the time this event is created, for audit reproducibility. */
  rate_version_id: string;
  /**
   * Dollar value of a single billing unit from the active rate version.
   * Used to compute the `total_dollars_spent` increment on UsagePeriodSummary.
   */
  unit_cost_dollars: number;
  /** Number of billing units consumed by this event. */
  units_consumed: number;
  workflow_execution_id?: string;
  activity_name?: string;
  /** Raw metered quantity (e.g. page count) for per_page activities. */
  metered_quantity?: number;
  /** Pre-flight estimated units (set on workflow_started events). */
  estimated_units?: number;
  /** Storage consumed in GB-hours (set on storage_daily_charge events). */
  storage_gb_hours?: number;
  resource_id?: string;
  resource_type?: string;
  /**
   * When true, the UsagePeriodSummary is not updated.
   * Use for informational lifecycle events (workflow_started, workflow_completed, etc.)
   * that record estimates or aggregates rather than new spend.
   */
  skipSummaryUpdate?: boolean;
}

/** Minimal shape of the usageEvent.create data argument, Prisma-compatible. */
export interface UsageEventCreateData {
  event_type: BillingEventType;
  group_id: string;
  rate_version_id: string;
  units_consumed: number;
  workflow_execution_id: string | null;
  activity_name: string | null;
  metered_quantity: number | null;
  estimated_units: number | null;
  storage_gb_hours: number | null;
  resource_id: string | null;
  resource_type: string | null;
}

/** Minimal shape of the usagePeriodSummary.upsert argument, Prisma-compatible. */
export interface UsagePeriodSummaryUpsertArgs {
  where: {
    group_id_period_year_period_month: {
      group_id: string;
      period_year: number;
      period_month: number;
    };
  };
  create: {
    group_id: string;
    period_year: number;
    period_month: number;
    total_units_consumed: number;
    total_dollars_spent: number;
  };
  update: {
    total_units_consumed: { increment: number };
    total_dollars_spent: { increment: number };
  };
}
