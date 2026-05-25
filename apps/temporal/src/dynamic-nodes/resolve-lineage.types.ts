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

import type { CacheActivityOptions } from "../activities/cache/activity-output-cache.types";

/**
 * Activity options applied to `dynamicNode.resolveLineage`. Shape mirrors
 * `ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS` — `nonCacheable: true` plus a
 * short timeout (the activity does one or two Postgres lookups and
 * nothing else).
 */
export const RESOLVE_LINEAGE_ACTIVITY_OPTIONS: CacheActivityOptions = {
  nonCacheable: true,
  startToCloseTimeout: "10 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "100ms",
    backoffCoefficient: 2,
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
}
