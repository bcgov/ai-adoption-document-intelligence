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

import type { ActivityNode, JoinNode, SourceNode } from "@ai-di/graph-workflow";

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
      // Second cacheable entry — G-018 needs two DIFFERENT activity types
      // that are both cacheable so a retype can be exercised.
      "test.cacheable2": {
        activityType: "test.cacheable2",
        displayName: "Test Cacheable Two",
        category: "Classification",
        description: "stub",
        iconHint: "x",
        colorHint: "green",
        inputs: [],
        outputs: [{ name: "out", label: "Out", kind: "Classification" }],
        parametersSchema: actual.ACTIVITY_CATALOG["azureOcr.extract"]
          ? actual.ACTIVITY_CATALOG["azureOcr.extract"].parametersSchema
          : undefined,
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

import type {
  ActivityOutputCacheFindFreshInput,
  ActivityOutputCacheFindFreshResult,
  ActivityOutputCacheUpsertInput,
} from "../activities/cache/activity-output-cache.types";
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

    expect(result.cacheHit).toBe(false);
    // US-135 — hashes are echoed back so the workflow's status map can
    // populate the `cacheHit` field of `NodeRunStatus` on subsequent
    // hits.
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
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
    // Hashes returned to the caller match the ones written to the cache.
    expect(result.configHash).toBe(upsertCall.configHash);
    expect(result.inputHash).toBe(upsertCall.inputHash);
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

    expect(result.cacheHit).toBe(true);
    // US-135 — even on a hit the hashes are echoed back so the status
    // map can name the cache row.
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
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

    expect(result.cacheHit).toBe(false);
    // Hashes are computed even on the bypass path (US-135).
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
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

    expect(result.cacheHit).toBe(false);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(findFresh).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(ctx).toEqual({ document: { id: "d-1" } });
    // Source nodes have no activity outputs — outputKind is null.
    const upsertCall = upsert.mock.calls[0][0] as { outputKind: string | null };
    expect(upsertCall.outputKind).toBeNull();
  });

  it("Scenario 4 — concurrent-write race: upsert P2002, re-findFresh, overlay winner's outputCtx, return cacheHit=true", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    // Under a matched (configHash, inputHash) the loser and winner compute
    // the SAME deterministic output — the race resolution overlays the
    // winner's canonical cache row onto ctx.
    const canonical = { ocrResult: { value: "canonical" } };
    findFresh
      .mockResolvedValueOnce(null) // initial miss
      .mockResolvedValueOnce({
        outputCtx: { ocrResult: { value: "canonical" } },
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
      .mockResolvedValue({ ocrResult: { value: "canonical" } });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result.cacheHit).toBe(true);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(findFresh).toHaveBeenCalledTimes(2);
    // Winner's canonical outputCtx is applied to ctx.
    expect(ctx).toEqual(canonical);
  });

  it("§3.1 — a cache-hit delta merges into ctx and does NOT clobber a concurrent sibling's write to the same subtree", async () => {
    const { deps, findFresh } = makeDeps();
    // The cached row for THIS node wrote only `documentMetadata.category`.
    findFresh.mockResolvedValueOnce({
      outputCtx: { documentMetadata: { category: "invoice" } },
      outputKind: "Document",
    });

    const node = makeCacheableNode();
    // A concurrent sibling already wrote a DIFFERENT leaf of the same subtree.
    const ctx: Record<string, unknown> = {
      documentMetadata: { pageCount: 7 },
    };
    const rawExecute = jest.fn();

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result.cacheHit).toBe(true);
    expect(rawExecute).not.toHaveBeenCalled();
    // The sibling's `pageCount` survives; the cached `category` is added.
    expect(ctx).toEqual({
      documentMetadata: { pageCount: 7, category: "invoice" },
    });
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

  it("§3.4 — a terminal upsert failure with no committed row does NOT fail the node (best-effort, keeps delta)", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    // Initial miss, and the post-failure re-check also finds no row (a
    // genuine transient write failure, not a lost race).
    findFresh.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    // Across the activity boundary a P2002 arrives with `.code` stripped, so
    // this looks like any other error — the decorator must not rethrow it.
    upsert.mockRejectedValue(new Error("connection refused"));

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest.fn().mockResolvedValue({ ok: true });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    // The node completes (uncached); the error never propagates.
    expect(result.cacheHit).toBe(false);
    expect(rawExecute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    // Re-checked for a racing row (found none), kept the already-applied delta.
    expect(findFresh).toHaveBeenCalledTimes(2);
    expect(ctx).toEqual({ ok: true });
  });

  it("§3.4 — a terminal upsert failure that IS a lost race overlays the winner's row (cacheHit=true)", async () => {
    const { deps, findFresh, upsert } = makeDeps();
    // Initial miss, then the post-failure re-check finds the winner's row.
    findFresh.mockResolvedValueOnce(null).mockResolvedValueOnce({
      outputCtx: { ok: true, canonical: true },
      outputKind: "Document",
    });
    // The P2002 arrives with `.code` stripped — indistinguishable from any
    // other failure, but re-findFresh reveals a committed row.
    upsert.mockRejectedValue(new Error("stripped-code failure"));

    const node = makeCacheableNode();
    const ctx: Record<string, unknown> = {};
    const rawExecute = jest.fn().mockResolvedValue({ ok: true });

    const result = await executeCachedActivity(
      deps,
      node,
      ctx,
      WORKFLOW_LINEAGE_ID,
      rawExecute,
    );

    expect(result.cacheHit).toBe(true);
    expect(findFresh).toHaveBeenCalledTimes(2);
    expect(ctx).toEqual({ ok: true, canonical: true });
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

  // -------------------------------------------------------------------------
  // G-018 — the cache key must carry the node's identity-of-computation.
  //
  // The unique key is `(workflowLineageId, nodeId, configHash, inputHash)`.
  // Before the fix `configHash` hashed the node's PARAMETERS ALONE, so a node
  // retyped in place — same id, same parameters, same inputs — landed on the
  // previous activity's row and was served its output. These tests use a fake
  // store keyed exactly like the Prisma `@@unique` so a collision shows up as
  // a real cache hit rather than as a hash comparison.
  // -------------------------------------------------------------------------
  describe("G-018 — activity identity is part of the cache key", () => {
    function makeStore(): {
      deps: CachedActivityDeps;
      findFresh: jest.Mock;
      upsert: jest.Mock;
    } {
      const rows = new Map<string, ActivityOutputCacheFindFreshResult>();
      const rowKey = (input: ActivityOutputCacheFindFreshInput): string =>
        [
          input.workflowLineageId,
          input.nodeId,
          input.configHash,
          input.inputHash,
        ].join("|");
      const findFresh = jest.fn(
        async (
          input: ActivityOutputCacheFindFreshInput,
        ): Promise<ActivityOutputCacheFindFreshResult | null> =>
          rows.get(rowKey(input)) ?? null,
      );
      const upsert = jest.fn(
        async (input: ActivityOutputCacheUpsertInput): Promise<void> => {
          rows.set(rowKey(input), {
            outputCtx: input.outputCtx,
            outputKind: input.outputKind ?? null,
          });
        },
      );
      return { deps: { findFresh, upsert }, findFresh, upsert };
    }

    it("does not serve a cached result to a different activity type", async () => {
      const { deps } = makeStore();

      // Node A — an OCR-ish activity populates the cache.
      const nodeA = makeCacheableNode({
        activityType: "test.cacheable",
        parameters: { confidenceThreshold: 0.8 },
      });
      const ocrExecute = jest.fn().mockResolvedValue({ result: "ocr-output" });
      const firstRun = await executeCachedActivity(
        deps,
        nodeA,
        {},
        WORKFLOW_LINEAGE_ID,
        ocrExecute,
      );
      expect(firstRun.cacheHit).toBe(false);
      expect(ocrExecute).toHaveBeenCalledTimes(1);

      // Node B — SAME id, SAME parameters, SAME (empty) inputs; only the
      // activity type differs. It must NOT inherit A's output.
      const nodeB = makeCacheableNode({
        activityType: "test.cacheable2",
        parameters: { confidenceThreshold: 0.8 },
      });
      const ctxB: Record<string, unknown> = {};
      const classifyExecute = jest
        .fn()
        .mockResolvedValue({ result: "classification-output" });
      const secondRun = await executeCachedActivity(
        deps,
        nodeB,
        ctxB,
        WORKFLOW_LINEAGE_ID,
        classifyExecute,
      );

      expect(secondRun.cacheHit).toBe(false);
      expect(classifyExecute).toHaveBeenCalledTimes(1);
      expect(ctxB).toEqual({ result: "classification-output" });
      expect(secondRun.configHash).not.toBe(firstRun.configHash);
    });

    it("still serves a cached result to the same activity", async () => {
      const { deps } = makeStore();

      const node = makeCacheableNode({ parameters: { a: 1 } });
      const rawExecute = jest.fn().mockResolvedValue({ result: "v1" });
      const first = await executeCachedActivity(
        deps,
        node,
        {},
        WORKFLOW_LINEAGE_ID,
        rawExecute,
      );
      expect(first.cacheHit).toBe(false);

      const ctx: Record<string, unknown> = {};
      const secondExecute = jest.fn();
      const second = await executeCachedActivity(
        deps,
        makeCacheableNode({ parameters: { a: 1 } }),
        ctx,
        WORKFLOW_LINEAGE_ID,
        secondExecute,
      );

      expect(second.cacheHit).toBe(true);
      expect(secondExecute).not.toHaveBeenCalled();
      expect(ctx).toEqual({ result: "v1" });
      expect(second.configHash).toBe(first.configHash);
    });

    it("distinguishes a control-flow node from an activity with the same id", async () => {
      const { deps } = makeStore();

      // An activity with no parameters — pre-fix this hashed to sha256("{}").
      const activity = makeCacheableNode({ parameters: {} });
      const activityExecute = jest
        .fn()
        .mockResolvedValue({ result: "from-activity" });
      const first = await executeCachedActivity(
        deps,
        activity,
        {},
        WORKFLOW_LINEAGE_ID,
        activityExecute,
      );
      expect(first.cacheHit).toBe(false);

      // A join node reusing the same id — no parameters either, so pre-fix it
      // produced the identical sha256("{}") configHash.
      const join: JoinNode = {
        id: activity.id,
        type: "join",
        label: "Collect",
        sourceMapNodeId: "map-1",
        strategy: "all",
        resultsCtxKey: "results",
        inputs: [],
        outputs: [],
      };
      const ctx: Record<string, unknown> = {};
      const joinExecute = jest.fn().mockResolvedValue({ result: "from-join" });
      const second = await executeCachedActivity(
        deps,
        join,
        ctx,
        WORKFLOW_LINEAGE_ID,
        joinExecute,
      );

      expect(second.cacheHit).toBe(false);
      expect(joinExecute).toHaveBeenCalledTimes(1);
      expect(ctx).toEqual({ result: "from-join" });
      expect(second.configHash).not.toBe(first.configHash);
    });

    it("keeps the cache across a pure rename — label is NOT part of the key", async () => {
      const { deps } = makeStore();

      const node = makeCacheableNode({
        label: "Extract text",
        parameters: { a: 1 },
      });
      const rawExecute = jest.fn().mockResolvedValue({ result: "v1" });
      const first = await executeCachedActivity(
        deps,
        node,
        {},
        WORKFLOW_LINEAGE_ID,
        rawExecute,
      );
      expect(first.cacheHit).toBe(false);

      const renamed = makeCacheableNode({
        label: "Extract text (renamed)",
        parameters: { a: 1 },
      });
      const ctx: Record<string, unknown> = {};
      const renamedExecute = jest.fn();
      const second = await executeCachedActivity(
        deps,
        renamed,
        ctx,
        WORKFLOW_LINEAGE_ID,
        renamedExecute,
      );

      expect(second.configHash).toBe(first.configHash);
      expect(second.cacheHit).toBe(true);
      expect(renamedExecute).not.toHaveBeenCalled();
    });
  });
});
