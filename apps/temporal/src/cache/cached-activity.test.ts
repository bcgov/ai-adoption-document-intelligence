/**
 * Unit tests for the Phase 4 try-in-place worker cache decorator (US-132).
 *
 * Covers all five behavioural paths the story enumerates in Scenario 6:
 *   1. Cache-miss happy path — findFresh→null, rawExecute called, delta
 *      written into ctx, upsert called, return `{ cacheHit: false }`.
 *   2. Cache-hit short-circuit — findFresh returns a row, ctx is overlaid
 *      from `row.outputCtx`, rawExecute is NEVER called, return
 *      `{ cacheHit: true }`.
 *   3. `nonCacheable` bypass — when the catalog marks the activity as
 *      nonCacheable, the decorator calls rawExecute directly and skips
 *      findFresh AND upsert.
 *   4. Concurrent-write race — upsert throws P2002, decorator re-runs
 *      findFresh and assigns the winner's outputCtx into ctx, returning
 *      `{ cacheHit: true }`.
 *   5. Activity failure — rawExecute throws, the error propagates and
 *      upsert is never called.
 *
 * The decorator's `deps` parameter is the injectable seam — tests pass
 * Jest mocks directly without needing the Temporal harness.
 *
 * `ACTIVITY_CATALOG` is mocked at the module boundary so the test can
 * declare a cacheable AND a non-cacheable activity entry without
 * touching the production sweep (US-134).
 */

import type { ActivityNode, SourceNode } from "@ai-di/graph-workflow";

jest.mock("@ai-di/graph-workflow", () => {
  const actual = jest.requireActual("@ai-di/graph-workflow");
  return {
    ...actual,
    ACTIVITY_CATALOG: {
      "test.cacheable": {
        activityType: "test.cacheable",
        displayName: "Test Cacheable",
        category: "OCR (Azure)",
        description: "stub",
        iconHint: "x",
        colorHint: "blue",
        inputs: [],
        outputs: [{ name: "out", label: "Out", kind: "Document" }],
        parametersSchema: actual.ACTIVITY_CATALOG["azureOcr.extract"]
          ? actual.ACTIVITY_CATALOG["azureOcr.extract"].parametersSchema
          : undefined,
        // nonCacheable absent → defaults to cacheable.
      },
      "test.nonCacheable": {
        activityType: "test.nonCacheable",
        displayName: "Test Non-Cacheable",
        category: "OCR (Azure)",
        description: "stub",
        iconHint: "x",
        colorHint: "red",
        inputs: [],
        outputs: [],
        parametersSchema: actual.ACTIVITY_CATALOG["azureOcr.extract"]
          ? actual.ACTIVITY_CATALOG["azureOcr.extract"].parametersSchema
          : undefined,
        nonCacheable: true,
      },
    },
  };
});

import type { CachedActivityDeps } from "./cached-activity";
import { executeCachedActivity } from "./cached-activity";

const WORKFLOW_LINEAGE_ID = "wfl-test-1";

