/**
 * Phase 6 Milestone C (US-171) — `dynamicNode.resolveLineage` activity.
 *
 * Translates a workflow node's `(groupId, slug, version?)` into the
 * immutable `versionId` that `dyn.run` (US-170) needs. The activity is
 * registered with `nonCacheable: true` because the lineage head pointer
 * can change between executions — caching the resolution would defeat
 * hot-reload.
 *
 * Per Temporal determinism, the workflow context cannot do Postgres I/O
 * directly. The graph executor proxies through this activity instead.
 *
 * Throws typed errors from US-168:
 *   - `DynamicNodeDeletedError`         — lineage missing OR soft-deleted
 *   - `DynamicNodeVersionNotFoundError` — pinned version doesn't exist
 *   - `DynamicNodeHeadMissingError`     — head pointer is null (shouldn't
 *                                          happen in 6.0 — guards against
 *                                          future per-version delete)
 */

import type { PrismaClient } from "@generated/client";
import { getPrismaClient } from "../activities/database-client";
import {
  DynamicNodeDeletedError,
  DynamicNodeHeadMissingError,
  DynamicNodeVersionNotFoundError,
} from "./errors";

export interface ResolveLineageInput {
  groupId: string;
  slug: string;
  /** Optional pinned version number (1-based). When omitted, returns the head. */
  version?: number;
}

export interface ResolveLineageOutput {
  versionId: string;
}

/**
 * DI seam for tests. Production callers omit; tests can stub the prisma
 * client to avoid a real DB.
 */
export interface ResolveLineageDeps {
  prisma?: PrismaClient;
}

export async function dynamicNodeResolveLineage(
  args: ResolveLineageInput,
  deps: ResolveLineageDeps = {},
): Promise<ResolveLineageOutput> {
  const prisma = deps.prisma ?? getPrismaClient();

  // (1) Look up the lineage by (groupId, slug).
  const lineage = await prisma.dynamicNode.findUnique({
    where: { groupId_slug: { groupId: args.groupId, slug: args.slug } },
    select: { id: true, deletedAt: true, headVersionId: true },
  });

  if (lineage === null || lineage.deletedAt !== null) {
    throw new DynamicNodeDeletedError(args.slug);
  }

  // (2) Pinned version: look up `(dynamicNodeId, versionNumber)`.
  if (args.version !== undefined) {
    const pinned = await prisma.dynamicNodeVersion.findUnique({
      where: {
        dynamicNodeId_versionNumber: {
          dynamicNodeId: lineage.id,
          versionNumber: args.version,
        },
      },
      select: { id: true },
    });
    if (pinned === null) {
      throw new DynamicNodeVersionNotFoundError(args.slug, args.version);
    }
    return { versionId: pinned.id };
  }

  // (3) Head version: take from the lineage row.
  if (lineage.headVersionId === null) {
    throw new DynamicNodeHeadMissingError(args.slug);
  }
  return { versionId: lineage.headVersionId };
}
