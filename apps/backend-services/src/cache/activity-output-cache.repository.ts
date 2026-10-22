import { resolveCacheTtlMs } from "@ai-di/graph-workflow";
import type { ActivityOutputCache, Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

/**
 * Unique-key shape used by `findFresh` and `upsert` to locate an
 * `ActivityOutputCache` row. Mirrors the Prisma `@@unique` on
 * `(workflowLineageId, nodeId, configHash, inputHash)` from US-126 / L9.
 */
export interface ActivityOutputCacheKey {
  workflowLineageId: string;
  nodeId: string;
  configHash: string;
  inputHash: string;
}

/**
 * Lookup shape for `findMostRecentFresh` (US-140): identifies a node
 * within a lineage without pinning a specific (configHash, inputHash).
 * The preview-cache endpoint uses this to surface "the most recent
 * output any Try has cached for this node", regardless of which
 * config/input combination produced it.
 */
export interface ActivityOutputCacheLineageNodeKey {
  workflowLineageId: string;
  nodeId: string;
}

/**
 * One node's exact cache key within a lineage, for `findManyFresh`: the
 * node id plus the two hashes a run's node status records for it.
 */
export type ActivityOutputCacheNodeKey = Omit<
  ActivityOutputCacheKey,
  "workflowLineageId"
>;

/**
 * Input for `upsert`. The unique-key columns plus the payload columns. When
 * `ttlMs` is omitted the row's `expiresAt` is set to
 * `now + resolveCacheTtlMs(process.env)` (14 days by default; override with
 * `ACTIVITY_OUTPUT_CACHE_TTL_MS` — G-024).
 */
export interface ActivityOutputCacheUpsertInput extends ActivityOutputCacheKey {
  outputCtx: Prisma.InputJsonValue;
  outputKind?: string | null;
  ttlMs?: number;
}

/**
 * Prisma-backed repository for the `ActivityOutputCache` table.
 *
 * Main operations:
 *   - `findFresh` / `findManyFresh`: exact unique-key lookups filtered to
 *     `expiresAt > now()` so TTL-expired rows are invisible to consumers even
 *     before GC sweeps them. A run's node statuses record each node's key, so
 *     these read back exactly the rows a run produced or was served.
 *   - `findMostRecentFresh` / `findManyMostRecentFresh`: each node's newest
 *     fresh row, whichever run wrote it.
 *   - `upsert`: insert-or-overwrite on the unique key; on overwrite, mutable
 *     payload columns (`outputCtx`, `outputKind`, `expiresAt`) are refreshed.
 *   - `deleteExpired`: GC helper that removes all rows whose `expiresAt`
 *     is in the past. Uses the `(expiresAt)` index from US-126.
 *
 * The preview-cache endpoints (US-140) are the consumers in this app; the
 * worker reads and writes the same table through its own cache activities.
 * See `docs-md/workflows/TRY_IN_PLACE_DESIGN.md` §2.2 + §2.5.
 */
@Injectable()
export class ActivityOutputCacheRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Look up a fresh (non-expired) cache row by the composite unique key.
   *
   * Returns `null` when no row exists OR when the matching row has expired
   * (`expiresAt <= now()`). Callers MUST treat `null` as a cache miss.
   */
  async findFresh(
    key: ActivityOutputCacheKey,
  ): Promise<ActivityOutputCache | null> {
    const row = await this.prismaService.prisma.activityOutputCache.findUnique({
      where: {
        workflowLineageId_nodeId_configHash_inputHash: {
          workflowLineageId: key.workflowLineageId,
          nodeId: key.nodeId,
          configHash: key.configHash,
          inputHash: key.inputHash,
        },
      },
    });

    if (row === null) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return row;
  }

  /**
   * Insert a new cache row OR overwrite the existing row matching the
   * composite unique key. On overwrite, the mutable payload columns
   * (`outputCtx`, `outputKind`, `expiresAt`) are refreshed; the unique-key
   * columns are not.
   *
   * `expiresAt` is computed as `now + (ttlMs ?? resolveCacheTtlMs(process.env))`.
   */
  async upsert(
    input: ActivityOutputCacheUpsertInput,
  ): Promise<ActivityOutputCache> {
    // G-024 — the retention window is env-tunable
    // (ACTIVITY_OUTPUT_CACHE_TTL_MS) so it can be adjusted without a deploy.
    const ttl = input.ttlMs ?? resolveCacheTtlMs(process.env);
    const expiresAt = new Date(Date.now() + ttl);
    const outputKind = input.outputKind ?? null;

    return this.prismaService.prisma.activityOutputCache.upsert({
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
        outputCtx: input.outputCtx,
        outputKind,
        expiresAt,
      },
      update: {
        outputCtx: input.outputCtx,
        outputKind,
        expiresAt,
      },
    });
  }

  /**
   * Return the most recent fresh (`expiresAt > now()`) cache row for a
   * `(workflowLineageId, nodeId)` pair, or `null` when none exists.
   *
   * "Most recent" is determined by `createdAt DESC`. Backed by the
   * `(workflowLineageId, nodeId)` index from US-126.
   *
   * Used by the preview-cache read endpoint (US-140) when no `runId`
   * scope is supplied — the consumer wants the canvas's "what was this
   * node's last output across any Try?" view.
   */
  async findMostRecentFresh(
    key: ActivityOutputCacheLineageNodeKey,
  ): Promise<ActivityOutputCache | null> {
    const row = await this.prismaService.prisma.activityOutputCache.findFirst({
      where: {
        workflowLineageId: key.workflowLineageId,
        nodeId: key.nodeId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    return row;
  }

  /**
   * Batch twin of {@link findFresh}: the fresh (`expiresAt > now()`) rows
   * matching any of `keys` within one lineage, in a single query. A key
   * with no fresh row is simply absent from the result; the unique key
   * means a key matches at most one row.
   *
   * Backs the run-scoped batch preview endpoint, which takes the keys from
   * the run's node statuses. An empty `keys` list returns `[]` without a
   * query.
   */
  async findManyFresh(params: {
    workflowLineageId: string;
    keys: readonly ActivityOutputCacheNodeKey[];
  }): Promise<ActivityOutputCache[]> {
    if (params.keys.length === 0) {
      return [];
    }
    return this.prismaService.prisma.activityOutputCache.findMany({
      where: {
        workflowLineageId: params.workflowLineageId,
        expiresAt: { gt: new Date() },
        OR: params.keys.map((key) => ({
          nodeId: key.nodeId,
          configHash: key.configHash,
          inputHash: key.inputHash,
        })),
      },
    });
  }

  /**
   * Batch twin of {@link findMostRecentFresh}: return the most recent
   * fresh (`expiresAt > now()`) cache row for **every** node in the
   * lineage — one row per `nodeId` — in a single query.
   *
   * Backs the batch preview-cache endpoint so the editor loads all node
   * previews with one round-trip instead of one request per node (the
   * O(nodes) request storm that tripped the rate limiter). Rows come back
   * ordered `createdAt DESC`; {@link pickMostRecentPerNode} keeps the
   * first (newest) row seen for each node.
   */
  async findManyMostRecentFresh(key: {
    workflowLineageId: string;
  }): Promise<ActivityOutputCache[]> {
    const rows = await this.prismaService.prisma.activityOutputCache.findMany({
      where: {
        workflowLineageId: key.workflowLineageId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    return this.pickMostRecentPerNode(rows);
  }

  /**
   * Reduce a `createdAt DESC`-ordered row list to one row per `nodeId` —
   * the first (hence newest) occurrence wins. Relies on the caller having
   * ordered the input; it does not sort.
   */
  private pickMostRecentPerNode(
    rows: ActivityOutputCache[],
  ): ActivityOutputCache[] {
    const seen = new Set<string>();
    const result: ActivityOutputCache[] = [];
    for (const row of rows) {
      if (seen.has(row.nodeId)) continue;
      seen.add(row.nodeId);
      result.push(row);
    }
    return result;
  }

  /**
   * GC helper. Removes all rows whose `expiresAt` is in the past and
   * returns the number of rows deleted. Backed by the `(expiresAt)` index.
   */
  async deleteExpired(): Promise<number> {
    const result =
      await this.prismaService.prisma.activityOutputCache.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
    return result.count;
  }
}
