/**
 * Tests for tenant groupId injection in non-activity node executors.
 *
 * Regression guard for two cross-tenant bypass paths discovered in PR #123 review:
 *   1. executePollUntilNode did not inject state.groupId, allowing a workflow
 *      author to spoof groupId via node.parameters when the activity (e.g.
 *      tables.lookup) is invoked inside a pollUntil retry loop.
 *   2. executeChildWorkflowNode did not propagate state.groupId into the child
 *      workflow input. The child started with state.groupId=null, so even its
 *      executeActivityNode would fall through and honour parameter-supplied
 *      groupId.
 */

const mockActivityFn = jest.fn();
const mockExecuteChild = jest.fn();
const mockSleep = jest.fn();
const mockEvaluateCondition = jest.fn();

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
  executeChild: mockExecuteChild,
  setHandler: jest.fn(),
  sleep: mockSleep,
  workflowInfo: jest.fn(() => ({ workflowId: "parent-wf-id" })),
}));

jest.mock("../expression-evaluator", () => ({
  evaluateCondition: (...args: unknown[]) => mockEvaluateCondition(...args),
}));

import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
  PollUntilNode,
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

const graphConfig = {
  schemaVersion: "1.0",
  metadata: {},
  nodes: {},
  edges: [],
  entryNodeId: "test-node",
  ctx: {},
};

// ---------------------------------------------------------------------------
// pollUntil
// ---------------------------------------------------------------------------

function makePollUntilNode(
  overrides: Partial<PollUntilNode> = {},
): PollUntilNode {
  return {
    id: "poll-node",
    type: "pollUntil",
    label: "Poll",
    activityType: "tables.lookup",
    condition: { operator: "is-not-null", value: { ref: "ctx.result" } },
    interval: "1s",
    maxAttempts: 5,
    ...overrides,
  };
}

describe("executePollUntilNode — tenant groupId injection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivityFn.mockResolvedValue({ result: { ok: true } });
    // Make the loop exit on the first iteration.
    mockEvaluateCondition.mockReturnValue(true);
  });

  it("injects state.groupId into activity inputs on every iteration", async () => {
    const node = makePollUntilNode();
    const state = makeState({ groupId: "trusted-group" });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "trusted-group" }),
    );
  });

  it("state.groupId wins over node.parameters.groupId (cross-tenant fix)", async () => {
    // The exploit: a workflow author plants a foreign groupId in parameters,
    // hoping the pollUntil-routed call to tables.lookup will read another
    // tenant's data. State must override.
    const node = makePollUntilNode({
      parameters: {
        groupId: "evil-group",
        tableId: "t1",
        lookupName: "byDate",
      },
    });
    const state = makeState({ groupId: "trusted-group" });

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith.groupId).toBe("trusted-group");
  });

  it("state.groupId wins over port-bound groupId input (cross-tenant fix)", async () => {
    const node = makePollUntilNode({
      inputs: [{ port: "groupId", ctxKey: "mygid" }],
    });
    const state = makeState({
      ctx: { mygid: "binding-group" },
      groupId: "trusted-group",
    });

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith.groupId).toBe("trusted-group");
  });

  it("does NOT inject groupId when state.groupId is null", async () => {
    const node = makePollUntilNode();
    const state = makeState({ groupId: null });

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });
});

// ---------------------------------------------------------------------------
// childWorkflow
// ---------------------------------------------------------------------------

function makeChildWorkflowNode(
  overrides: Partial<ChildWorkflowNode> = {},
): ChildWorkflowNode {
  const inlineGraph: GraphWorkflowConfig = {
    schemaVersion: "1.0",
    metadata: { name: "child" },
    nodes: {},
    edges: [],
    entryNodeId: "noop",
    ctx: {},
  };
  return {
    id: "child-node",
    type: "childWorkflow",
    label: "Child",
    workflowRef: { type: "inline", graph: inlineGraph },
    ...overrides,
  };
}

describe("executeChildWorkflowNode — tenant groupId propagation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteChild.mockResolvedValue({
      ctx: {},
      completedNodes: [],
      status: "completed",
    });
  });

  it("propagates state.groupId into the child workflow input", async () => {
    const node = makeChildWorkflowNode();
    const state = makeState({ groupId: "trusted-group" });

    await executeNode(node, graphConfig as never, state);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "graphWorkflow",
      expect.objectContaining({
        args: [expect.objectContaining({ groupId: "trusted-group" })],
      }),
    );
  });

  it("propagates null groupId so child knows there is no tenant scope", async () => {
    // This guarantees the child's runGraphExecution sets state.groupId = null,
    // which keeps every downstream activity-node injection a no-op rather
    // than honouring an attacker-controlled parameter.
    const node = makeChildWorkflowNode();
    const state = makeState({ groupId: null });

    await executeNode(node, graphConfig as never, state);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "graphWorkflow",
      expect.objectContaining({
        args: [expect.objectContaining({ groupId: null })],
      }),
    );
  });

  it("propagates undefined groupId as null", async () => {
    const node = makeChildWorkflowNode();
    const state = makeState();

    await executeNode(node, graphConfig as never, state);

    const args = mockExecuteChild.mock.calls[0][1].args[0] as Record<
      string,
      unknown
    >;
    expect(args.groupId).toBeNull();
  });
});
