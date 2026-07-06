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
    workflowLineage: { findUnique: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      workflowVersion: { findUnique: jest.fn(), findFirst: jest.fn() },
      workflowLineage: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("loads graph by WorkflowVersion id", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findUnique.mockResolvedValue({
      id: "wv-1",
      config: cfg,
    });

    const result = await getWorkflowGraphConfig({ workflowId: "wv-1" });

    expect(result.graph).toEqual(cfg);
    expect(result.workflowVersionId).toBe("wv-1");
    expect(result.configHash).toBe(computeConfigHash(cfg));
    expect(prismaMock.workflowVersion.findUnique).toHaveBeenCalledWith({
      where: { id: "wv-1" },
      select: { id: true, config: true },
    });
    expect(prismaMock.workflowLineage.findUnique).not.toHaveBeenCalled();
  });

  it("loads graph by WorkflowLineage id using head version", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findUnique.mockResolvedValue({
      id: "lin-1",
      headVersion: { id: "wv-head", config: cfg },
    });

    const result = await getWorkflowGraphConfig({ workflowId: "lin-1" });

    expect(result.graph).toEqual(cfg);
    expect(result.workflowVersionId).toBe("wv-head");
    expect(prismaMock.workflowLineage.findUnique).toHaveBeenCalledWith({
      where: { id: "lin-1" },
      include: { headVersion: true },
    });
  });

  it("loads graph by lineage name when id lookup misses", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst.mockResolvedValue({
      id: "lin-1",
      headVersion: { id: "wv-head", config: cfg },
    });

    const result = await getWorkflowGraphConfig({
      workflowId: "standard-ocr-workflow",
    });

    expect(result.graph).toEqual(cfg);
    expect(prismaMock.workflowLineage.findFirst).toHaveBeenCalledWith({
      where: { name: "standard-ocr-workflow" },
      include: { headVersion: true },
    });
  });

  it("applies workflowConfigOverrides before hashing", async () => {
    const cfg = sampleConfig();
    cfg.ctx = {
      modelId: { type: "string", defaultValue: "prebuilt-layout" },
    };
    prismaMock.workflowVersion.findUnique.mockResolvedValue({
      id: "wv-1",
      config: cfg,
    });

    const result = await getWorkflowGraphConfig({
      workflowId: "wv-1",
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
    prismaMock.workflowVersion.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

    await expect(
      getWorkflowGraphConfig({ workflowId: "missing" }),
    ).rejects.toThrow("Workflow not found by ID or name: missing");
  });

  // US-080: version-pinned resolution
  describe("with `version` param", () => {
    it("resolves a lineage-id ref then loads by (lineage_id, version_number) compound key", async () => {
      const cfg = sampleConfig();
      // The ref "lin-1" resolves as a lineage id.
      prismaMock.workflowLineage.findUnique.mockResolvedValue({ id: "lin-1" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue({
        id: "wv-pinned",
        config: cfg,
      });

      const result = await getWorkflowGraphConfig({
        workflowId: "lin-1",
        version: 3,
      });

      expect(result.graph).toEqual(cfg);
      expect(result.workflowVersionId).toBe("wv-pinned");
      expect(prismaMock.workflowLineage.findUnique).toHaveBeenCalledWith({
        where: { id: "lin-1" },
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
      expect(prismaMock.workflowLineage.findFirst).not.toHaveBeenCalled();
    });

    it("§3.5 — resolves a NAME-referenced child before pinning (no longer throws once a version pin is added)", async () => {
      const cfg = sampleConfig();
      // The ref is a lineage NAME: id lookup misses, name lookup resolves.
      prismaMock.workflowLineage.findUnique.mockResolvedValue(null);
      prismaMock.workflowLineage.findFirst.mockResolvedValue({ id: "lin-x" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue({
        id: "wv-pinned-2",
        config: cfg,
      });

      const result = await getWorkflowGraphConfig({
        workflowId: "standard-ocr-workflow",
        version: 2,
      });

      expect(result.workflowVersionId).toBe("wv-pinned-2");
      expect(prismaMock.workflowLineage.findFirst).toHaveBeenCalledWith({
        where: { name: "standard-ocr-workflow" },
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
      prismaMock.workflowLineage.findUnique.mockResolvedValue({ id: "lin-1" });
      prismaMock.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        getWorkflowGraphConfig({ workflowId: "lin-1", version: 99 }),
      ).rejects.toThrow("Library lineage lin-1 has no version 99");
      // Does NOT fall through to the head/name resolution paths.
      expect(prismaMock.workflowVersion.findFirst).not.toHaveBeenCalled();
    });

    it("throws when the pinned ref resolves to no lineage at all", async () => {
      prismaMock.workflowLineage.findUnique.mockResolvedValue(null);
      prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

      await expect(
        getWorkflowGraphConfig({ workflowId: "ghost", version: 1 }),
      ).rejects.toThrow("Library lineage not found: ghost");
    });
  });
});
