/**
 * Changes A+ and M — what BOTH `executeChild` sites hand their children.
 *
 * A+: the run `trigger` must reach every child workflow input. The child's
 * own cache gate (`graph-workflow.ts`) only wires `cacheDeps` for
 * `trigger === "try"`, so a child started without it silently loses Try
 * caching inside library children and >20-item map fan-outs — the §3.7
 * "cache semantics flip on collection size" bug reborn.
 *
 * M: `childDepth` must be incremented per spawn and spawning refused
 * beyond `MAX_CHILD_WORKFLOW_DEPTH`. The shared validator only rejects
 * INLINE self-embedding, so a cross-workflow cycle (A→B→A) validates
 * green; this runtime backstop is what cuts the chain off.
 */

const mockActivityFn = jest.fn();
const mockExecuteChild = jest.fn();
const mockProxyActivities = jest.fn(() => {
  return new Proxy(
    {},
    {
      get: () => mockActivityFn,
    },
  );
});

jest.mock("@temporalio/workflow", () => {
  // A real CLASS, not a bare `{ create }` object — the depth-limit tests
  // exercise a FAILURE path, and `extractErrorDetails` does
  // `error instanceof ApplicationFailure` on it (see the warning in
  // `node-executors.child-workflow-version.test.ts`).
  class MockApplicationFailure extends Error {
    type?: string;
    nonRetryable?: boolean;
    static create(opts: {
      message: string;
      type: string;
      nonRetryable?: boolean;
    }) {
      const err = new MockApplicationFailure(opts.message);
      err.type = opts.type;
      err.nonRetryable = opts.nonRetryable;
      return err;
    }
  }
  return {
    ApplicationFailure: MockApplicationFailure,
    proxyActivities: mockProxyActivities,
    condition: jest.fn(),
    defineSignal: jest.fn(() => "mock-signal"),
    executeChild: mockExecuteChild,
    setHandler: jest.fn(),
    sleep: jest.fn(),
    workflowInfo: jest.fn(() => ({ workflowId: "parent-wf-id" })),
  };
});

import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
  MapNode,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { executeNode, MAX_CHILD_WORKFLOW_DEPTH } from "./node-executors";

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    currentNodes: [],
    completedNodeIds: new Set(),
    nodeStatuses: new Map(),
    nodeRunStatuses: {},
    cancelled: () => false,
    cancelMode: () => "graceful" as const,
    ctx: {},
    selectedEdges: new Map(),
    mapBranchResults: new Map(),
    configHash: "test-hash",
    runnerVersion: "1.0.0",
    groupId: null,
    lastError: {},
    ...overrides,
  };
}

const emptyConfig = {
  schemaVersion: "1.0",
  metadata: {},
  nodes: {},
  edges: [],
  entryNodeId: "x",
  ctx: {},
} as unknown as GraphWorkflowConfig;

function makeLibraryChildNode(): ChildWorkflowNode {
  return {
    id: "child-node",
    type: "childWorkflow",
    label: "Child",
    workflowRef: { type: "library", workflowId: "lineage-abc" },
  };
}

/** A map over 21 items — past MAP_CHILD_WORKFLOW_THRESHOLD, so it spawns
 * child workflows when `state.workflowVersionId` is set. */
function makeFanoutMapNode(): MapNode {
  return {
    id: "MAP",
    type: "map",
    label: "Map",
    collectionCtxKey: "items",
    itemCtxKey: "currentItem",
    bodyEntryNodeId: "BODY",
    bodyExitNodeId: "BODY",
  };
}

function childArgs(callIndex = 0): Record<string, unknown> {
  return mockExecuteChild.mock.calls[callIndex][1].args[0] as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActivityFn.mockResolvedValue({
    workflowVersionId: "child-wv-1",
    configHash: "child-config-hash",
  });
  mockExecuteChild.mockResolvedValue({
    completedNodes: [],
    status: "completed",
    refs: {},
  });
});

describe("executeChildWorkflowNode — trigger + childDepth propagation (A+/M)", () => {
  it("hands the parent's trigger and depth+1 to the library child", async () => {
    const state = makeState({ trigger: "try", childDepth: 2 });

    await executeNode(makeLibraryChildNode(), emptyConfig, state);

    expect(mockExecuteChild).toHaveBeenCalledTimes(1);
    const args = childArgs();
    expect(args.trigger).toBe("try");
    expect(args.childDepth).toBe(3);
  });

  it("treats an absent depth as 0 (a run started from the API)", async () => {
    const state = makeState({ trigger: "api" });

    await executeNode(makeLibraryChildNode(), emptyConfig, state);

    const args = childArgs();
    expect(args.trigger).toBe("api");
    expect(args.childDepth).toBe(1);
  });

  it(`refuses to spawn past ${MAX_CHILD_WORKFLOW_DEPTH} levels — the cross-workflow cycle backstop`, async () => {
    const state = makeState({ childDepth: MAX_CHILD_WORKFLOW_DEPTH });

    await expect(
      executeNode(makeLibraryChildNode(), emptyConfig, state),
    ).rejects.toMatchObject({
      type: "CHILD_WORKFLOW_DEPTH_EXCEEDED",
      nonRetryable: true,
      message: expect.stringContaining(
        `over the limit of ${MAX_CHILD_WORKFLOW_DEPTH}`,
      ),
    });

    expect(mockExecuteChild).not.toHaveBeenCalled();
  });

  it("still spawns AT the limit (the fence is exclusive)", async () => {
    const state = makeState({ childDepth: MAX_CHILD_WORKFLOW_DEPTH - 1 });

    await executeNode(makeLibraryChildNode(), emptyConfig, state);

    expect(childArgs().childDepth).toBe(MAX_CHILD_WORKFLOW_DEPTH);
  });
});

describe("executeMapNode fan-out (>20 items) — trigger + childDepth propagation (A+/M)", () => {
  const items = Array.from({ length: 21 }, (_, i) => i);

  it("every fan-out child inherits the trigger and runs one level deeper", async () => {
    const state = makeState({
      ctx: { items },
      workflowVersionId: "wv-parent",
      trigger: "try",
      childDepth: 1,
      workflowLineageId: "wfl-1",
    });

    await executeNode(makeFanoutMapNode(), emptyConfig, state);

    expect(mockExecuteChild).toHaveBeenCalledTimes(21);
    for (let i = 0; i < 21; i++) {
      const args = childArgs(i);
      expect(args.trigger).toBe("try");
      // Siblings, not nesting — but each child RUNS one level deeper, so
      // its own children count against the limit.
      expect(args.childDepth).toBe(2);
      expect(args.workflowLineageId).toBe("wfl-1");
    }
  });

  it("fails the map cleanly when the fan-out would exceed the depth limit", async () => {
    const state = makeState({
      ctx: { items },
      workflowVersionId: "wv-parent",
      childDepth: MAX_CHILD_WORKFLOW_DEPTH,
    });

    await expect(
      executeNode(makeFanoutMapNode(), emptyConfig, state),
    ).rejects.toMatchObject({
      type: "CHILD_WORKFLOW_DEPTH_EXCEEDED",
      message: expect.stringContaining(
        `over the limit of ${MAX_CHILD_WORKFLOW_DEPTH}`,
      ),
    });

    expect(mockExecuteChild).not.toHaveBeenCalled();
  });
});
