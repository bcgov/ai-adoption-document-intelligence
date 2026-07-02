import type { UsageEvent } from "@generated/client";
import { getPrismaClient } from "../activities/database-client";
import { createActivityLogger } from "../logger";
import { UsageEventWriter } from "./usage-event-writer";

const ACTIVITY_NAME = "billing.recordWorkflowLifecycle";

export interface RecordWorkflowLifecycleInput {
  /** The Temporal workflow execution ID (e.g. "graph-<documentId>"). */
  workflowExecutionId: string;
  /** The group that owns the workflow run. */
  groupId: string | null | undefined;
  /** Terminal state of the workflow. */
  status: "completed" | "failed" | "cancelled";
}

/**
 * Records a workflow terminal lifecycle event (workflow_completed, workflow_failed,
 * or workflow_cancelled) into the billing system.
 *
 * Sums all activity_completed UsageEvent rows for the workflow execution to compute
 * the total units consumed, then persists the lifecycle event without modifying the
 * UsagePeriodSummary (the summary was already updated by activity_completed events).
 */
export async function recordWorkflowLifecycle(
  input: RecordWorkflowLifecycleInput,
): Promise<UsageEvent | null> {
  const { workflowExecutionId, groupId, status } = input;

  const log = createActivityLogger(ACTIVITY_NAME, { workflowExecutionId });

  if (!groupId) {
    log.warn("Skipping lifecycle event: no groupId");
    return null;
  }

  const prisma = getPrismaClient();

  // Resolve the currently active rate version
  const rateVersion = await prisma.rateVersion.findFirst({
    where: { effective_from: { lte: new Date() } },
    orderBy: { effective_from: "desc" },
  });

  if (!rateVersion) {
    log.warn("No active rate version found; skipping lifecycle event");
    return null;
  }

  // Sum units_consumed from all activity_completed events for this run
  const aggregate = await prisma.usageEvent.aggregate({
    where: {
      workflow_execution_id: workflowExecutionId,
      event_type: "activity_completed",
    },
    _sum: { units_consumed: true },
  });

  const totalUnits = Number(aggregate._sum.units_consumed ?? 0);

  const eventTypeMap = {
    completed: "workflow_completed",
    failed: "workflow_failed",
    cancelled: "workflow_cancelled",
  } as const;

  const writer = new UsageEventWriter(prisma);
  return writer.recordUsageEvent({
    event_type: eventTypeMap[status],
    group_id: groupId,
    rate_version_id: rateVersion.id,
    unit_cost_dollars: Number(rateVersion.unit_cost_dollars),
    units_consumed: totalUnits,
    workflow_execution_id: workflowExecutionId,
    skipSummaryUpdate: true,
  });
}
