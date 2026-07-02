import type { PrismaClient } from "@generated/client";
import { activityInfo } from "@temporalio/activity";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { createActivityLogger } from "../logger";
import { UsageEventWriter } from "./usage-event-writer";

const INTERCEPTOR_ACTIVITY = "billing.activityBillingInterceptor";

interface ActivityCostEntry {
  cost_type: "flat" | "per_page";
  units: number;
}

interface RateVersionContext {
  rateVersionId: string;
  unitCostDollars: number;
  activityCosts: Map<string, ActivityCostEntry>;
}

/**
 * Loads the currently active rate version and its activity costs from the database.
 * Returns null if no active rate version exists.
 */
export async function loadRateVersionContext(
  prisma: PrismaClient,
): Promise<RateVersionContext | null> {
  const rateVersion = await prisma.rateVersion.findFirst({
    where: { effective_from: { lte: new Date() } },
    orderBy: { effective_from: "desc" },
    include: { activity_costs: true },
  });

  if (!rateVersion) {
    return null;
  }

  const activityCosts = new Map<string, ActivityCostEntry>();
  for (const ac of rateVersion.activity_costs) {
    activityCosts.set(ac.activity_name, {
      cost_type: ac.cost_type,
      units: Number(ac.units),
    });
  }

  return {
    rateVersionId: rateVersion.id,
    unitCostDollars: Number(rateVersion.unit_cost_dollars),
    activityCosts,
  };
}

/**
 * Temporal activity interceptor that automatically records billing UsageEvents
 * for flat-cost and per-page activities after successful completion.
 *
 * - Only fires after `await next(input)` resolves successfully (not on failure).
 * - Skips activities not present in the active rate version.
 * - Handles flat-cost and per-page billing.
 * - Per-page activities must include `_metered_quantity` in their result.
 */
export class ActivityBillingInterceptor
  implements ActivityInboundCallsInterceptor
{
  constructor(
    private readonly writer: UsageEventWriter,
    private readonly rateVersionContext: RateVersionContext,
  ) {}

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    const result = await next(input);

    const info = activityInfo();
    const activityType = info.activityType;
    const workflowExecutionId = info.workflowExecution.workflowId;

    const resolvedGroupId = extractGroupId(input);
    if (!resolvedGroupId) {
      return result;
    }

    const { rateVersionId, unitCostDollars, activityCosts } =
      this.rateVersionContext;
    const costEntry = activityCosts.get(activityType);

    if (!costEntry) {
      // Activity not in rate version — no billing event
      return result;
    }

    let unitsConsumed = 0;
    let meteredQuantity: number | undefined;

    if (costEntry.cost_type === "flat") {
      unitsConsumed = costEntry.units;
    } else if (costEntry.cost_type === "per_page") {
      const quantity = extractMeteredQuantity(result);
      if (!quantity) {
        // Missing or zero quantity — skip
        return result;
      }
      unitsConsumed = quantity * costEntry.units;
      meteredQuantity = quantity;
    }

    if (unitsConsumed <= 0) {
      return result;
    }

    try {
      await this.writer.recordUsageEvent({
        event_type: "activity_completed",
        group_id: resolvedGroupId,
        rate_version_id: rateVersionId,
        unit_cost_dollars: unitCostDollars,
        units_consumed: unitsConsumed,
        workflow_execution_id: workflowExecutionId,
        activity_name: activityType,
        metered_quantity: meteredQuantity,
      });
    } catch (err) {
      const log = createActivityLogger(INTERCEPTOR_ACTIVITY, {
        workflowExecutionId,
        activityType,
      });
      log.warn("Failed to record billing event", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }
}

/**
 * Extracts the groupId from the activity input arguments.
 * Activities receive their arguments as the first element of the args array.
 */
function extractGroupId(input: ActivityExecuteInput): string | null {
  if (!Array.isArray(input.args) || input.args.length === 0) {
    return null;
  }
  const firstArg = input.args[0];
  if (
    firstArg !== null &&
    typeof firstArg === "object" &&
    "groupId" in firstArg &&
    typeof (firstArg as Record<string, unknown>).groupId === "string"
  ) {
    return (firstArg as Record<string, unknown>).groupId as string;
  }
  return null;
}

/**
 * Extracts `_metered_quantity` from the activity result if present and > 0.
 */
function extractMeteredQuantity(result: unknown): number | null {
  if (result === null || typeof result !== "object") {
    return null;
  }
  const val = (result as Record<string, unknown>)._metered_quantity;
  if (typeof val === "number" && val > 0) {
    return val;
  }
  return null;
}
