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
    workflowVersion: { findUnique: jest.Mock };
    workflowLineage: { findUnique: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      workflowVersion: { findUnique: jest.fn() },
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
    expect(prismaMock.workflowVersion.findUnique).toHaveBeenCalledWith({
      where: { id: "wv-1" },
      select: { config: true },
    });
    expect(prismaMock.workflowLineage.findUnique).not.toHaveBeenCalled();
  });

  it("loads graph by WorkflowLineage id using head version", async () => {
    const cfg = sampleConfig();
    prismaMock.workflowVersion.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findUnique.mockResolvedValue({
      id: "lin-1",
      headVersion: { config: cfg },
    });

    const result = await getWorkflowGraphConfig({ workflowId: "lin-1" });

    expect(result.graph).toEqual(cfg);
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
      headVersion: { config: cfg },
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

  it("throws when not found", async () => {
    prismaMock.workflowVersion.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findUnique.mockResolvedValue(null);
    prismaMock.workflowLineage.findFirst.mockResolvedValue(null);

    await expect(
      getWorkflowGraphConfig({ workflowId: "missing" }),
    ).rejects.toThrow("Workflow not found by ID or name: missing");
  });
});
