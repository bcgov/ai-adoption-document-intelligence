/**
 * Unit tests for the Phase 6 Milestone C (US-171)
 * `dynamicNode.resolveLineage` activity.
 *
 * The activity does at most two Postgres lookups. Tests stub prisma so they
 * verify the decision tree (deleted vs head vs pinned) without a real DB.
 */

import type { PrismaClient } from "@generated/client";
import { describe, expect, it, jest } from "@jest/globals";
import {
  DynamicNodeDeletedError,
  DynamicNodeHeadMissingError,
  DynamicNodeVersionNotFoundError,
} from "./errors";
import { dynamicNodeResolveLineage } from "./resolve-lineage.activity";
import { RESOLVE_LINEAGE_ACTIVITY_OPTIONS } from "./resolve-lineage.types";

interface LineageRow {
  id: string;
  deletedAt: Date | null;
  headVersionId: string | null;
}

interface VersionRow {
  id: string;
  deterministic: boolean;
}

function mkPrisma(
  lineage: LineageRow | null,
  version: VersionRow | null = null,
) {
  return {
    dynamicNode: {
      findUnique: jest
        .fn<() => Promise<LineageRow | null>>()
        .mockResolvedValue(lineage),
    },
    dynamicNodeVersion: {
      findUnique: jest
        .fn<() => Promise<VersionRow | null>>()
        .mockResolvedValue(version),
    },
  } as unknown as PrismaClient;
}

describe("dynamicNodeResolveLineage — Scenario 2: lineage lookup + deletion check", () => {
  it("missing lineage → DynamicNodeDeletedError", async () => {
    const prisma = mkPrisma(null);
    await expect(
      dynamicNodeResolveLineage({ groupId: "g1", slug: "missing" }, { prisma }),
    ).rejects.toBeInstanceOf(DynamicNodeDeletedError);
  });

  it("soft-deleted lineage, no pin → DynamicNodeDeletedError", async () => {
    const prisma = mkPrisma({
      id: "ck1",
      deletedAt: new Date(),
      headVersionId: "v1",
    });
    await expect(
      dynamicNodeResolveLineage({ groupId: "g1", slug: "x" }, { prisma }),
    ).rejects.toBeInstanceOf(DynamicNodeDeletedError);
  });
});

describe("dynamicNodeResolveLineage — Scenario 3: version resolution", () => {
  it("head version: resolves the head row and returns id + deterministic", async () => {
    const prisma = mkPrisma(
      {
        id: "ck1",
        deletedAt: null,
        headVersionId: "v-head",
      },
      { id: "v-head", deterministic: true },
    );
    const result = await dynamicNodeResolveLineage(
      { groupId: "g1", slug: "x" },
      { prisma },
    );
    expect(result).toEqual({ versionId: "v-head", deterministic: true });
  });

  it("head missing → DynamicNodeHeadMissingError", async () => {
    const prisma = mkPrisma({
      id: "ck1",
      deletedAt: null,
      headVersionId: null,
    });
    await expect(
      dynamicNodeResolveLineage({ groupId: "g1", slug: "x" }, { prisma }),
    ).rejects.toBeInstanceOf(DynamicNodeHeadMissingError);
  });

  it("pinned version: SELECTs (dynamicNodeId, versionNumber) and returns id + deterministic", async () => {
    const prisma = mkPrisma(
      { id: "ck1", deletedAt: null, headVersionId: "v-head" },
      { id: "v3", deterministic: false },
    );
    const result = await dynamicNodeResolveLineage(
      { groupId: "g1", slug: "x", version: 3 },
      { prisma },
    );
    // A pinned @deterministic:false version surfaces the flag so the executor
    // can bypass the cache (§3.3).
    expect(result).toEqual({ versionId: "v3", deterministic: false });
    expect(prisma.dynamicNodeVersion.findUnique).toHaveBeenCalledWith({
      where: {
        dynamicNodeId_versionNumber: {
          dynamicNodeId: "ck1",
          versionNumber: 3,
        },
      },
      select: { id: true, deterministic: true },
    });
  });

  it("pinned version not found → DynamicNodeVersionNotFoundError", async () => {
    const prisma = mkPrisma(
      { id: "ck1", deletedAt: null, headVersionId: "v-head" },
      null,
    );
    await expect(
      dynamicNodeResolveLineage(
        { groupId: "g1", slug: "x", version: 99 },
        { prisma },
      ),
    ).rejects.toBeInstanceOf(DynamicNodeVersionNotFoundError);
  });
});

/**
 * G-051 — `DynamicNodeRepository.softDelete` keeps every version row on
 * purpose, documenting that "workflows pinned to a specific version of a
 * soft-deleted lineage continue to resolve at runtime". This activity checked
 * `deletedAt` BEFORE ever looking at the pin, so that promise was never kept
 * and preserving the rows bought nothing.
 *
 * Soft-delete retires the lineage for anything tracking its head; a workflow
 * that deliberately pinned an immutable version keeps working.
 */
describe("dynamicNodeResolveLineage — G-051: soft-delete honours a pin", () => {
  const deletedLineage = {
    id: "ck1",
    deletedAt: new Date(),
    headVersionId: "v-head",
  };

  it("resolves a PINNED version even though the lineage is soft-deleted", async () => {
    const prisma = mkPrisma(deletedLineage, {
      id: "v-pinned",
      deterministic: true,
    });
    await expect(
      dynamicNodeResolveLineage(
        { groupId: "g1", slug: "retired", version: 2 },
        { prisma },
      ),
    ).resolves.toEqual({ versionId: "v-pinned", deterministic: true });
  });

  it("still refuses a HEAD-tracking consumer of a soft-deleted lineage", async () => {
    const prisma = mkPrisma(deletedLineage, {
      id: "v-head",
      deterministic: true,
    });
    await expect(
      dynamicNodeResolveLineage({ groupId: "g1", slug: "retired" }, { prisma }),
    ).rejects.toBeInstanceOf(DynamicNodeDeletedError);
  });

  it("still refuses a pin whose version row does not exist", async () => {
    // Soft-delete keeps existing rows; it does not conjure missing ones.
    const prisma = mkPrisma(deletedLineage, null);
    await expect(
      dynamicNodeResolveLineage(
        { groupId: "g1", slug: "retired", version: 99 },
        { prisma },
      ),
    ).rejects.toBeInstanceOf(DynamicNodeVersionNotFoundError);
  });

  it("still refuses a lineage that does not exist at all, pinned or not", async () => {
    const prisma = mkPrisma(null);
    await expect(
      dynamicNodeResolveLineage(
        { groupId: "g1", slug: "gone", version: 1 },
        { prisma },
      ),
    ).rejects.toBeInstanceOf(DynamicNodeDeletedError);
  });
});

describe("RESOLVE_LINEAGE_ACTIVITY_OPTIONS — retry classification (Change L)", () => {
  it("lists the permanent not-found/deleted resolutions as non-retryable — retrying a lookup does not resurrect a row", () => {
    expect(
      RESOLVE_LINEAGE_ACTIVITY_OPTIONS.retry?.nonRetryableErrorTypes,
    ).toEqual([
      "DynamicNodeDeletedError",
      "DynamicNodeVersionNotFoundError",
      "DynamicNodeHeadMissingError",
    ]);
    // Transient DB faults keep the short 3-attempt policy.
    expect(RESOLVE_LINEAGE_ACTIVITY_OPTIONS.retry?.maximumAttempts).toBe(3);
    expect(RESOLVE_LINEAGE_ACTIVITY_OPTIONS.nonCacheable).toBe(true);
  });
});