function makeDeps(): {
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

function makeCacheableNode(
  overrides: Partial<ActivityNode> = {},
): ActivityNode {
  return {
    id: "node-cache-1",
    type: "activity",
    activityType: "test.cacheable",
    label: "Test cacheable",
    inputs: [],
    outputs: [],
    parameters: { confidenceThreshold: 0.8 },
    ...overrides,
  };
}

function makeNonCacheableNode(): ActivityNode {
  return {
    id: "node-noncache-1",
    type: "activity",
    activityType: "test.nonCacheable",
    label: "Test non-cacheable",
    inputs: [],
    outputs: [],
    parameters: {},
  };
}

function makeSourceNode(): SourceNode {
  return {
    id: "node-source-1",
    type: "source",
    sourceType: "source.api",
    label: "Test source",
    inputs: [],
    outputs: [],
    parameters: { someParam: "value" },
  };
}

describe("executeCachedActivity (US-132)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("Scenario 1 — cache-miss: calls rawExecute, assigns delta, upserts, returns cacheHit=false", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = { existing: "kept" };
    const rawExecute = jest
      .fn()
      .mockResolvedValue({ ocrResult: { confidence: 0.95 } });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result).toEqual({ cacheHit: false });
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(ctx).toEqual({
      existing: "kept",
      ocrResult: { confidence: 0.95 },
    });
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowLineageId: WORKFLOW_LINEAGE_ID,
        nodeId: node.id,
      }),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowLineageId: WORKFLOW_LINEAGE_ID,
        nodeId: node.id,
        outputCtx: { ocrResult: { confidence: 0.95 } },
        outputKind: "Document",
      }),
    );
    // configHash and inputHash are present and hex sha256 strings.
    const upsertCall = upsert.mock.calls[0][0] as {
      configHash: string;
      inputHash: string;
    };
    expect(upsertCall.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(upsertCall.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Scenario 2 — cache-hit: assigns row.outputCtx, skips rawExecute, returns cacheHit=true", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue({
      outputCtx: { ocrResult: { confidence: 0.99, fromCache: true } },
      outputKind: "Document",
    });

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = { existing: "kept" };
    const rawExecute = jest.fn();

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result).toEqual({ cacheHit: true });
    expect(rawExecute).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(ctx).toEqual({
      existing: "kept",
      ocrResult: { confidence: 0.99, fromCache: true },
    });
    expect(findFresh).toHaveBeenCalledTimes(1);
  });

  it("Scenario 3 — nonCacheable bypass: skips findFresh + upsert, calls rawExecute, returns cacheHit=false", async () => {
    const { deps, findFresh, upsert } = makeDeps();

    const node = makeNonCacheableNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest
      .fn()
      .mockResolvedValue({ submittedAt: "2026-05-24T12:00:00Z" });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result).toEqual({ cacheHit: false });
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(findFresh).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(ctx).toEqual({ submittedAt: "2026-05-24T12:00:00Z" });
  });

  it("Scenario 3b — source node is ALWAYS cached (no bypass even though no activityType)", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);

    const node = makeSourceNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest.fn().mockResolvedValue({ document: { id: "d-1" } });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result).toEqual({ cacheHit: false });
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(ctx).toEqual({ document: { id: "d-1" } });
    // Source nodes have no activity outputs — outputKind is null.
    const upsertCall = upsert.mock.calls[0][0] as { outputKind: string | null };
    expect(upsertCall.outputKind).toBeNull();
  });

  it("Scenario 4 — concurrent-write race: upsert P2002, re-findFresh, assign winner's outputCtx, return cacheHit=true", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh
      .mockResolvedValueOnce(null) // initial miss
      .mockResolvedValueOnce({
        outputCtx: { ocrResult: { fromWinner: true } },
        outputKind: "Document",
      });
    const prismaConflict = Object.assign(
      new Error("Unique constraint failed"),
      { code: "P2002" },
    );
    upsert.mockRejectedValue(prismaConflict);

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest
      .fn()
      .mockResolvedValue({ ocrResult: { fromLoser: true } });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result).toEqual({ cacheHit: true });
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledTimes(2);
    // Winner's outputCtx overlays the loser's delta.
    expect(ctx).toEqual({ ocrResult: { fromWinner: true } });
  });

  it("Scenario 5 — activity failure: error propagates, upsert is never called, no partial cache row", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue(null);

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = { existing: "kept" };
    const boom = new Error("activity exploded");
    const rawExecute = jest.fn().mockRejectedValue(boom);

    await expect(
      executeCachedActivity(deps, node, ctx, WORKFLOW_LINEAGE_ID, rawExecute),
    ).rejects.toThrow("activity exploded");

    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
    // ctx is untouched by the decorator on failure.
    expect(ctx).toEqual({ existing: "kept" });
  });

  it("Scenario 4b — non-P2002 errors from upsert propagate (race handling does NOT mask real failures)", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockRejectedValue(new Error("connection refused"));

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest.fn().mockResolvedValue({ ok: true });

    await expect(
      executeCachedActivity(deps, node, ctx, WORKFLOW_LINEAGE_ID, rawExecute),
    ).rejects.toThrow("connection refused");

    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    // Delta was applied before upsert threw — decorator does NOT unwind ctx.
    expect(ctx).toEqual({ ok: true });
  });

  it("configHash is stable across identical parameter objects (key-order independent)", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    findFresh.mockResolvedValue(null);
    upsert.mockResolvedValue(undefined);

    const nodeA = makeCacheableNode({
      parameters: { a: 1, b: 2 },
    });
    const nodeB = makeCacheableNode({
      parameters: { b: 2, a: 1 },
    });

    await executeCachedActivity(
      deps,
      nodeA,
      {},
      WORKFLOW_LINEAGE_ID,
      jest.fn().mockResolvedValue({}),
    );
    await executeCachedActivity(
      deps,
      nodeB,
      {},
      WORKFLOW_LINEAGE_ID,
      jest.fn().mockResolvedValue({}),
    );

    const firstHash = (findFresh.mock.calls[0][0] as { configHash: string })
      .configHash;
    const secondHash = (findFresh.mock.calls[1][0] as { configHash: string })
      .configHash;
    expect(firstHash).toBe(secondHash);
  });
});
