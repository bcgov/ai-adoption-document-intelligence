import { ApplicationFailure } from "@temporalio/activity";
import { computeConfigHash } from "../config-hash";
import type { GraphWorkflowConfig } from "../graph-workflow-types";
import { getPrismaClient } from "./database-client";
import { getWorkflowGraphConfig } from "./get-workflow-graph-config";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const sampleConfig = (): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: { name: "Test Workflow" },
  nodes: {
    node1: {
      id: "node1",
      type: "activity",
      label: "Start",
      activityType: "testActivity",
    },
  },
  edges: [],
  entryNodeId: "node1",
  ctx: {},
});

describe("getWorkflowGraphConfig activity", () => {
  let prismaMock: {
    workflowVersion: { findUnique: jest.Mock; findFirst: jest.Mock };
    workflowLineage: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      workflowVersion: { findUnique: jest.fn(), findFirst: jest.fn() },
      workflowLineage: { findFirst: jest.fn() },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("loads graph by WorkflowVersion id within the group", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findFirst.mockResolvedValue({
      id: "wv-1",
      config: cfg,
    });

    const result = await getWorkflowGraphConfig({
      workflowId: "wv-1",
      groupId: "group-1",
    });

    expect(result.graph).toEqual(cfg);
    expect(result.workflowVersionId).toBe("wv-1");
    expect(result.configHash).toBe(computeConfigHash(cfg));
    expect(prismaMock.workflowVersion.findFirst).toHaveBeenCalledWith({
      where: { id: "wv-1", lineage: { group_id: "group-1" } },
      select: { id: true, config: true },
    });
    expect(prismaMock.workflowLineage.findFirst).not.toHaveBeenCalled();
  });

  it("loads graph by WorkflowLineage id within the group using head version", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findFirst.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst.mockResolvedValueOnce({
      id: "lin-1",
      headVersion: { id: "wv-head", config: cfg },
    });

    const result = await getWorkflowGraphConfig({
      workflowId: "lin-1",
      groupId: "group-1",
    });

    expect(result.graph).toEqual(cfg);
    expect(result.workflowVersionId).toBe("wv-head");
    expect(prismaMock.workflowLineage.findFirst).toHaveBeenCalledWith({
      where: { id: "lin-1", group_id: "group-1" },
      include: { headVersion: true },
    });
  });

  it("loads graph by lineage name within the group when id lookup misses", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findFirst.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "lin-1",
        headVersion: { id: "wv-head", config: cfg },
      });

    const result = await getWorkflowGraphConfig({
      workflowId: "standard-ocr-workflow",
      groupId: "group-1",
    });

    expect(result.graph).toEqual(cfg);
    expect(prismaMock.workflowLineage.findFirst).toHaveBeenLastCalledWith({
      where: { name: "standard-ocr-workflow", group_id: "group-1" },
      include: { headVersion: true },
    });
  });

  it("refuses to look up a workflow without a groupId", async () => {
    await expect(
      getWorkflowGraphConfig({ workflowId: "wv-1", groupId: null }),
    ).rejects.toThrow("groupId is required");
    expect(prismaMock.workflowVersion.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.workflowLineage.findFirst).not.toHaveBeenCalled();
  });

  it("applies workflowConfigOverrides before hashing", async () => {
    const cfg = sampleConfig();
    cfg.ctx = {
      modelId: { type: "string", defaultValue: "prebuilt-layout" },
    };
    prismaMock.workflowVersion.findFirst.mockResolvedValue({
      id: "wv-1",
      config: cfg,
    });

    const result = await getWorkflowGraphConfig({
      workflowId: "wv-1",
      groupId: "group-1",
      workflowConfigOverrides: {
        "ctx.modelId.defaultValue": "prebuilt-read",
      },
    });

    expect(
      (result.graph.ctx.modelId as { defaultValue?: string }).defaultValue,
    ).toBe("prebuilt-read");
    expect(result.configHash).not.toBe(computeConfigHash(cfg));
    expect(result.configHash).toBe(
      computeConfigHash({
        ...cfg,
        ctx: {
          modelId: { type: "string", defaultValue: "prebuilt-read" },
        },
      }),
    );
  });

  it("throws when not found", async () => {
    prismaMock.workflowVersion.findFirst.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

    await expect(
      getWorkflowGraphConfig({ workflowId: "missing", groupId: "group-1" }),
    ).rejects.toThrow("Workflow not found by ID or name: missing");
  });

  // ---------------------------------------------------------------------------
  // G-019 — a library child that no longer exists can never resolve, so it must
  // fail on the first attempt instead of burning the childWorkflow node's whole
  // retry budget.
  // ---------------------------------------------------------------------------
  describe("G-019 — missing library child fails fast", () => {
    it("fails fast and non-retryably when a library child no longer exists", async () => {
      prismaMock.workflowVersion.findFirst.mockResolvedValue(null);
      prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

      const error = await getWorkflowGraphConfig({
        workflowId: "lin-deleted",
        groupId: "group-1",
        parentNodeId: "call-library-1",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApplicationFailure);
      const failure = error as ApplicationFailure;
      expect(failure.nonRetryable).toBe(true);
      expect(failure.type).toBe("LIBRARY_WORKFLOW_NOT_FOUND");
      // Names the missing workflow AND the parent node.
      expect(failure.message).toContain("lin-deleted");
      expect(failure.message).toContain("call-library-1");
    });

    it("fails fast and non-retryably when the pinned version is gone", async () => {
      prismaMock.workflowLineage.findFirst.mockResolvedValue({ id: "lin-1" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue(null);

      const error = await getWorkflowGraphConfig({
        workflowId: "lin-1",
        groupId: "group-1",
        version: 99,
        parentNodeId: "call-library-2",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApplicationFailure);
      const failure = error as ApplicationFailure;
      expect(failure.nonRetryable).toBe(true);
      expect(failure.message).toContain("has no version 99");
      expect(failure.message).toContain("call-library-2");
    });

    it("fails fast and non-retryably when a pinned ref resolves to no lineage", async () => {
      prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

      const error = await getWorkflowGraphConfig({
        workflowId: "ghost",
        groupId: "group-1",
        version: 1,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApplicationFailure);
      const failure = error as ApplicationFailure;
      expect(failure.nonRetryable).toBe(true);
      // No parentNodeId supplied — the message stays clean rather than
      // interpolating "undefined".
      expect(failure.message).toBe("Library lineage not found: ghost");
    });
  });

  // US-080: version-pinned resolution
  describe("with `version` param", () => {
    it("resolves a lineage-id ref within the group then loads by (lineage_id, version_number) compound key", async () => {
      const cfg = sampleConfig();
      // The ref "lin-1" resolves as a lineage id.
      prismaMock.workflowLineage.findFirst.mockResolvedValueOnce({ id: "lin-1" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue({
        id: "wv-pinned",
        config: cfg,
      });

      const result = await getWorkflowGraphConfig({
        workflowId: "lin-1",
        groupId: "group-1",
        version: 3,
      });

      expect(result.graph).toEqual(cfg);
      expect(result.workflowVersionId).toBe("wv-pinned");
      expect(prismaMock.workflowLineage.findFirst).toHaveBeenCalledWith({
        where: { id: "lin-1", group_id: "group-1" },
        select: { id: true },
      });
      // Item 34: the (lineage_id, version_number) pair is `@@unique`, so the
      // pinned lookup uses `findUnique` on the compound key — not `findFirst`.
      expect(prismaMock.workflowVersion.findUnique).toHaveBeenCalledWith({
        where: {
          lineage_id_version_number: {
            lineage_id: "lin-1",
            version_number: 3,
          },
        },
        select: { id: true, config: true },
      });
      expect(prismaMock.workflowVersion.findFirst).not.toHaveBeenCalled();
      // Resolved by id, so the name fallback isn't consulted.
      expect(prismaMock.workflowLineage.findFirst).toHaveBeenCalledTimes(1);
    });

    it("§3.5 — resolves a NAME-referenced child within the group before pinning", async () => {
      const cfg = sampleConfig();
      // The ref is a lineage NAME: id lookup misses, name lookup resolves.
      prismaMock.workflowLineage.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "lin-x" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue({
        id: "wv-pinned-2",
        config: cfg,
      });

      const result = await getWorkflowGraphConfig({
        workflowId: "standard-ocr-workflow",
        groupId: "group-1",
        version: 2,
      });

      expect(result.workflowVersionId).toBe("wv-pinned-2");
      expect(prismaMock.workflowLineage.findFirst).toHaveBeenLastCalledWith({
        where: { name: "standard-ocr-workflow", group_id: "group-1" },
        select: { id: true },
      });
      // Pins against the RESOLVED lineage id, not the raw name ref.
      expect(prismaMock.workflowVersion.findUnique).toHaveBeenCalledWith({
        where: {
          lineage_id_version_number: {
            lineage_id: "lin-x",
            version_number: 2,
          },
        },
        select: { id: true, config: true },
      });
    });

    it("throws a clear error mentioning lineage + version when the pinned version does not exist", async () => {
      prismaMock.workflowLineage.findFirst.mockResolvedValue({ id: "lin-1" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        getWorkflowGraphConfig({
          workflowId: "lin-1",
          groupId: "group-1",
          version: 99,
        }),
      ).rejects.toThrow("Library lineage lin-1 has no version 99");
      // Does NOT fall through to the head/name resolution paths.
      expect(prismaMock.workflowVersion.findFirst).not.toHaveBeenCalled();
    });

    it("does not resolve a pinned ref that belongs to another group", async () => {
      // Both group-scoped lineage lookups miss, as they do for another
      // group's lineage id or name.
      prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

      await expect(
        getWorkflowGraphConfig({
          workflowId: "other-groups-lineage",
          groupId: "group-1",
          version: 1,
        }),
      ).rejects.toThrow("Library lineage not found: other-groups-lineage");
      expect(prismaMock.workflowVersion.findUnique).not.toHaveBeenCalled();
    });
  });
});
