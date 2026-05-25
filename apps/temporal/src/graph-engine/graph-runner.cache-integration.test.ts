/**
 * Integration test for Phase 4 (US-133) — `executeCachedActivity` wired
 * into the graph-runner's per-node activity dispatch.
 *
 * Scenarios covered (matching the US-133 acceptance criteria):
 *   - Scenario 1 — every activity dispatch routes through the decorator
 *     when `workflowLineageId` + `cacheDeps` are set on `ExecutionState`.
 *   - Scenario 2 — the lineage scope is plumbed through to every
 *     `findFresh` + `upsert` call.
 *   - Scenario 3 — source-node ctx-merge writes its own cache row at
 *     workflow start (`configHash`/`inputHash`/`outputCtx` per L16).
 *   - Scenario 4 — control-flow nodes (`switch`) keep their existing
 *     execution path; only `activity` and `source` nodes are wrapped.
 *   - Cache-write happens after a regular activity execution.
 *   - Cache-hit short-circuits the activity and overlays cached ctx.
 *
 * Strategy: drive `runGraphExecution` directly with a mocked Temporal
 * `proxyActivities` (so the activity dispatch is a plain `jest.fn`) and
 * injected `cacheDeps` (Jest mocks for findFresh + upsert). This is the
 * same pattern as `graph-runner.group-injection.test.ts`.
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

import type { CachedActivityDeps } from "../cache/cached-activity";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
} from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";
import { runGraphExecution } from "./graph-runner";

const LINEAGE_ID = "wfl-test-1";

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
    cancelled: () => false,
    cancelMode: () => "graceful" as const,
    ctx: {},
    selectedEdges: new Map(),
    mapBranchResults: new Map(),
    configHash: "test-hash",
    runnerVersion: "1.0.0",
    workflowLineageId: LINEAGE_ID,
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

const minimalActivityGraph: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "cache-integration-test", description: "" },
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

describe("runGraphExecution — Phase 4 cache decorator integration (US-133)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Scenario 1 — writes a cache row after a regular activity executes (cache-miss path)", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue(null); // miss
    upsert.mockResolvedValue(undefined);
    mockActivityFn.mockResolvedValue({ result: { value: 42 } });

    const state = makeFreshState(deps);
    await runGraphExecution(makeInput(minimalActivityGraph), state);

    // Activity ran exactly once.
    expect(mockActivityFn).toHaveBeenCalledTimes(1);
    // Cache lookup happened against the right lineage + node.
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowLineageId: LINEAGE_ID,
        nodeId: "lookup",
      }),
    );
    // Cache write happened with the ctx delta the activity produced.
    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertCall = upsert.mock.calls[0][0] as {
      workflowLineageId: string;
      nodeId: string;
      configHash: string;
      inputHash: string;
      outputCtx: Record<string, unknown>;
    };
    expect(upsertCall.workflowLineageId).toBe(LINEAGE_ID);
    expect(upsertCall.nodeId).toBe("lookup");
    expect(upsertCall.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(upsertCall.inputHash).toMatch(/^[0-9a-f]{64}$/);
    // outputCtx contains the top-level ctx key the node wrote.
    expect(upsertCall.outputCtx).toEqual({ lookupResult: { value: 42 } });
    // ctx has been mutated with the activity's output.
    expect(state.ctx.lookupResult).toEqual({ value: 42 });
  });

  it("Scenario 1+2 — cache-hit short-circuits the activity and overlays cached ctx", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue({
      outputCtx: { lookupResult: { value: 99, fromCache: true } },
      outputKind: null,
    });

    const state = makeFreshState(deps);
    await runGraphExecution(makeInput(minimalActivityGraph), state);

    // Activity NEVER ran — we served from cache.
    expect(mockActivityFn).not.toHaveBeenCalled();
    // findFresh was hit for the right lineage.
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledWith(
      expect.objectContaining({ workflowLineageId: LINEAGE_ID }),
    );
    // Nothing to write — upsert is skipped on hit.
    expect(upsert).not.toHaveBeenCalled();
    // ctx now reflects the cached output.
    expect(state.ctx.lookupResult).toEqual({ value: 99, fromCache: true });
  });

  it("Scenario 2 — every cache call carries the lineageId from state", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);
    mockActivityFn.mockResolvedValue({ result: 1 });

    const state = makeFreshState(deps);
    await runGraphExecution(makeInput(minimalActivityGraph), state);

    const findFreshArg = findFresh.mock.calls[0][0] as {
      workflowLineageId: string;
    };
    const upsertArg = upsert.mock.calls[0][0] as { workflowLineageId: string };
    expect(findFreshArg.workflowLineageId).toBe(LINEAGE_ID);
    expect(upsertArg.workflowLineageId).toBe(LINEAGE_ID);
  });

  it("Scenario 3 — source-node ctx-merge writes its own cache row at workflow start", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "source-cache", description: "" },
      entryNodeId: "src",
      ctx: {
        payload: { type: "string", defaultValue: "hello" },
      },
      nodes: {
        src: {
          id: "src",
          type: "source",
          label: "API source",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
      },
      edges: [],
    };

    const state = makeFreshState(deps);
    await runGraphExecution(
      {
        graph,
        initialCtx: { fromBody: "value-1" },
        configHash: "h",
        runnerVersion: "1.0.0",
        workflowLineageId: LINEAGE_ID,
      },
      state,
    );

    // Only the source-node cache row should have been written; no
    // activity dispatch.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(mockActivityFn).not.toHaveBeenCalled();

    const upsertCall = upsert.mock.calls[0][0] as {
      workflowLineageId: string;
      nodeId: string;
      configHash: string;
      inputHash: string;
      outputCtx: Record<string, unknown>;
      outputKind: string | null;
    };
    expect(upsertCall.workflowLineageId).toBe(LINEAGE_ID);
    expect(upsertCall.nodeId).toBe("src");
    expect(upsertCall.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(upsertCall.inputHash).toMatch(/^[0-9a-f]{64}$/);
    // outputCtx is the initial ctx (defaults + initialCtx merged).
    expect(upsertCall.outputCtx).toMatchObject({
      payload: "hello",
      fromBody: "value-1",
    });
    // outputKind comes from the source catalog entry.
    expect(
      typeof upsertCall.outputKind === "string" ||
        upsertCall.outputKind === null,
    ).toBe(true);

    // Source node is marked completed so the main loop doesn't try to
    // execute it (sources have no executeNode handler).
    expect(state.completedNodeIds.has("src")).toBe(true);
  });

  it("Scenario 4 — switch nodes are NOT wrapped by the cache decorator", async () => {
    const { deps, findFresh, upsert } = makeCacheDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);
    mockActivityFn.mockResolvedValue({});

    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "switch-test", description: "" },
      entryNodeId: "decide",
      ctx: {
        flag: { type: "boolean", defaultValue: false },
      },
      nodes: {
        decide: {
          id: "decide",
          type: "switch",
          label: "Decide",
          cases: [
            {
              condition: {
                operator: "equals",
                left: { ref: "ctx.flag" },
                right: { literal: true },
              },
              edgeId: "to-noop",
            },
          ],
          defaultEdge: "to-noop",
        },
      },
      edges: [],
    };

    const state = makeFreshState(deps);
    await runGraphExecution(
      {
        graph,
        initialCtx: {},
        configHash: "h",
        runnerVersion: "1.0.0",
        workflowLineageId: LINEAGE_ID,
      },
      state,
    );

    // No activity dispatch + no cache calls for a pure switch graph.
    expect(mockActivityFn).not.toHaveBeenCalled();
    expect(findFresh).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    // Switch node ran (selectedEdges populated).
    expect(state.selectedEdges.get("decide")).toBe("to-noop");
  });

  it("legacy callers without cacheDeps continue to run uncached (no findFresh / upsert)", async () => {
    mockActivityFn.mockResolvedValue({ result: { value: 7 } });

    const state = makeFreshState(undefined); // no cacheDeps
    state.workflowLineageId = null;
    await runGraphExecution(
      {
        graph: minimalActivityGraph,
        initialCtx: {},
        configHash: "h",
        runnerVersion: "1.0.0",
        // no workflowLineageId
      },
      state,
    );

    expect(mockActivityFn).toHaveBeenCalledTimes(1);
    expect(state.ctx.lookupResult).toEqual({ value: 7 });
    // No cache machinery on the legacy path — the `deps` aren't passed,
    // so there's nothing to assert on cache calls (they didn't happen).
  });
});
