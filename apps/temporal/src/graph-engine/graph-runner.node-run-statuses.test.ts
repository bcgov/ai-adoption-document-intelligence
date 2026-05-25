/**
 * Runner-level tests for Phase 4 (US-135) — `nodeRunStatuses` map
 * maintenance.
 *
 * Drives `runGraphExecution` directly with a mocked `@temporalio/workflow`
 * proxy so the per-node status transitions can be observed without
 * spinning up the Temporal test environment. The same pattern as
 * `graph-runner.cache-integration.test.ts`.
 *
 * Covers Scenarios that can't ride the in-VM workflow tests:
 *   - Scenario 3 — failure path records `errorMessage` BEFORE the
 *     error propagates out of the runner.
 *   - Scenario 5 — untouched-branch nodes stay absent.
 *   - Scenario 6 (b) — cache-hit flips status to `"skipped"` with
 *     `cacheHit: { configHash, inputHash }` populated.
 *
 * Scenarios 1, 2, 4 + 6a are exercised in `graph-workflow.test.ts`
 * (the in-VM tests that use the actual `setHandler` registration).
 */

const mockActivityFn = jest.fn();

jest.mock("@temporalio/workflow", () => {
  class MockApplicationFailure extends Error {
    type?: string;
    nonRetryable?: boolean;
    static create(opts: {
      message: string;
      type: string;
      nonRetryable?: boolean;
    }): MockApplicationFailure {
      const err = new MockApplicationFailure(opts.message);
      err.type = opts.type;
      err.nonRetryable = opts.nonRetryable;
      return err;
    }
  }
  return {
    ApplicationFailure: MockApplicationFailure,
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
  };
});

import type { CachedActivityDeps } from "../cache/cached-activity";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { runGraphExecution } from "./graph-runner";

const LINEAGE_ID = "wfl-us135";

function makeCacheDeps(): {
  deps: CachedActivityDeps;
  findFresh: jest.Mock;
  upsert: jest.Mock;
} {
  const findFresh = jest.fn();
  const upsert = jest.fn();
  return {
    deps: { findFresh, upsert },
    findFresh,
    upsert,
  };
}

function makeFreshState(cacheDeps?: CachedActivityDeps): ExecutionState {
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
    workflowLineageId: cacheDeps ? LINEAGE_ID : null,
    cacheDeps,
    lastError: {},
  };
}

function makeInput(graph: GraphWorkflowConfig): GraphWorkflowInput {
  return {
    graph,
    initialCtx: {},
    configHash: "h",
    runnerVersion: "1.0.0",
    workflowLineageId: LINEAGE_ID,
  };
}

