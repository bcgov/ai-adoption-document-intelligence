/**
 * US-080: childWorkflow node executor honors `workflowRef.library.version`.
 *
 * Covers Scenarios 1–3:
 *   1. version set        → activity called with { workflowId, version }
 *   2. version undefined  → activity called with { workflowId, version: undefined }
 *                           (today's behaviour — resolver falls through to head)
 *   3. version missing    → activity error surfaces and the child is NOT started
 */

const mockGetWorkflowGraphConfig = jest.fn();
const mockExecuteChild = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  ApplicationFailure: {
    create: jest.fn(
      (opts: { message: string; type: string; nonRetryable?: boolean }) => {
        const err = new Error(opts.message);
        Object.assign(err, {
          type: opts.type,
          nonRetryable: opts.nonRetryable,
        });
        return err;
      },
    ),
  },
  proxyActivities: jest.fn(() => ({
    getWorkflowGraphConfig: mockGetWorkflowGraphConfig,
  })),
  condition: jest.fn(),
  defineSignal: jest.fn(() => "mock-signal"),
  executeChild: mockExecuteChild,
  setHandler: jest.fn(),
  sleep: jest.fn(),
  workflowInfo: jest.fn(() => ({ workflowId: "parent-wf-id" })),
}));

jest.mock("../expression-evaluator", () => ({
  evaluateCondition: jest.fn(),
}));

import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { executeNode } from "./node-executors";

function makeState(
  opts: { ctx?: Record<string, unknown>; groupId?: string | null } = {},
): ExecutionState {
  return {
    currentNodes: [],
    completedNodeIds: new Set(),
    nodeStatuses: new Map(),
    nodeRunStatuses: {},
    cancelled: () => false,
    cancelMode: () => "graceful" as const,
    ctx: { ...(opts.ctx ?? {}) },
    selectedEdges: new Map(),
    mapBranchResults: new Map(),
    configHash: "test-hash",
    runnerVersion: "1.0.0",
    requestId: undefined,
    groupId: opts.groupId,
    lastError: {},
  };
}

const parentGraphConfig = {
  schemaVersion: "1.0",
  metadata: {},
  nodes: {},
  edges: [],
  entryNodeId: "test-node",
  ctx: {},
};

function makeLibraryChildNode(opts: {
  workflowId: string;
  version?: number;
}): ChildWorkflowNode {
  return {
    id: "child-node",
    type: "childWorkflow",
    label: "Child",
    workflowRef: {
      type: "library",
      workflowId: opts.workflowId,
      ...(opts.version !== undefined ? { version: opts.version } : {}),
    },
  };
}

function v3Config(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "library-v3" },
    nodes: {
      noop: { id: "noop", type: "activity", label: "noop", activityType: "x" },
    },
    edges: [],
    entryNodeId: "noop",
    ctx: {},
  };
}

describe("executeChildWorkflowNode — US-080 library version pinning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteChild.mockResolvedValue({
      ctx: {},
      completedNodes: [],
      status: "completed",
    });
  });

  it("Scenario 1: forwards `version` to getWorkflowGraphConfig when pinned", async () => {
    const cfg = v3Config();
    mockGetWorkflowGraphConfig.mockResolvedValue({
      graph: cfg,
      workflowVersionId: "wv-v3",
      configHash: "hash-v3",
    });

    const node = makeLibraryChildNode({
      workflowId: "lineage-abc",
      version: 3,
    });

    await executeNode(node, parentGraphConfig as never, makeState());

    expect(mockGetWorkflowGraphConfig).toHaveBeenCalledTimes(1);
    expect(mockGetWorkflowGraphConfig).toHaveBeenCalledWith({
      workflowId: "lineage-abc",
      version: 3,
      // G-019: the calling node id rides along so a missing library child
      // fails with the offending step named.
      parentNodeId: "child-node",
    });

    // The resolved (pinned) version id + hash are handed to the child runner,
    // which loads the config itself by reference.
    expect(mockExecuteChild).toHaveBeenCalledWith(
      "graphWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            workflowVersionId: "wv-v3",
            configHash: "hash-v3",
          }),
        ],
      }),
    );
  });

  it("Scenario 2: passes `version: undefined` (head-resolution) when not pinned", async () => {
    const cfg = v3Config();
    mockGetWorkflowGraphConfig.mockResolvedValue({
      graph: cfg,
      workflowVersionId: "wv-head",
      configHash: "hash-head",
    });

    const node = makeLibraryChildNode({ workflowId: "lineage-abc" });

    await executeNode(node, parentGraphConfig as never, makeState());

    expect(mockGetWorkflowGraphConfig).toHaveBeenCalledTimes(1);
    expect(mockGetWorkflowGraphConfig).toHaveBeenCalledWith({
      workflowId: "lineage-abc",
      version: undefined,
      parentNodeId: "child-node",
    });
  });

  it("Scenario 3: propagates the activity error and does NOT start the child", async () => {
    mockGetWorkflowGraphConfig.mockRejectedValue(
      new Error("Library lineage lineage-abc has no version 99"),
    );

    const node = makeLibraryChildNode({
      workflowId: "lineage-abc",
      version: 99,
    });

    await expect(
      executeNode(node, parentGraphConfig as never, makeState()),
    ).rejects.toThrow("Library lineage lineage-abc has no version 99");

    expect(mockExecuteChild).not.toHaveBeenCalled();
  });
});
