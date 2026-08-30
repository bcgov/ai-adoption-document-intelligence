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
 *   - `DynamicNodeDeletedError`         — lineage missing, or soft-deleted AND
 *                                          the caller did not pin a version
 *                                          (G-051: a pinned consumer of a
 *                                          soft-deleted lineage still resolves,
 *                                          which is what `softDelete` keeps the
 *                                          version rows for)
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
  /**
   * The resolved version's `@deterministic` flag. §3.3: the Phase 4 cache
   * decorator has no `dyn.*` catalog entry, so the executor consults this to
   * decide whether a dynamic node may be cached. A `@deterministic:false`
   * script (external API / randomness) must re-execute every run.
   */
  deterministic: boolean;
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

  if (lineage === null) {
    throw new DynamicNodeDeletedError(args.slug);
  }

  // G-051 — a soft-deleted lineage refuses only the FLOATING consumers.
  //
  // This check used to run before the pinned branch below, so the pin was
  // never consulted and a soft-delete broke every consumer. That directly
  // contradicted the contract `DynamicNodeRepository.softDelete` documents and
  // is built for: "deletion is lineage-only — version rows are kept so
  // workflows pinned to a specific version of a soft-deleted lineage continue
  // to resolve at runtime". Preserving those rows bought nothing at run time.
  //
  // Head-resolving consumers still fail, which is the point of the soft
  // delete: it retires the lineage for anything tracking its head, while a
  // workflow that deliberately pinned an immutable version keeps working.
  if (lineage.deletedAt !== null && args.version === undefined) {
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
      select: { id: true, deterministic: true },
    });
    if (pinned === null) {
      throw new DynamicNodeVersionNotFoundError(args.slug, args.version);
    }
    return { versionId: pinned.id, deterministic: pinned.deterministic };
  }

  // (3) Head version: resolve the head row so we can surface its
  // `deterministic` flag alongside the id.
  if (lineage.headVersionId === null) {
    throw new DynamicNodeHeadMissingError(args.slug);
  }
  const head = await prisma.dynamicNodeVersion.findUnique({
    where: { id: lineage.headVersionId },
    select: { id: true, deterministic: true },
  });
  if (head === null) {
    throw new DynamicNodeHeadMissingError(args.slug);
  }
  return { versionId: head.id, deterministic: head.deterministic };
}
