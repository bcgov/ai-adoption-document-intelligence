import type { ActivityCostType } from "@generated/client";

export interface ActivityCostEntry {
  cost_type: ActivityCostType;
  units: number;
}

export interface TrainingCosts {
  template_model: number;
  classifier: number;
}

export interface RateVersionEntry {
  version: string;
  effective_from: string;
  /** Dollar value of a single billing unit (e.g. 0.001 means 1 unit = $0.001). */
  unit_cost_dollars: number;
  /**
   * Storage rate expressed as billing units per GB per calendar month.
   * The nightly job converts this to an hourly rate at calculation time:
   *   cost_per_gb_hour = units_per_gb_per_month / (days_in_month × 24)
   */
  units_per_gb_per_month: number;
  /** Upper-bound page count used when estimating cost for per_page activities pre-flight. */
  max_pages_assumption: number;
  activity_costs: Record<string, ActivityCostEntry>;
  training_costs: TrainingCosts;
}
