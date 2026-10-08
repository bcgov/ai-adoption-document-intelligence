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
    workflowVersion: { findFirst: jest.Mock };
    workflowLineage: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      workflowVersion: { findFirst: jest.fn() },
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
});