describe("runGraphExecution — Phase 4 nodeRunStatuses map (US-135)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------
  // Scenario 6 (b) — cache-hit short-circuit flips status to "skipped".
  // -----------------------------------------------------------------

  it("Scenario 6b — activity cache-hit flips status to 'skipped' with cacheHit populated", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue({
      outputCtx: { lookupResult: { value: 99, fromCache: true } },
      outputKind: null,
    });

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "cache-hit", description: "" },
      entryNodeId: "lookup",
      ctx: {},
      nodes: {
        lookup: {
          id: "lookup",
          type: "activity",
          label: "Lookup",
          activityType: "tables.lookup",
          parameters: { tableId: "t1", lookupName: "byDate" },
          outputs: [{ port: "result", ctxKey: "lookupResult" }],
        },
      },
      edges: [],
    };

    const state = makeFreshState(deps);
    await runGraphExecution(makeInput(graph), state);

    // Activity never ran — served from cache.
    expect(mockActivityFn).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();

    // The run-status map flips the node to "skipped" with the cache
    // row's `(configHash, inputHash)` for the canvas to display.
    const status = state.nodeRunStatuses.lookup;
    expect(status).toBeDefined();
    expect(status.status).toBe("skipped");
    expect(status.startedAt).toBeDefined();
    expect(status.endedAt).toBeDefined();
    expect(status.cacheHit).toBeDefined();
    expect(status.cacheHit?.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(status.cacheHit?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    // No errorMessage on the skipped path.
    expect(status.errorMessage).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // Scenario 6b — cache-miss (rawExecute ran) flips status to "succeeded"
  // (NOT "skipped"). Sanity check the contrast with the cache-hit case.
  // -----------------------------------------------------------------

  it("Scenario 6b contrast — cache-miss runs the activity and flips status to 'succeeded'", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue(null); // miss
    upsert.mockResolvedValue(undefined);
    mockActivityFn.mockResolvedValue({ result: { value: 42 } });

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "cache-miss", description: "" },
      entryNodeId: "lookup",
      ctx: {},
      nodes: {
        lookup: {
          id: "lookup",
          type: "activity",
          label: "Lookup",
          activityType: "tables.lookup",
          parameters: { tableId: "t1", lookupName: "byDate" },
          outputs: [{ port: "result", ctxKey: "lookupResult" }],
        },
      },
      edges: [],
    };

    const state = makeFreshState(deps);
    await runGraphExecution(makeInput(graph), state);

    expect(mockActivityFn).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);

    const status = state.nodeRunStatuses.lookup;
    expect(status.status).toBe("succeeded");
    expect(status.startedAt).toBeDefined();
    expect(status.endedAt).toBeDefined();
    expect(status.cacheHit).toBeUndefined();
    expect(status.errorMessage).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // Scenario 3 — failure path records `errorMessage` BEFORE the error
  // propagates out of the runner.
  // -----------------------------------------------------------------

  it("Scenario 3 — node failure records 'failed' + errorMessage before propagating", async () => {
    mockActivityFn.mockRejectedValue(new Error("kaboom"));

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "failure", description: "" },
      entryNodeId: "boom",
      ctx: {},
      nodes: {
        boom: {
          id: "boom",
          type: "activity",
          label: "Boom",
          activityType: "tables.lookup",
        },
      },
      edges: [],
    };

    const state = makeFreshState();

    // Default error policy = "fail" → runner re-throws.
    await expect(runGraphExecution(makeInput(graph), state)).rejects.toThrow(
      "kaboom",
    );

    // The status was written BEFORE the error propagated.
    const status = state.nodeRunStatuses.boom;
    expect(status).toBeDefined();
    expect(status.status).toBe("failed");
    expect(status.startedAt).toBeDefined();
    expect(status.endedAt).toBeDefined();
    expect(status.errorMessage).toBeDefined();
    expect(status.errorMessage).toContain("kaboom");
  });

  // -----------------------------------------------------------------
  // Scenario 5 — untouched branch nodes stay absent.
  // -----------------------------------------------------------------

  it("Scenario 5 — switch's untouched branch nodes stay absent from the map", async () => {
    mockActivityFn.mockResolvedValue({});

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "switch-branch", description: "" },
      entryNodeId: "start",
      ctx: {
        takePathA: { type: "boolean", defaultValue: true },
      },
      nodes: {
        start: {
          id: "start",
          type: "activity",
          label: "Start",
          activityType: "tables.lookup",
        },
        decide: {
          id: "decide",
          type: "switch",
          label: "Decide",
          cases: [
            {
              condition: {
                operator: "equals",
                left: { ref: "ctx.takePathA" },
                right: { literal: true },
              },
              edgeId: "edge-to-a",
            },
          ],
          defaultEdge: "edge-to-b",
        },
        pathA: {
          id: "pathA",
          type: "activity",
          label: "Path A",
          activityType: "tables.lookup",
        },
        pathB: {
          id: "pathB",
          type: "activity",
          label: "Path B",
          activityType: "tables.lookup",
        },
      },
      edges: [
        { id: "e0", source: "start", target: "decide", type: "normal" },
        {
          id: "edge-to-a",
          source: "decide",
          target: "pathA",
          type: "conditional",
        },
        {
          id: "edge-to-b",
          source: "decide",
          target: "pathB",
          type: "conditional",
        },
      ],
    };

    const state = makeFreshState();
    state.workflowLineageId = null;
    await runGraphExecution(
      {
        graph,
        initialCtx: {},
        configHash: "h",
        runnerVersion: "1.0.0",
      },
      state,
    );

    // The selected branch (A) ran; the unselected branch (B) did not.
    expect(state.nodeRunStatuses.start.status).toBe("succeeded");
    expect(state.nodeRunStatuses.decide.status).toBe("succeeded");
    expect(state.nodeRunStatuses.pathA.status).toBe("succeeded");
    // Scenario 5 — untouched-branch's node is absent from the map.
    expect(state.nodeRunStatuses.pathB).toBeUndefined();
  });

  // -----------------------------------------------------------------
  // Scenario 2 — running state observed mid-execution. Drives the
  // runner with a deferred activity so the map can be inspected while
  // the node is in-flight.
  // -----------------------------------------------------------------

  it("Scenario 2 — node enters 'running' before completion (snapshot mid-flight)", async () => {
    let activityStartedResolve: (() => void) | undefined;
    let finishActivityResolve: (() => void) | undefined;
    const activityStarted = new Promise<void>((resolve) => {
      activityStartedResolve = resolve;
    });
    const finishActivity = new Promise<void>((resolve) => {
      finishActivityResolve = resolve;
    });

    mockActivityFn.mockImplementation(async () => {
      activityStartedResolve?.();
      await finishActivity;
      return { result: { value: 1 } };
    });

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "mid-flight", description: "" },
      entryNodeId: "lookup",
      ctx: {},
      nodes: {
        lookup: {
          id: "lookup",
          type: "activity",
          label: "Lookup",
          activityType: "tables.lookup",
          outputs: [{ port: "result", ctxKey: "lookupResult" }],
        },
      },
      edges: [],
    };

    const state = makeFreshState();
    state.workflowLineageId = null;
    const runPromise = runGraphExecution(
      {
        graph,
        initialCtx: {},
        configHash: "h",
        runnerVersion: "1.0.0",
      },
      state,
    );

    await activityStarted;
    // Mid-flight: status is "running", endedAt absent.
    expect(state.nodeRunStatuses.lookup.status).toBe("running");
    expect(state.nodeRunStatuses.lookup.startedAt).toBeDefined();
    expect(state.nodeRunStatuses.lookup.endedAt).toBeUndefined();

    if (!finishActivityResolve) {
      throw new Error("finishActivityResolve not set");
    }
    finishActivityResolve();
    await runPromise;

    // Post-completion: status flipped to "succeeded".
    expect(state.nodeRunStatuses.lookup.status).toBe("succeeded");
    expect(state.nodeRunStatuses.lookup.endedAt).toBeDefined();
  });
});
