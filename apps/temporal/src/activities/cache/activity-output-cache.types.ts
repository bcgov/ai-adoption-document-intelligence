/**
 * Workflow-safe type + constant exports for the activity-output cache
 * proxy activities (US-131).
 *
 * The runtime activity implementations in
 * `./activity-output-cache.activities.ts` reach Postgres through Prisma,
 * which is forbidden inside Temporal workflow code (workflows must be
 * deterministic + replay-safe). This module is the seam: the workflow
 * imports the proxy-options constant + the request/response interfaces
 * from here without pulling Prisma into the workflow bundle, while
 * `./activity-output-cache.activities.ts` re-exports the same shapes
 * alongside its Prisma-bound implementations for the worker side.
 *
 * Specs: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L14.
 */

/**
 * Custom activity-options shape applied to both `findFresh` and `upsert`.
 *
 * Combines the standard Temporal fields (`startToCloseTimeout`, `retry`) with
 * the custom `nonCacheable` marker consumed by the US-132 worker decorator's
 * bypass list. Wrapped in its own type so it can be imported by US-132's
 * decorator and the worker-options test harness.
 */
export interface CacheActivityOptions {
  /**
   * Marker for the worker decorator (US-132): when true, the decorator MUST
   * NOT wrap the activity in cache lookup/write logic (avoids infinite
   * recursion when the decorator's own helpers go through Temporal
   * activities). Not a built-in Temporal field.
   */
  nonCacheable: true;
  /**
   * Per-call timeout — `findFresh`/`upsert` are simple Postgres reads/writes
   * via the unique index, so 10 seconds is plenty.
   */
  startToCloseTimeout: "10 seconds";
  /**
   * Short retry policy tuned for transient DB faults (connection
   * blips, statement timeouts). Long retries are inappropriate because
   * these calls sit on the hot path of every cached activity execution.
   */
  retry: {
    maximumAttempts: 3;
    initialInterval: "100ms";
    backoffCoefficient: 2;
  };
}

/**
 * Activity options that the worker decorator (US-132) MUST apply when
 * proxying `activityOutputCache.findFresh` and `activityOutputCache.upsert`.
 *
 * `nonCacheable: true` is the marker that prevents the decorator from
 * recursing into caching its own cache operations.
 */
export const ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS: CacheActivityOptions = {
  nonCacheable: true,
  startToCloseTimeout: "10 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "100ms",
    backoffCoefficient: 2,
  },
};

/**
 * Input to `activityOutputCache.findFresh` — the composite unique key from
 * the `ActivityOutputCache` Prisma model (L9 in REQUIREMENTS.md).
 */
export interface ActivityOutputCacheFindFreshInput {
  workflowLineageId: string;
  nodeId: string;
  configHash: string;
  inputHash: string;
}

/**
 * Return shape for `activityOutputCache.findFresh`. Limited to the columns
 * the decorator + preview-cache consumers need; `null` represents a cache
 * miss (no row OR an expired row).
 */
export interface ActivityOutputCacheFindFreshResult {
  outputCtx: Record<string, unknown>;
  outputKind: string | null;
}

/**
 * Input to `activityOutputCache.upsert`. Carries the composite unique key
 * plus the mutable payload columns. `ttlMs` defaults to
 * `DEFAULT_CACHE_TTL_MS` (24h, from the shared `@ai-di/graph-workflow`
 * constant).
 */
export interface ActivityOutputCacheUpsertInput {
  workflowLineageId: string;
  nodeId: string;
  configHash: string;
  inputHash: string;
  outputCtx: Record<string, unknown>;
  outputKind?: string | null;
  ttlMs?: number;
}

/**
 * Return shape for `activityOutputCache.gc` (US-134). Reports how many
 * rows the sweep deleted so the periodic workflow can log a useful
 * summary on each pass. Lives in this workflow-safe types module so the
 * `cacheGcWorkflow` can import it without pulling Prisma into the
 * workflow bundle.
 */
export interface ActivityOutputCacheGcResult {
  deletedCount: number;
}
