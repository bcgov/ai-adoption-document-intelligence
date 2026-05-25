/**
 * Periodic GC workflow for the activity-output cache (US-134).
 *
 * Sweeps expired rows out of `ActivityOutputCache` once per hour. Lazy
 * GC in `activityOutputCache.findFresh` filters expired rows on read, so
 * this workflow is a true background cleanup — it only keeps the table
 * size bounded; cache correctness does not depend on it running.
 *
 * Design choice: a long-running periodic workflow (per the §2.7 fallback
 * pathway) rather than a Temporal Schedule. The codebase has no existing
 * Schedule usage, so the simpler approach is a workflow that runs `gc()`
 * then `sleep("1 hour")` in a loop. `continueAsNew` is invoked once per
 * day so the workflow history doesn't grow unbounded.
 *
 * See `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.7 and the
 * `REQUIREMENTS.md` L17 entry for the scheduling rationale.
 *
 * Operator note: this workflow is NOT auto-started by the worker. Start it
 * once with `temporal workflow start` (or the SDK client) at a stable
 * workflow ID (e.g. `cache-gc-singleton`) so re-deployments don't spawn
 * additional copies. The workflow self-perpetuates via `continueAsNew`.
 */

// Import directly from `@temporalio/workflow` for the periodic workflow's
// proxy + sleep + continueAsNew helpers.
import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
import {
  ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
  type ActivityOutputCacheGcResult,
} from "./activities/cache/activity-output-cache.types";

/**
 * How often the GC sweep runs. One hour matches the default cache TTL of
 * 24h — by sweeping every hour we keep expired rows around for at most
 * one extra hour past their `expiresAt`, which is well inside the lazy-GC
 * read-side filter so consumers never see stale data.
 */
export const CACHE_GC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Number of sweeps performed in a single workflow execution before
 * `continueAsNew` resets the history. 24 sweeps × 1h = one calendar day.
 * Keeps Temporal history bounded without making restarts feel chatty.
 */
export const CACHE_GC_SWEEPS_PER_RUN = 24;

/**
 * Activity options applied to the GC call. Mirrors
 * `ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS` (10s timeout, 3-attempt retry)
 * but overrides `startToCloseTimeout` to "1 minute" — a delete-by-index
 * sweep can touch many rows in steady state, so the per-call budget is
 * larger than the row-by-row `findFresh`/`upsert` calls.
 */
const cacheGcActivities = proxyActivities<{
  "activityOutputCache.gc": () => Promise<ActivityOutputCacheGcResult>;
}>({
  ...ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
  startToCloseTimeout: "1 minute",
});

/**
 * Input shape for `cacheGcWorkflow`. Kept open for the operator to override
 * the interval / per-run sweep count at start-up time if needed.
 */
export interface CacheGcWorkflowInput {
  /** Interval between sweeps in milliseconds. Defaults to one hour. */
  intervalMs?: number;
  /** Number of sweeps per workflow execution before continueAsNew. */
  sweepsPerRun?: number;
}

/**
 * Long-running periodic GC workflow. Runs `gc` then sleeps for the
 * configured interval, repeating `sweepsPerRun` times before continuing
 * as new so workflow history stays bounded.
 */
export async function cacheGcWorkflow(
  input: CacheGcWorkflowInput = {},
): Promise<void> {
  const intervalMs = input.intervalMs ?? CACHE_GC_INTERVAL_MS;
  const sweepsPerRun = input.sweepsPerRun ?? CACHE_GC_SWEEPS_PER_RUN;

  for (let i = 0; i < sweepsPerRun; i++) {
    await cacheGcActivities["activityOutputCache.gc"]();
    await sleep(intervalMs);
  }

  await continueAsNew<typeof cacheGcWorkflow>({ intervalMs, sweepsPerRun });
}
