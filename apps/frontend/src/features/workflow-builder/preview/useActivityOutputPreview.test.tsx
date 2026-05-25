/**
 * Unit tests for `useActivityOutputPreview` (US-141).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-141-preview-hook-and-dispatch-shell.md.
 *
 * MSW is not part of the frontend test toolkit (see
 * apps/frontend/package.json — only vitest + @testing-library/react),
 * so we follow the existing hook-test convention from the sibling
 * Phase 4 hook `useNodeStatuses.test.tsx` and stub the global `fetch`
 * via `vi.spyOn`.
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
  ApiError,
  PREVIEW_REFETCH_DEBOUNCE_MS,
  previewCacheQueryKey,
  useActivityOutputPreview,
} from "./useActivityOutputPreview";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "wf-abc";
const NODE_ID = "node-1";
const RUN_ID = "run-xyz";

function previewUrl(opts: { nodeId: string; runId?: string }): string {
  const params = new URLSearchParams({ nodeId: opts.nodeId });
  if (opts.runId !== undefined) {
    params.set("runId", opts.runId);
  }
  return `${API_BASE_URL}/workflows/${WORKFLOW_ID}/preview-cache?${params.toString()}`;
}

const sampleRow: ActivityOutputPreview = {
  outputCtx: { document: { blob: { storage_key: "abc" } } },
  outputKind: "Document",
  createdAt: "2026-05-24T12:00:00.000Z",
  expiresAt: "2026-05-25T12:00:00.000Z",
};

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
// Scenario 1 — hook signature
// ---------------------------------------------------------------------------

describe("Scenario 1 — hook signature + base behaviour", () => {
  it("fires the query against the preview-cache endpoint with the runId", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleRow));
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      previewUrl({ nodeId: NODE_ID, runId: RUN_ID }),
    );
    expect(result.current.data).toEqual(sampleRow);
    expect(result.current.error).toBeNull();
  });

  it("uses the canonical queryKey shape (`runId ?? 'latest'`)", () => {
    const withRun = previewCacheQueryKey(WORKFLOW_ID, NODE_ID, RUN_ID);
    expect(withRun).toEqual(["preview-cache", WORKFLOW_ID, NODE_ID, RUN_ID]);
    const withoutRun = previewCacheQueryKey(WORKFLOW_ID, NODE_ID, undefined);
    expect(withoutRun).toEqual([
      "preview-cache",
      WORKFLOW_ID,
      NODE_ID,
      "latest",
    ]);
  });

  it("does not re-fetch on re-render of the same (workflowId, nodeId, runId) triple", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleRow));
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
    fetchSpy.mockResolvedValue(jsonResponse(sampleRow));
    const queryClient = createQueryClient();

    renderHook(() => useActivityOutputPreview(WORKFLOW_ID, NODE_ID), {
      wrapper: buildWrapper({ queryClient, nodeStatuses: {} }),
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0][0]).toBe(previewUrl({ nodeId: NODE_ID }));
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — debounced re-fetch on status transition
// ---------------------------------------------------------------------------

describe("Scenario 2 — debounced re-fetch on status transition", () => {
  it("invalidates the preview-cache query 250ms after the status leaves `pending`", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(jsonResponse(sampleRow));
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const nodeStatusesRef: { current: NodeStatusesMap } = {
      current: { [NODE_ID]: { status: "running" } },
    };
    const { rerender } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildMutableWrapper({ queryClient, nodeStatusesRef }) },
    );

    // Initial mount fired the query. Invalidate hasn't been called yet
    // — the effect's first run snapshots the status without firing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Transition the node from `running` → `succeeded` and re-render.
    nodeStatusesRef.current = { [NODE_ID]: { status: "succeeded" } };
    rerender();

    // Before the debounce window elapses — no invalidate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_REFETCH_DEBOUNCE_MS - 1);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    // After the window elapses — exactly one invalidate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: previewCacheQueryKey(WORKFLOW_ID, NODE_ID, RUN_ID),
    });
  });

  it("coalesces multiple rapid transitions into a single invalidation", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(jsonResponse(sampleRow));
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

    // running → succeeded — schedules invalidation
    nodeStatusesRef.current = { [NODE_ID]: { status: "succeeded" } };
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    // succeeded → failed (hypothetical re-Try kicked in mid-debounce)
    nodeStatusesRef.current = { [NODE_ID]: { status: "failed" } };
    rerender();

    // Advance well past the debounce window — only ONE invalidate
    // should have fired (the latest transition's timer; the prior was
    // cancelled by the effect's cleanup).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_REFETCH_DEBOUNCE_MS + 50);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — 404 maps to `data: null`, not error
// ---------------------------------------------------------------------------

describe("Scenario 3 — 404 maps to data: null", () => {
  it("returns data === null AND error === null on 404", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        { message: "No cached output for this node" },
        { status: 404 },
      ),
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

  it("surfaces non-404 ApiErrors via the `error` field", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Boom" }, { status: 500 }),
    );
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => useActivityOutputPreview(WORKFLOW_ID, NODE_ID, RUN_ID),
      { wrapper: buildWrapper({ queryClient, nodeStatuses: {} }) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(500);
    expect(result.current.error?.message).toBe("Boom");
  });
});
