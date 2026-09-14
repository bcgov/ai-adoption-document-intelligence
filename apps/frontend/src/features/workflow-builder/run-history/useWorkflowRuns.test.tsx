/**
 * Unit tests for `useWorkflowRuns` (US-153).
 *
 * Covers Scenario 2 (hook signature + query key + getNextPageParam) and
 * Scenario 5 (cursor pagination via `fetchNextPage`).
 *
 * Mirrors the fetch-stub convention of sibling hooks
 * (`useNodeStatuses.test.tsx`, `useVersionRunCount.test.tsx`) — vi-spied
 * `globalThis.fetch`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import {
  ApiError,
  type ListRunsFilters,
  type ListRunsResponse,
  useWorkflowRuns,
  workflowRunsQueryKey,
} from "./useWorkflowRuns";

const WORKFLOW_ID = "workflow-abc";
const RUNS_BASE_URL = `${API_BASE_URL}/workflows/${WORKFLOW_ID}/runs`;

function createWrapper(): (props: {
  children: ReactNode;
}) => ReturnType<typeof createElement> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
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

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useWorkflowRuns (US-153)", () => {
  // -----------------------------------------------------------------------
  // Scenario 2 — query-key shape
  // -----------------------------------------------------------------------
  it("Scenario 2: builds the documented query key", () => {
    const filters: ListRunsFilters = { status: "succeeded" };
    expect(workflowRunsQueryKey(WORKFLOW_ID, filters)).toEqual([
      "workflow-runs",
      WORKFLOW_ID,
      filters,
    ]);
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — initial page fetch + getNextPageParam wiring
  // -----------------------------------------------------------------------
  it("Scenario 2: fetches initial page and exposes nextCursor via hasNextPage", async () => {
    const firstPage: ListRunsResponse = {
      runs: [
        {
          runId: "run-1",
          workflowVersionId: "wv-1",
          versionNumber: 1,
          status: "succeeded",
          startedAt: "2026-05-24T12:00:00.000Z",
        },
      ],
      nextCursor: "cursor-2",
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(firstPage));

    const { result } = renderHook(() => useWorkflowRuns(WORKFLOW_ID, {}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]).toEqual(firstPage);
    expect(result.current.hasNextPage).toBe(true);

    // First-call URL has no query string (no cursor, no filters).
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(RUNS_BASE_URL);
  });

  // -----------------------------------------------------------------------
  // Scenario 5 — `fetchNextPage` triggers the next-cursor request
  // -----------------------------------------------------------------------
  it("Scenario 5: fetchNextPage requests the next page using the cursor", async () => {
    const firstPage: ListRunsResponse = {
      runs: [
        {
          runId: "run-1",
          workflowVersionId: "wv-1",
          versionNumber: 1,
          status: "succeeded",
          startedAt: "2026-05-24T12:00:00.000Z",
        },
      ],
      nextCursor: "cursor-2",
    };
    const secondPage: ListRunsResponse = {
      runs: [
        {
          runId: "run-2",
          workflowVersionId: "wv-1",
          versionNumber: 1,
          status: "failed",
          startedAt: "2026-05-24T11:00:00.000Z",
        },
      ],
      nextCursor: null,
    };
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage));

    const { result } = renderHook(() => useWorkflowRuns(WORKFLOW_ID, {}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2);
    });
    expect(result.current.hasNextPage).toBe(false);

    // The second call's URL must carry `cursor=cursor-2`.
    const [secondCallUrl] = fetchSpy.mock.calls[1];
    expect(String(secondCallUrl)).toContain("cursor=cursor-2");
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — filter values reach the request URL
  // -----------------------------------------------------------------------
  it("Scenario 2: filter values propagate to the request URL", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ runs: [], nextCursor: null }));

    const filters: ListRunsFilters = {
      status: "succeeded",
      startedAfter: "2026-05-01T00:00:00.000Z",
      startedBefore: "2026-05-31T23:59:59.999Z",
      workflowVersionId: "wv-1",
    };
    renderHook(() => useWorkflowRuns(WORKFLOW_ID, filters), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const [calledUrl] = fetchSpy.mock.calls[0];
    const url = String(calledUrl);
    expect(url).toContain("status=succeeded");
    expect(url).toContain("startedAfter=2026-05-01T00%3A00%3A00.000Z");
    expect(url).toContain("startedBefore=2026-05-31T23%3A59%3A59.999Z");
    expect(url).toContain("workflowVersionId=wv-1");
  });

  it("does NOT fire when workflowId is empty", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ runs: [], nextCursor: null }));

    renderHook(() => useWorkflowRuns("", {}), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces ApiError with status + message on non-2xx", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Workflow not found" }, { status: 404 }),
    );

    const { result } = renderHook(() => useWorkflowRuns(WORKFLOW_ID, {}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.status).toBe(404);
    expect(err?.message).toBe("Workflow not found");
  });
});
