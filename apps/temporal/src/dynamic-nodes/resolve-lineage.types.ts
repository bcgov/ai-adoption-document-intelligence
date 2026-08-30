/**
 * Workflow-safe types + activity options for the Phase 6 Milestone C
 * (US-171) `dynamicNode.resolveLineage` activity.
 *
 * Mirrors the seam established by
 * `apps/temporal/src/activities/cache/activity-output-cache.types.ts`:
 *  - The runtime implementation in `./resolve-lineage.activity.ts` reaches
 *    Postgres via Prisma, which is forbidden inside Temporal workflow
 *    code (workflows must be deterministic + replay-safe).
 *  - The workflow imports the proxy options + I/O shapes from THIS file
 *    so the workflow bundle does not pull Prisma in.
 *
 * `nonCacheable: true` is the custom marker consumed by Phase 4's worker
 * decorator (`apps/temporal/src/cache/cached-activity.ts`) — it tells the
 * decorator to never wrap this activity in cache lookup/write logic. For
 * the lineage resolver this is critical because the head pointer can
 * change between executions; caching would prevent hot-reload from being
 * picked up.
 */

import type { Duration, RetryPolicy } from "@temporalio/common";

/**
 * The permanent resolution failures (`./errors.ts`): the lineage is
 * deleted/absent, the pinned version doesn't exist, or the head pointer is
 * missing. Retrying a Postgres lookup does not bring a deleted row back,
 * so these are terminal; only transient DB faults keep the 3-attempt
 * retry. Matched against the `ApplicationFailure.type` the worker derives
 * from each error class's `name`.
 */
export const RESOLVE_LINEAGE_NON_RETRYABLE_ERROR_TYPES: string[] = [
  "DynamicNodeDeletedError",
  "DynamicNodeVersionNotFoundError",
  "DynamicNodeHeadMissingError",
];

/**
 * Activity options applied to `dynamicNode.resolveLineage`. Shape mirrors
 * `ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS` — `nonCacheable: true` plus a
 * short timeout (the activity does one or two Postgres lookups and
 * nothing else). The retry policy covers transient DB faults only; the
 * typed not-found/deleted errors are permanent and listed non-retryable.
 */
export const RESOLVE_LINEAGE_ACTIVITY_OPTIONS: {
  /** Marker for the US-132 worker decorator — never cache-wrap this call. */
  nonCacheable: true;
  startToCloseTimeout: Duration;
  retry: RetryPolicy;
} = {
  nonCacheable: true,
  startToCloseTimeout: "10 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "100ms",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: RESOLVE_LINEAGE_NON_RETRYABLE_ERROR_TYPES,
  },
};

export interface ResolveLineageActivityInput {
  groupId: string;
  slug: string;
  /** Optional pinned version number; omitted = head. */
  version?: number;
}

export interface ResolveLineageActivityResult {
  versionId: string;
  /**
   * The resolved version's `@deterministic` flag. §3.3: the executor uses
   * this to bypass the Phase 4 cache for non-deterministic dynamic nodes
   * (the static catalog has no `dyn.*` entry for the decorator to consult).
   */
  deterministic: boolean;
}
