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

interface LineageRow {
  id: string;
  deletedAt: Date | null;
  headVersionId: string | null;
}

interface VersionRow {
  id: string;
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

  it("soft-deleted lineage → DynamicNodeDeletedError", async () => {
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
  it("head version: returns headVersionId from lineage", async () => {
    const prisma = mkPrisma({
      id: "ck1",
      deletedAt: null,
      headVersionId: "v-head",
    });
    const result = await dynamicNodeResolveLineage(
      { groupId: "g1", slug: "x" },
      { prisma },
    );
    expect(result).toEqual({ versionId: "v-head" });
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

  it("pinned version: SELECTs (dynamicNodeId, versionNumber) and returns id", async () => {
    const prisma = mkPrisma(
      { id: "ck1", deletedAt: null, headVersionId: "v-head" },
      { id: "v3" },
    );
    const result = await dynamicNodeResolveLineage(
      { groupId: "g1", slug: "x", version: 3 },
      { prisma },
    );
    expect(result).toEqual({ versionId: "v3" });
    expect(prisma.dynamicNodeVersion.findUnique).toHaveBeenCalledWith({
      where: {
        dynamicNodeId_versionNumber: {
          dynamicNodeId: "ck1",
          versionNumber: 3,
        },
      },
      select: { id: true },
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
