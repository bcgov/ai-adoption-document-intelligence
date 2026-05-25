import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import {
  type DynamicNode,
  type DynamicNodeVersion,
  Prisma,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import {
  DuplicateSlugError,
  DynamicNodeDeletedError,
  DynamicNodeNotFoundError,
} from "./dynamic-node.errors";

/**
 * Input for `createWithFirstVersion`. Pre-validated by the service layer
 * (`DynamicNodesService.publish`) — the repo trusts its caller for
 * shape/semantics and only worries about persistence.
 */
export interface CreateWithFirstVersionInput {
  groupId: string;
  slug: string;
  description?: string;
  script: string;
  signature: DynamicNodeSignature;
  allowNet: string[];
  deterministic: boolean;
  ownerUserId?: string;
}

/**
 * Input for `publishNewVersion`. Lineage is looked up by `(groupId, slug)`;
 * the new version's `versionNumber` is `currentMax + 1`.
 */
export interface PublishNewVersionInput {
  groupId: string;
  slug: string;
  description?: string;
  script: string;
  signature: DynamicNodeSignature;
  allowNet: string[];
  deterministic: boolean;
  publishedByUserId?: string;
}

/**
 * Result shape returned by `createWithFirstVersion` + `publishNewVersion`.
 * Carries the updated lineage row + the new head version row so the service
 * can return the version number in the response without an extra fetch.
 */
export interface DynamicNodeWithHead {
  dynamicNode: DynamicNode;
  headVersion: DynamicNodeVersion;
}

/**
 * Per-call options for `listForGroup`. Defaults match the public-facing
 * `GET /api/dynamic-nodes` semantics (exclude soft-deleted).
 */
export interface ListForGroupOptions {
  /** When `true`, include lineages whose `deletedAt` is set. Defaults to `false`. */
  includeDeleted?: boolean;
}

/**
 * Prisma-backed repository for the Phase 6 dynamic-node lineage/version
 * pair (US-162 schema). The service layer (`DynamicNodesService`, US-164)
 * is the sole caller in 6.0; the executor (US-171 / Phase 6 Milestone C)
 * adds a read-side caller for `findBySlugForGroup` + `findVersion`.
 *
 * Group-scoped throughout — every method takes `groupId` and never queries
 * by raw `(slug, id)` to avoid leaking cross-group rows.
 *
 * Error contract: `DuplicateSlugError`, `DynamicNodeNotFoundError`, and
 * `DynamicNodeDeletedError` are thrown for the documented failure modes; the
 * service maps each to the appropriate HTTP exception. All other Prisma
 * errors propagate unchanged.
 *
 * See feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md
 * §3.3 L22 + DYNAMIC_NODES_DESIGN.md §3 for the persistence contract.
 */
@Injectable()
export class DynamicNodeRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Atomically create a new lineage + v1 version + set head pointer.
   *
   * Wrapped in a single `$transaction` so the lineage row, its v1
   * version row, and the `headVersionId` pointer either all land or
   * none do. The lineage's `(groupId, slug)` unique constraint
   * surfaces as `DuplicateSlugError` when violated (Prisma `P2002`).
   */
  async createWithFirstVersion(
    input: CreateWithFirstVersionInput,
  ): Promise<DynamicNodeWithHead> {
    try {
      return await this.prismaService.transaction(async (tx) => {
        const dynamicNode = await tx.dynamicNode.create({
          data: {
            groupId: input.groupId,
            slug: input.slug,
            description: input.description,
            ownerUserId: input.ownerUserId,
          },
        });

        const headVersion = await tx.dynamicNodeVersion.create({
          data: {
            dynamicNodeId: dynamicNode.id,
            versionNumber: 1,
            script: input.script,
            signature: input.signature as unknown as Prisma.InputJsonValue,
            allowNet: input.allowNet,
            deterministic: input.deterministic,
            publishedByUserId: input.ownerUserId,
          },
        });

        const updatedNode = await tx.dynamicNode.update({
          where: { id: dynamicNode.id },
          data: { headVersionId: headVersion.id },
        });

        return { dynamicNode: updatedNode, headVersion };
      });
    } catch (err) {
      if (isPrismaKnownError(err) && err.code === "P2002") {
        throw new DuplicateSlugError(input.slug);
      }
      throw err;
    }
  }

  /**
   * Atomically append a new version to an existing lineage + move the
   * head pointer.
   *
   * Reads the current max `versionNumber` for the lineage inside the
   * transaction to compute `versionNumber + 1`; concurrent publishes
   * may race here (the second's commit fails the `(dynamicNodeId,
   * versionNumber)` unique constraint and surfaces as a generic Prisma
   * error for the service to surface to the caller via 500/retry).
   *
   * Throws `DynamicNodeNotFoundError` when the lineage does not exist
   * for the group; `DynamicNodeDeletedError` when it exists but is
   * soft-deleted.
   */
  async publishNewVersion(
    input: PublishNewVersionInput,
  ): Promise<DynamicNodeWithHead> {
    return this.prismaService.transaction(async (tx) => {
      const lineage = await tx.dynamicNode.findUnique({
        where: {
          groupId_slug: { groupId: input.groupId, slug: input.slug },
        },
      });
      if (lineage === null) {
        throw new DynamicNodeNotFoundError(input.slug);
      }
      if (lineage.deletedAt !== null) {
        throw new DynamicNodeDeletedError(input.slug);
      }

      const maxVersion = await tx.dynamicNodeVersion.findFirst({
        where: { dynamicNodeId: lineage.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

      const headVersion = await tx.dynamicNodeVersion.create({
        data: {
          dynamicNodeId: lineage.id,
          versionNumber: nextVersionNumber,
          script: input.script,
          signature: input.signature as unknown as Prisma.InputJsonValue,
          allowNet: input.allowNet,
          deterministic: input.deterministic,
          publishedByUserId: input.publishedByUserId,
        },
      });

      const updatedLineage = await tx.dynamicNode.update({
        where: { id: lineage.id },
        data: {
          headVersionId: headVersion.id,
          description: input.description ?? lineage.description,
        },
      });

      return { dynamicNode: updatedLineage, headVersion };
    });
  }

  /**
   * Look up a lineage by `(groupId, slug)`. Returns `null` when the
   * lineage does not exist OR is soft-deleted (the public visibility
   * boundary the controllers/service rely on for 404s).
   *
   * The returned shape includes the head version row + all versions
   * sorted newest-first so the detail endpoint (US-167) and the
   * executor (Phase 6 Milestone C) can read everything in one call.
   */
  async findBySlugForGroup(
    groupId: string,
    slug: string,
  ): Promise<
    | (DynamicNode & {
        headVersion: DynamicNodeVersion | null;
        versions: DynamicNodeVersion[];
      })
    | null
  > {
    const lineage = await this.prismaService.prisma.dynamicNode.findUnique({
      where: { groupId_slug: { groupId, slug } },
      include: {
        headVersion: true,
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    if (lineage === null || lineage.deletedAt !== null) {
      return null;
    }
    return lineage;
  }

  /**
   * List a group's lineages. Excludes soft-deleted rows by default; pass
   * `{ includeDeleted: true }` for admin/debugging surfaces (NOT exposed
   * via the public API in 6.0).
   *
   * Each item includes its head version row for cheap rendering of the
   * list view (US-167); the per-lineage `versionCount` is a separate
   * cheap aggregate the service computes alongside.
   */
  async listForGroup(
    groupId: string,
    options: ListForGroupOptions = {},
  ): Promise<
    Array<
      DynamicNode & {
        headVersion: DynamicNodeVersion | null;
        _count: { versions: number };
      }
    >
  > {
    const includeDeleted = options.includeDeleted ?? false;
    return this.prismaService.prisma.dynamicNode.findMany({
      where: {
        groupId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        headVersion: true,
        _count: { select: { versions: true } },
      },
      orderBy: { slug: "asc" },
    });
  }

  /**
   * Idempotent soft-delete. Sets `deletedAt = now()` on the lineage and
   * returns the updated row.
   *
   * Calling on an already-deleted lineage returns the row unchanged
   * (its existing `deletedAt` is preserved). Calling on an unknown slug
   * throws `DynamicNodeNotFoundError`.
   *
   * Per Phase 6.0 design, deletion is lineage-only — version rows are
   * kept so workflows pinned to a specific version of a soft-deleted
   * lineage continue to resolve at runtime.
   */
  async softDelete(groupId: string, slug: string): Promise<DynamicNode> {
    const lineage = await this.prismaService.prisma.dynamicNode.findUnique({
      where: { groupId_slug: { groupId, slug } },
    });
    if (lineage === null) {
      throw new DynamicNodeNotFoundError(slug);
    }
    if (lineage.deletedAt !== null) {
      return lineage;
    }
    return this.prismaService.prisma.dynamicNode.update({
      where: { id: lineage.id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Fetch a specific `DynamicNodeVersion` row by `(dynamicNodeId,
   * versionNumber)`. Used by the Phase 6 US-174 validator wrapper to
   * resolve version-pinned `dyn.<slug>` references at workflow save
   * time without paging the whole version history.
   *
   * Returns `null` when no row matches; the caller treats that as
   * "version pin unresolved" and falls back to head's signature for
   * validation purposes.
   */
  async findVersionByNumber(
    dynamicNodeId: string,
    versionNumber: number,
  ): Promise<DynamicNodeVersion | null> {
    return this.prismaService.prisma.dynamicNodeVersion.findUnique({
      where: {
        dynamicNodeId_versionNumber: {
          dynamicNodeId,
          versionNumber,
        },
      },
    });
  }

  /**
   * Cheap aggregate: number of workflows referencing this slug via a
   * `dyn.<slug>` activity type. Implemented as a simple `LIKE` against
   * the JSON-stringified `workflow_versions.config` column per L25.
   *
   * Used by both the list endpoint (`usedInWorkflowCount` per item) and
   * the delete endpoint (`usedInWorkflowCount` returned alongside
   * `deletedAt` for the frontend's confirm-modal).
   *
   * Counts DISTINCT workflow lineages — a workflow with multiple versions
   * that all reference the slug counts as 1.
   */
  async countWorkflowsReferencingSlug(
    groupId: string,
    slug: string,
  ): Promise<number> {
    const needle = `%"dyn.${slug}"%`;
    const rows = await this.prismaService.prisma.$queryRaw<
      Array<{ count: bigint }>
    >(
      Prisma.sql`
        SELECT COUNT(DISTINCT wl.id)::bigint AS count
          FROM "workflow_lineages" wl
          JOIN "workflow_versions" wv ON wv."lineage_id" = wl.id
         WHERE wl.group_id = ${groupId}
           AND wv.config::text LIKE ${needle}
      `,
    );
    const first = rows[0];
    if (first === undefined) {
      return 0;
    }
    return Number(first.count);
  }
}

/**
 * Narrow `unknown` to `PrismaClientKnownRequestError` by structural shape so
 * we don't need to import the runtime class (it lives behind Prisma's
 * `runtime` subpath which is awkward to import across both runtime targets).
 */
function isPrismaKnownError(
  err: unknown,
): err is { code: string; meta?: unknown } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  );
}
