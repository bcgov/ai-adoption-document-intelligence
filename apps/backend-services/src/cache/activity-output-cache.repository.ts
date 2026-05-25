import { DEFAULT_CACHE_TTL_MS } from "@ai-di/graph-workflow";
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
 * Input for `upsert`. The unique-key columns plus the payload columns. When
 * `ttlMs` is omitted the row's `expiresAt` is set to
 * `now + DEFAULT_CACHE_TTL_MS` (24 hours, from US-126).
 */
export interface ActivityOutputCacheUpsertInput extends ActivityOutputCacheKey {
  outputCtx: Prisma.InputJsonValue;
  outputKind?: string | null;
  ttlMs?: number;
}

/**
 * Prisma-backed repository for the `ActivityOutputCache` table.
 *
 * Exposes three operations:
 *   - `findFresh`: unique-key lookup filtered to `expiresAt > now()` so TTL-
 *     expired rows are invisible to consumers even before GC sweeps them.
 *   - `upsert`: insert-or-overwrite on the unique key; on overwrite, mutable
 *     payload columns (`outputCtx`, `outputKind`, `expiresAt`) are refreshed.
 *   - `deleteExpired`: GC helper that removes all rows whose `expiresAt`
 *     is in the past. Uses the `(expiresAt)` index from US-126.
 *
 * The worker decorator (US-132) and the preview-cache endpoint (US-140)
 * are the primary consumers. See
 * `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.2 + §2.6.
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
   * `expiresAt` is computed as `now + (ttlMs ?? DEFAULT_CACHE_TTL_MS)`.
   */
  async upsert(
    input: ActivityOutputCacheUpsertInput,
  ): Promise<ActivityOutputCache> {
    const ttl = input.ttlMs ?? DEFAULT_CACHE_TTL_MS;
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
