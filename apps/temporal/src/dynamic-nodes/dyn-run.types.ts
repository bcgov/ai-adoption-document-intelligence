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
 * Names of the typed script-level errors (`./errors.ts`) that must NOT be
 * retried: they describe the SCRIPT's behaviour (it timed out in the
 * sandbox, crashed, printed non-JSON, omitted a declared port), so
 * re-running produces the same failure and the right consumer is the
 * agent/author revising the script. The Temporal worker converts a thrown
 * `Error` subclass into an `ApplicationFailure` whose `type` is the
 * error's `name`, which is what `nonRetryableErrorTypes` matches on.
 */
export const DYN_RUN_NON_RETRYABLE_ERROR_TYPES: string[] = [
  "DynamicNodeTimeoutError",
  "DynamicNodeStdoutTooLargeError",
  "DynamicNodeRuntimeError",
  "DynamicNodeOutputInvalidJsonError",
  "DynamicNodeOutputShapeError",
];

/**
 * Default activity options applied to `dyn.run`. The signature's own
 * `timeoutMs` (capped at 60_000) bounds the runner-side execution; we
 * add a generous Temporal-side buffer so a slow runner doesn't trigger
 * Temporal's own timeout before the runner can return its structured
 * `timedOut: true` response.
 *
 * Retry classification: TRANSPORT failures — the runner unreachable, an
 * HTTP timeout, a 503 mid-restart (all surfaced as retryable errors by
 * the activity) — get 3 attempts with backoff, because a deno-runner pod
 * restart must not fail the run. SCRIPT-level outcomes stay terminal via
 * `nonRetryableErrorTypes`: they are surfaced to the agent for revision,
 * not silently retried.
 */
export const DYN_RUN_ACTIVITY_OPTIONS: {
  startToCloseTimeout: Duration;
  retry: RetryPolicy;
} = {
  startToCloseTimeout: "120 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: DYN_RUN_NON_RETRYABLE_ERROR_TYPES,
  },
};

/**
 * Input shape the workflow passes to `dyn.run`. The executor populates
 * every field at dispatch time (US-171): `versionId` from the lineage
 * resolution; ambient context (groupId, workflowRunId) from
 * `ExecutionState`; `parameters` from `node.parameters`; `inputCtx` from
 * the consumed ctx slice.
 *
 * Item 4 (security): no credential is part of this input — it would
 * otherwise be persisted in Temporal's durable activity history in
 * cleartext. The activity mints a short-lived internal token per
 * invocation, scoped to `groupId` (Change W); see `dyn-run.activity.ts`.
 */
export interface DynRunActivityInput {
  slug: string;
  versionId: string;
  parameters: Record<string, unknown>;
  inputCtx: Record<string, unknown>;
  groupId: string;
  workflowRunId: string;
}

/**
 * Activity result. The script's parsed stdout object is returned as-is;
 * the executor writes the declared output ports onto ctx using the
 * standard `PortBinding` walk.
 */
export type DynRunActivityResult = Record<string, unknown>;
