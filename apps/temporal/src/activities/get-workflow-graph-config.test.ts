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
    it("loads graph by (lineage_id, version_number) compound unique key when version is provided", async () => {
      const cfg = sampleConfig();
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
      // Pinned lookup short-circuits the legacy 3-step resolution.
      expect(prismaMock.workflowLineage.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.workflowLineage.findFirst).not.toHaveBeenCalled();
    });

    it("throws a clear error mentioning lineage + version when the pinned version does not exist", async () => {
      prismaMock.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(
        getWorkflowGraphConfig({ workflowId: "lin-1", version: 99 }),
      ).rejects.toThrow("Library lineage lin-1 has no version 99");
      // Does NOT fall through to the head/name resolution paths.
      expect(prismaMock.workflowVersion.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.workflowLineage.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.workflowLineage.findFirst).not.toHaveBeenCalled();
    });
  });
});
