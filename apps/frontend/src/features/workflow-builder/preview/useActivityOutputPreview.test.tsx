/**
 * Unit tests for `useActivityOutputPreview` (US-141).
 *
 * The hook reads from the SHARED batch endpoint
 * (`GET /:id/preview-cache-batch`) and selects its node's row, so N node
 * widgets cost one request. These tests assert that batching + per-node
 * selection + the debounced-on-transition refetch all behave.
 *
 * MSW is not part of the frontend test toolkit (see
 * apps/frontend/package.json — only vitest + @testing-library/react),
 * so we follow the existing hook-test convention and stub the global
 * `fetch` via `vi.spyOn`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import type { NodeStatusesMap } from "../run/node-status.types";
import {
  buildRunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import type { ActivityOutputPreview } from "./preview.types";
import {
  type ActivityOutputPreviewMap,
  ApiError,
  PREVIEW_REFETCH_DEBOUNCE_MS,
  previewCacheBatchQueryKey,
  useActivityOutputPreview,
} from "./useActivityOutputPreview";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "wf-abc";
const NODE_ID = "node-1";
const RUN_ID = "run-xyz";

function batchUrl(opts: { runId?: string }): string {
  const params = new URLSearchParams();
  if (opts.runId !== undefined) {
    params.set("runId", opts.runId);
  }
  const qs = params.toString();
  return `${API_BASE_URL}/workflows/${WORKFLOW_ID}/preview-cache-batch${
    qs ? `?${qs}` : ""
  }`;
}

const sampleRow: ActivityOutputPreview = {
  outputCtx: { document: { blob: { storage_key: "abc" } } },
  outputKind: "Document",
  createdAt: "2026-05-24T12:00:00.000Z",
  expiresAt: "2026-05-25T12:00:00.000Z",
};

function batchBody(previews: ActivityOutputPreviewMap): {
  previews: ActivityOutputPreviewMap;
} {
  return { previews };
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * Wrapper that mounts a TanStack `QueryClient` *and* a
 * `RunStateTestProvider` so the hook's `useNodeRunStatus(nodeId)`
 * subscription has a context to read.
 */
function buildWrapper(opts: {
  queryClient: QueryClient;
  nodeStatuses: NodeStatusesMap;
}): (props: { children: ReactNode }) => ReactNode {
  const value = buildRunStateContextValue({
    workflowId: WORKFLOW_ID,
    nodeStatuses: opts.nodeStatuses,
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={opts.queryClient}>
      <RunStateTestProvider value={value}>{children}</RunStateTestProvider>
    </QueryClientProvider>
  );
}

/**
 * Wrapper variant that lets the test mutate the `nodeStatuses` map
 * between re-renders. The wrapper reads from a closed-over ref each
 * render so the test can flip statuses + call `rerender()`.
 */
function buildMutableWrapper(opts: {
  queryClient: QueryClient;
  nodeStatusesRef: { current: NodeStatusesMap };
}): (props: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={opts.queryClient}>
      <RunStateTestProvider
        value={buildRunStateContextValue({
          workflowId: WORKFLOW_ID,
          nodeStatuses: opts.nodeStatusesRef.current,
        })}
      >
        {children}
      </RunStateTestProvider>
    </QueryClientProvider>
  );
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — hook signature + batch fetch
// ---------------------------------------------------------------------------

describe("Scenario 1 — hook signature + base behaviour", () => {
  it("fires ONE batch request and selects the node's row", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow })),
    );
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(batchUrl({ runId: RUN_ID }));
    expect(result.current.data).toEqual(sampleRow);
    expect(result.current.error).toBeNull();
  });

  it("uses the canonical batch queryKey shape (`runId ?? 'latest'`, no nodeId)", () => {
    const withRun = previewCacheBatchQueryKey(WORKFLOW_ID, RUN_ID);
    expect(withRun).toEqual(["preview-cache-batch", WORKFLOW_ID, RUN_ID]);
    const withoutRun = previewCacheBatchQueryKey(WORKFLOW_ID, undefined);
    expect(withoutRun).toEqual(["preview-cache-batch", WORKFLOW_ID, "latest"]);
  });

  it("shares ONE request across two nodes and gives each its own row", async () => {
    const other: ActivityOutputPreview = {
      ...sampleRow,
      outputKind: "Segment[]",
    };
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow, "node-2": other })),
    );
    const queryClient = createQueryClient();
    const wrapper = buildWrapper({ queryClient, nodeStatuses: {} });

    const a = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper },
    );
    const b = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, "node-2", RUN_ID),
      { wrapper },
    );

    await waitFor(() => {
      expect(a.result.current.isLoading).toBe(false);
      expect(b.result.current.isLoading).toBe(false);
    });

    // The whole point of batching: two node widgets → one network call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a.result.current.data).toEqual(sampleRow);
    expect(b.result.current.data).toEqual(other);
  });

  it("returns data === null when the node is absent from the map", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ "someone-else": sampleRow })),
    );
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("does not re-fetch on re-render of the same (workflowId, runId)", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow })),
    );
    const queryClient = createQueryClient();

    const { result, rerender } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("omits the runId query param when undefined", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow })),
    );
    const queryClient = createQueryClient();

    renderHook(() => useActivityOutputPreview(WORKFLOW_ID, NODE_ID), {
      wrapper: buildWrapper({ queryClient, nodeStatuses: {} }),
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0][0]).toBe(batchUrl({}));
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — debounced re-fetch on status transition
// ---------------------------------------------------------------------------

describe("Scenario 2 — debounced re-fetch on status transition", () => {
  it("invalidates the shared batch query 250ms after the status leaves `pending`", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow })),
    );
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const nodeStatusesRef: { current: NodeStatusesMap } = {
      current: { [NODE_ID]: { status: "running" } },
    };
    const { rerender } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildMutableWrapper({ queryClient, nodeStatusesRef }) },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    nodeStatusesRef.current = { [NODE_ID]: { status: "succeeded" } };
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_REFETCH_DEBOUNCE_MS - 1);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: previewCacheBatchQueryKey(WORKFLOW_ID, RUN_ID),
    });
  });

  it("coalesces multiple rapid transitions into a single invalidation", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(
      jsonResponse(batchBody({ [NODE_ID]: sampleRow })),
    );
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const nodeStatusesRef: { current: NodeStatusesMap } = {
      current: { [NODE_ID]: { status: "running" } },
    };
    const { rerender } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildMutableWrapper({ queryClient, nodeStatusesRef }) },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    nodeStatusesRef.current = { [NODE_ID]: { status: "succeeded" } };
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    nodeStatusesRef.current = { [NODE_ID]: { status: "failed" } };
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_REFETCH_DEBOUNCE_MS + 50);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — error handling
// ---------------------------------------------------------------------------

describe("Scenario 3 — error handling", () => {
  it("surfaces non-transient ApiErrors via the `error` field without retrying", async () => {
    // 403 — a NON-transient status, so the hook must not retry it.
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Boom" }, { status: 403 }),
    );
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(403);
    expect(result.current.error?.message).toBe("Boom");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors (429) and settles on the eventual success", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({ message: "Too Many Requests" }, { status: 429 }),
      )
      .mockResolvedValue(
        jsonResponse(batchBody({ [NODE_ID]: sampleRow }), { status: 200 }),
      );
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => expect(result.current.data).toEqual(sampleRow), {
      timeout: 10_000,
    });
    expect(result.current.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
