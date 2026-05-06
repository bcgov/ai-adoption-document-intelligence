/**
 * Integration test: groupId from GraphWorkflowInput must reach the activity.
 *
 * Regression guard for the bug where __workflowMetadata.groupId was set up in
 * graph-workflow.ts's local ctx but immediately clobbered by runGraphExecution
 * calling initializeContext (which rebuilds ctx from config defaults +
 * initialCtx). The unit tests in node-executors.metadata.test.ts only
 * exercised the executor in isolation, so they missed this. This test drives
 * runGraphExecution end-to-end and asserts the activity sees groupId.
 */

const mockActivityFn = jest.fn();

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
  proxyActivities: jest.fn(() => {
    return new Proxy(
      {},
      {
        get: () => mockActivityFn,
      },
    );
  }),
  condition: jest.fn(),
  defineSignal: jest.fn(() => "mock-signal"),
  executeChild: jest.fn(),
  setHandler: jest.fn(),
  sleep: jest.fn(),
  workflowInfo: jest.fn(() => ({ workflowId: "test-wf-id" })),
}));

import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { runGraphExecution } from "./graph-runner";

function makeFreshState(): ExecutionState {
  return {
    currentNodes: [],
    completedNodeIds: new Set(),
    nodeStatuses: new Map(),
    cancelled: () => false,
    cancelMode: () => "graceful" as const,
    ctx: {},
    selectedEdges: new Map(),
    mapBranchResults: new Map(),
    configHash: "test-hash",
    runnerVersion: "1.0.0",
    lastError: {},
  };
}

const minimalGraph: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "test", description: "" },
  entryNodeId: "lookup",
  ctx: {},
  nodes: {
    lookup: {
      id: "lookup",
      type: "activity",
      label: "Lookup",
      activityType: "tables.lookup",
      parameters: { tableId: "t1", lookupName: "byDate" },
    },
  },
  edges: [],
};

describe("runGraphExecution — groupId propagation from input to activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivityFn.mockResolvedValue({ result: null });
  });

  it("injects input.groupId into activity inputs", async () => {
    const input: GraphWorkflowInput = {
      graph: minimalGraph,
      initialCtx: {},
      configHash: "h",
      runnerVersion: "1.0.0",
      groupId: "trusted-group-from-caller",
    };

    await runGraphExecution(input, makeFreshState());

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "trusted-group-from-caller" }),
    );
  });

  it("does not inject groupId when input.groupId is null", async () => {
    const input: GraphWorkflowInput = {
      graph: minimalGraph,
      initialCtx: {},
      configHash: "h",
      runnerVersion: "1.0.0",
      groupId: null,
    };

    await runGraphExecution(input, makeFreshState());

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });

  it("does not inject groupId when input.groupId is omitted", async () => {
    const input: GraphWorkflowInput = {
      graph: minimalGraph,
      initialCtx: {},
      configHash: "h",
      runnerVersion: "1.0.0",
    };

    await runGraphExecution(input, makeFreshState());

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });

  it("input.groupId wins over an attempt to spoof via initialCtx.__workflowMetadata", async () => {
    // Even if a workflow author plants __workflowMetadata in ctx defaults or
    // initialCtx, only input.groupId (set server-side) reaches the activity.
    const input: GraphWorkflowInput = {
      graph: {
        ...minimalGraph,
        ctx: {
          __workflowMetadata: {
            type: "object",
            defaultValue: { groupId: "spoofed" },
          },
        },
      },
      initialCtx: {
        __workflowMetadata: { groupId: "also-spoofed" },
      },
      configHash: "h",
      runnerVersion: "1.0.0",
      groupId: "trusted-group",
    };

    await runGraphExecution(input, makeFreshState());

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "trusted-group" }),
    );
  });
});
