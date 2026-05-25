/**
 * Workflow-safe input/result + activity-options types for the Phase 6
 * Milestone C (US-170) `dyn.run` Temporal activity.
 *
 * The runtime activity in `./dyn-run.activity.ts` imports Prisma + the
 * `deno-runner` HTTP client; neither belongs in workflow code. This file
 * exposes only the shapes the workflow needs to construct an invocation.
 */

import type { Duration, RetryPolicy } from "@temporalio/common";

/**
 * Default activity options applied to `dyn.run`. The signature's own
 * `timeoutMs` (capped at 60_000) bounds the runner-side execution; we
 * add a generous Temporal-side buffer so a slow runner doesn't trigger
 * Temporal's own timeout before the runner can return its structured
 * `timedOut: true` response.
 *
 * Retry is set to 1 (no retries) — dynamic-node failures are surfaced to
 * the agent for revision, not silently retried.
 */
export const DYN_RUN_ACTIVITY_OPTIONS: {
  startToCloseTimeout: Duration;
  retry: RetryPolicy;
} = {
  startToCloseTimeout: "120 seconds",
  retry: { maximumAttempts: 1 },
};

/**
 * Input shape the workflow passes to `dyn.run`. The executor populates
 * every field at dispatch time (US-171): `versionId` from the lineage
 * resolution; ambient context (groupId, workflowRunId, apiKey) from
 * `ExecutionState`; `parameters` from `node.parameters`; `inputCtx` from
 * the consumed ctx slice.
 */
export interface DynRunActivityInput {
  slug: string;
  versionId: string;
  parameters: Record<string, unknown>;
  inputCtx: Record<string, unknown>;
  groupId: string;
  workflowRunId: string;
  apiKey: string;
}

/**
 * Activity result. The script's parsed stdout object is returned as-is;
 * the executor writes the declared output ports onto ctx using the
 * standard `PortBinding` walk.
 */
export type DynRunActivityResult = Record<string, unknown>;
