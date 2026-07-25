/**
 * G-026 — one failed map branch must not destroy the rest.
 *
 * `executeWithConcurrencyLimit` used to reject on the first failure, so every
 * sibling result that had already completed was discarded. It now settles,
 * and `executeMapNode` applies the map node's `errorPolicy.onError` to decide
 * what a partial result means. The DEFAULT (no policy) must still fail.
 */

const mockActivityFn = jest.fn();
const mockProxyActivities = jest.fn(() => {
  return new Proxy(
    {},
    {
      get: () => mockActivityFn,
    },
  );
});

jest.mock("@temporalio/workflow", () => {
  // A real CLASS, not a bare `{ create }` object: `extractErrorDetails` does
  // `error instanceof ApplicationFailure` on every branch failure, and a
  // non-callable stub turns that into a TypeError that masks the real branch
  // error this suite is asserting about.
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
    executeChild: jest.fn(),
    setHandler: jest.fn(),
    sleep: jest.fn(),
    workflowInfo: jest.fn(() => ({ workflowId: "test-wf-id" })),
  };
});

import type {
  GraphWorkflowConfig,
  JoinNode,
  MapNode,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { executeNode } from "./node-executors";

// ---------------------------------------------------------------------------
// Fixture: SPLIT collection -> MAP -> BODY (one activity) -> JOIN
// ---------------------------------------------------------------------------

function makeState(collection: unknown[]): ExecutionState {
  return {
    currentNodes: [],
    completedNodeIds: new Set(),
    nodeStatuses: new Map(),
    nodeRunStatuses: {},
    cancelled: () => false,
    cancelMode: () => "graceful" as const,
    ctx: { items: collection },
    selectedEdges: new Map(),
    mapBranchResults: new Map(),
    configHash: "test-hash",
    runnerVersion: "1.0.0",
    groupId: null,
    lastError: {},
  };
}

function makeConfig(mapOverrides: Partial<MapNode> = {}): GraphWorkflowConfig {
  const mapNode: MapNode = {
    id: "MAP",
    type: "map",
    label: "Map",
    collectionCtxKey: "items",
    itemCtxKey: "currentItem",
    indexCtxKey: "currentIndex",
    bodyEntryNodeId: "BODY",
    bodyExitNodeId: "BODY",
    ...mapOverrides,
  };
  const joinNode: JoinNode = {
    id: "JOIN",
    type: "join",
    label: "Join",
    sourceMapNodeId: "MAP",
    strategy: "all",
    resultsCtxKey: "joined",
  };
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "MAP",
    nodes: {
      MAP: mapNode,
      BODY: {
        id: "BODY",
        type: "activity",
        label: "Body",
        activityType: "document.updateStatus",
        // The body reads the map's item so the stub can fail a chosen branch.
        inputs: [{ port: "currentItem", ctxKey: "currentItem" }],
        outputs: [{ port: "ok", ctxKey: "branchOut" }],
      },
      JOIN: joinNode,
    },
    edges: [
      { id: "e-map-body", source: "MAP", target: "BODY", type: "normal" },
    ],
    ctx: {},
  } as GraphWorkflowConfig;
}

/** Body activity that throws for the listed items and echoes the rest. */
function failOn(badItems: unknown[]) {
  mockActivityFn.mockImplementation(
    async (input: { currentItem?: unknown }) => {
      if (badItems.includes(input?.currentItem)) {
        throw new Error(`branch ${String(input?.currentItem)} exploded`);
      }
      return { ok: input?.currentItem };
    },
  );
}

beforeEach(() => {
  mockActivityFn.mockReset();
});

// ---------------------------------------------------------------------------

describe("executeMapNode — partial failure (G-026)", () => {
  it("keeps the successful branch results even when the map fails", async () => {
    const config = makeConfig();
    const state = makeState([1, 2, 3, 4]);
    failOn([3]);

    await expect(executeNode(config.nodes.MAP, config, state)).rejects.toThrow(
      /1 of 4 branches failed/,
    );

    // The three siblings survived the failure — before G-026 the rejection
    // discarded every one of them.
    const results = state.mapBranchResults.get("MAP");
    expect(results).toHaveLength(3);
  });

  it("names the failed branch indices and their errors", async () => {
    const config = makeConfig();
    const state = makeState([1, 2, 3, 4]);
    failOn([1, 3]);

    await expect(executeNode(config.nodes.MAP, config, state)).rejects.toThrow(
      /#0: .*branch 1 exploded.*#2: .*branch 3 exploded/s,
    );
    expect(state.lastError.current?.nodeId).toBe("MAP");
  });

  it("still fails by default when a branch fails (no policy set)", async () => {
    const config = makeConfig();
    const state = makeState([1, 2]);
    failOn([2]);

    await expect(
      executeNode(config.nodes.MAP, config, state),
    ).rejects.toThrow();
  });

  it("completes with the successful subset under onError 'skip'", async () => {
    const config = makeConfig({
      errorPolicy: { onError: "skip", retryable: true },
    });
    const state = makeState([1, 2, 3, 4]);
    failOn([2]);

    await expect(executeNode(config.nodes.MAP, config, state)).resolves.toEqual(
      { kind: "completed" },
    );

    expect(state.mapBranchResults.get("MAP")).toHaveLength(3);
    // The failure is recorded, not swallowed.
    expect(state.lastError.current?.message).toMatch(/1 of 4 branches failed/);
  });

  it("throws under onError 'fallback' so handleNodeError can route the node", async () => {
    // A map body has no per-branch error edge; the node-level fallback is
    // applied by handleNodeError once the map throws.
    const config = makeConfig({
      errorPolicy: {
        onError: "fallback",
        retryable: true,
        fallbackEdgeId: "e-err",
      },
    });
    const state = makeState([1, 2]);
    failOn([2]);

    await expect(
      executeNode(config.nodes.MAP, config, state),
    ).rejects.toThrow();
    expect(state.mapBranchResults.get("MAP")).toHaveLength(1);
  });

  it("does not throw when every branch succeeds", async () => {
    const config = makeConfig();
    const state = makeState([1, 2, 3]);
    failOn([]);

    await expect(executeNode(config.nodes.MAP, config, state)).resolves.toEqual(
      { kind: "completed" },
    );
    expect(state.mapBranchResults.get("MAP")).toHaveLength(3);
    expect(state.lastError.current).toBeUndefined();
  });
});

describe("executeJoinNode — what a join sees after a skipped failure (G-026)", () => {
  it("receives the successful subset in original branch order", async () => {
    const config = makeConfig({
      errorPolicy: { onError: "skip", retryable: true },
    });
    const state = makeState([1, 2, 3, 4]);
    failOn([2]);

    await executeNode(config.nodes.MAP, config, state);
    await executeNode(config.nodes.JOIN, config, state);

    const joined = state.ctx.joined as Record<string, unknown>[];
    expect(joined).toHaveLength(3);
    // Branch ctx carries `currentItem`; failed branch 2 contributes nothing —
    // no hole, no placeholder.
    expect(joined.map((branch) => branch.currentItem)).toEqual([1, 3, 4]);
  });

  it("receives an empty array when every branch failed under 'skip'", async () => {
    const config = makeConfig({
      errorPolicy: { onError: "skip", retryable: true },
    });
    const state = makeState([1, 2]);
    failOn([1, 2]);

    await executeNode(config.nodes.MAP, config, state);
    await executeNode(config.nodes.JOIN, config, state);

    expect(state.ctx.joined).toEqual([]);
  });
});
