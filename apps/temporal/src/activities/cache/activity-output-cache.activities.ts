/**
 * Pure-Temporal activities that proxy reads/writes against the
 * `ActivityOutputCache` table — the worker decorator (US-132) calls these so
 * the worker process never imports Prisma directly inside workflow code.
 *
 * Mirrors the logic of the backend's `ActivityOutputCacheRepository`
 * (`apps/backend-services/src/cache/activity-output-cache.repository.ts`):
 *   - `findFresh` — composite-unique-key lookup with TTL filtering. Rows
 *     whose `expiresAt <= now()` are reported as cache misses (returns `null`)
 *     so consumers never see stale data even before GC sweeps them.
 *   - `upsert` — insert-or-overwrite on the composite unique key. On
 *     overwrite the mutable payload columns (`outputCtx`, `outputKind`,
 *     `expiresAt`) are refreshed.
 *
 * Bridging pattern mirrors `getWorkflowGraphConfig`: the activity reaches the
 * Postgres backing store through the worker-process Prisma client exposed by
 * `./database-client.ts`. This is the established Temporal-side bridge into
 * the backend's data layer.
 *
 * The `nonCacheable: true` marker on `ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS`
 * is NOT a built-in Temporal field — it's custom metadata consumed by the
 * US-132 worker decorator's "bypass list" logic so the decorator does not
 * recurse into caching its own cache operations.
 *
 * Specs: docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §2.4 and
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L14.
 */

import { DEFAULT_CACHE_TTL_MS } from "@ai-di/graph-workflow";
import type { Prisma } from "@generated/client";
import { getPrismaClient } from "../database-client";
import type {
  ActivityOutputCacheFindFreshInput,
  ActivityOutputCacheFindFreshResult,
  ActivityOutputCacheGcResult,
  ActivityOutputCacheUpsertInput,
} from "./activity-output-cache.types";

// Re-export the workflow-safe pieces so backend tests + the worker
// decorator can continue importing them from a single module while
// the workflow bundle pulls them from `./activity-output-cache.types`
// (no Prisma in scope). See `./activity-output-cache.types.ts` for the
// rationale.
export {
  ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
  type ActivityOutputCacheFindFreshInput,
  type ActivityOutputCacheFindFreshResult,
  type ActivityOutputCacheGcResult,
  type ActivityOutputCacheUpsertInput,
  type CacheActivityOptions,
} from "./activity-output-cache.types";

async function findFresh(
  input: ActivityOutputCacheFindFreshInput,
): Promise<ActivityOutputCacheFindFreshResult | null> {
  const prisma = getPrismaClient();
  const row = await prisma.activityOutputCache.findUnique({
    where: {
      workflowLineageId_nodeId_configHash_inputHash: {
        workflowLineageId: input.workflowLineageId,
        nodeId: input.nodeId,
        configHash: input.configHash,
        inputHash: input.inputHash,
      },
    },
  });

  if (row === null) {
    return null;
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return {
    outputCtx: row.outputCtx as Record<string, unknown>,
    outputKind: row.outputKind,
  };
}

async function upsert(input: ActivityOutputCacheUpsertInput): Promise<void> {
  const prisma = getPrismaClient();
  const ttl = input.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const outputKind = input.outputKind ?? null;
  const outputCtx = input.outputCtx as Prisma.InputJsonValue;

  await prisma.activityOutputCache.upsert({
    where: {
      workflowLineageId_nodeId_configHash_inputHash: {
        workflowLineageId: input.workflowLineageId,
        nodeId: input.nodeId,
        configHash: input.configHash,
        inputHash: input.inputHash,
      },
    },
    create: {
      workflowLineageId: input.workflowLineageId,
      nodeId: input.nodeId,
      configHash: input.configHash,
      inputHash: input.inputHash,
      outputCtx,
      outputKind,
      expiresAt,
    },
    update: {
      outputCtx,
      outputKind,
      expiresAt,
    },
  });
}

/**
 * GC sweep — deletes every row whose `expiresAt` is in the past. Mirrors
 * `ActivityOutputCacheRepository.deleteExpired()` in the backend; backed by
 * the `(expiresAt)` index so the cost is `O(rows-to-delete)` regardless of
 * total table size.
 *
 * Marked `nonCacheable: true` via `ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS` —
 * the worker decorator (US-132) must never wrap this in cache lookup logic.
 * Spec: TRY_IN_PLACE_DESIGN.md §2.7 + US-134.
 */
async function gc(): Promise<ActivityOutputCacheGcResult> {
  const prisma = getPrismaClient();
  const result = await prisma.activityOutputCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { deletedCount: result.count };
}

/**
 * Namespaced activities exported under the `activityOutputCache` key so the
 * graph runner / worker decorator can address them as
 * `activityOutputCache.findFresh`, `activityOutputCache.upsert`, and
 * `activityOutputCache.gc` (matches the catalog's dot-namespaced activity
 * types).
 */
export const activityOutputCache = {
  findFresh,
  upsert,
  gc,
};
