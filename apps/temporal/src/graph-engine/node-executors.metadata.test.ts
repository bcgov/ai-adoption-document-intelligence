/**
 * Tests for tenant groupId injection in executeActivityNode.
 *
 * Verifies that state.groupId (set by the workflow caller) is injected into
 * activity inputs and always wins over port bindings or static parameters
 * (security: prevents cross-tenant access via graph node config).
 */

// Mock @temporalio/workflow before importing any module that uses it
const mockActivityFn = jest.fn();
const mockProxyActivities = jest.fn(() => {
  return new Proxy(
    {},
    {
      get: () => mockActivityFn,
    },
  );
});

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
  proxyActivities: mockProxyActivities,
  condition: jest.fn(),
  defineSignal: jest.fn(() => "mock-signal"),
  executeChild: jest.fn(),
  setHandler: jest.fn(),
  sleep: jest.fn(),
  workflowInfo: jest.fn(() => ({ workflowId: "test-wf-id" })),
}));

import type { ActivityNode } from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { executeNode } from "./node-executors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActivityNode(overrides: Partial<ActivityNode> = {}): ActivityNode {
  return {
    id: "test-node",
    type: "activity",
    label: "Test Node",
    activityType: "document.updateStatus",
    ...overrides,
  };
}

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

// Minimal graph config (required by executeNode but not relevant to these tests)
const graphConfig = {
  schemaVersion: "1.0",
  metadata: {},
  nodes: {},
  edges: [],
  entryNodeId: "test-node",
  ctx: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeActivityNode — tenant groupId injection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Return a dummy result so the activity succeeds
    mockActivityFn.mockResolvedValue({});
  });

  it("injects groupId from execution state when node has no inputs or parameters", async () => {
    const node = makeActivityNode();
    const state = makeState({ groupId: "g-from-state" });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "g-from-state" }),
    );
  });

  it("does NOT inject groupId when state.groupId is null", async () => {
    const node = makeActivityNode();
    const state = makeState({ groupId: null });

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });

  it("does NOT inject groupId when state.groupId is undefined", async () => {
    const node = makeActivityNode();
    const state = makeState();

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });

  it("state.groupId wins over node static parameters (cross-tenant fix)", async () => {
    const node = makeActivityNode({
      parameters: { groupId: "g-from-node", status: "test" },
    });
    const state = makeState({ groupId: "g-from-state" });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "g-from-state" }),
    );
  });

  it("state.groupId wins over port binding (cross-tenant fix)", async () => {
    const node = makeActivityNode({
      inputs: [{ port: "groupId", ctxKey: "myGroupId" }],
    });
    const state = makeState({
      ctx: { myGroupId: "g-from-binding" },
      groupId: "g-from-state",
    });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "g-from-state" }),
    );
  });

  it("graph config cannot override groupId for cross-tenant access", async () => {
    const node = makeActivityNode({
      parameters: { groupId: "evil-group", tableId: "t1", lookupName: "foo" },
    });
    const state = makeState({ groupId: "trusted-group" });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "trusted-group" }),
    );
    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith.groupId).toBe("trusted-group");
  });

  it("groupId in ctx is ignored — only state.groupId is trusted", async () => {
    // A workflow author declaring __workflowMetadata or groupId in ctx must not
    // be able to influence the injected tenant scope. Only state.groupId counts.
    const node = makeActivityNode();
    const state = makeState({
      ctx: {
        __workflowMetadata: { groupId: "spoofed-from-ctx" },
        groupId: "also-spoofed",
      },
      // no groupId on state
    });

    await executeNode(node, graphConfig as never, state);

    const calledWith = mockActivityFn.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(calledWith).not.toHaveProperty("groupId");
  });

  it("injects groupId alongside other inputs from port bindings", async () => {
    const node = makeActivityNode({
      inputs: [{ port: "documentId", ctxKey: "documentId" }],
      parameters: { status: "test" },
    });
    const state = makeState({
      ctx: { documentId: "doc-abc" },
      groupId: "g-from-state",
    });

    await executeNode(node, graphConfig as never, state);

    expect(mockActivityFn).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-abc",
        status: "test",
        groupId: "g-from-state",
      }),
    );
  });
});
