/**
 * Unit tests for `useNodeStatuses` (US-137).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-137-use-node-statuses-hook.md.
 *
 * MSW is not part of the frontend test toolkit (see
 * apps/frontend/package.json — only vitest + @testing-library/react),
 * so we follow the existing hook-test convention from the sibling
 * Phase 8 hook `useSourceUpload.test.ts` and stub the global `fetch`
 * via `vi.spyOn`. Functionally equivalent for the contracts asserted.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";
import type { NodeStatusesMap } from "./node-status.types";
import {
  NODE_STATUSES_POLL_INTERVAL_MS,
  useNodeStatuses,
} from "./useNodeStatuses";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "workflow-abc";
const RUN_ID = "run-xyz";
const STATUSES_URL = `${API_BASE_URL}/workflows/${WORKFLOW_ID}/runs/${RUN_ID}/node-statuses`;

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

const runningMap: NodeStatusesMap = {
  "node-1": { status: "running", startedAt: "2026-05-24T12:00:00.000Z" },
  "node-2": { status: "pending" },
};

const terminalMap: NodeStatusesMap = {
  "node-1": {
    status: "succeeded",
    startedAt: "2026-05-24T12:00:00.000Z",
    endedAt: "2026-05-24T12:00:01.500Z",
  },
  "node-2": {
    status: "skipped",
    cacheHit: { configHash: "cfg-1", inputHash: "in-1" },
  },
};

// ---------------------------------------------------------------------------
// Global fetch spy — reset per test.
// ---------------------------------------------------------------------------

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — Hook signature + base behaviour
// ---------------------------------------------------------------------------

describe("Scenario 1 — hook signature + base behaviour", () => {
  it("fires the query against the node-statuses endpoint when runId is set", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(runningMap));

    const { result } = renderHook(() => useNodeStatuses(WORKFLOW_ID, RUN_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(runningMap);
    expect(fetchSpy).toHaveBeenCalled();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(STATUSES_URL);
    const init = calledInit as RequestInit;
    expect(init.method).toBe("GET");
  });

  it("does NOT fire when runId is null", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(runningMap));

    const { result } = renderHook(() => useNodeStatuses(WORKFLOW_ID, null), {
      wrapper: createWrapper(),
    });

    // Give TanStack a tick — query must remain disabled.
    await new Promise((r) => setTimeout(r, 25));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("does NOT fire when opts.active = false coexists with a null runId", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(runningMap));

    renderHook(() => useNodeStatuses(WORKFLOW_ID, null, { active: false }), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Polling stops at terminal
// ---------------------------------------------------------------------------

describe("Scenario 3 — polling stops at terminal", () => {
  it("stops firing once every node is in a terminal state", async () => {
    // First response is non-terminal, second response is terminal. After the
    // terminal response, no further refetches should fire even after many
    // poll intervals elapse.
    fetchSpy.mockImplementation(async () => {
      const callIdx = fetchSpy.mock.calls.length;
      if (callIdx === 1) return jsonResponse(runningMap);
      return jsonResponse(terminalMap);
    });

    const { result } = renderHook(() => useNodeStatuses(WORKFLOW_ID, RUN_ID), {
      wrapper: createWrapper(),
    });

    // Wait for the first fetch to land (real timers — TanStack schedules
    // the initial fetch as a microtask).
    await waitFor(() => {
      expect(result.current.data).toEqual(runningMap);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Wait for the second fetch (poll #2) to land — the terminal response.
    await waitFor(
      () => {
        expect(result.current.data).toEqual(terminalMap);
      },
      { timeout: NODE_STATUSES_POLL_INTERVAL_MS * 2 + 500 },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Now wait several poll intervals — the hook must NOT poll again
    // because every status is terminal.
    await new Promise((r) =>
      setTimeout(r, NODE_STATUSES_POLL_INTERVAL_MS * 2 + 300),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT consider an empty map terminal (keeps polling)", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}));

    renderHook(() => useNodeStatuses(WORKFLOW_ID, RUN_ID), {
      wrapper: createWrapper(),
    });

    // First fetch lands quickly.
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Wait long enough for a second poll to fire — empty map is not terminal.
    await waitFor(
      () => {
        expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: NODE_STATUSES_POLL_INTERVAL_MS * 2 + 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — `opts.active = false` mode for replay
// ---------------------------------------------------------------------------

describe("Scenario 4 — opts.active = false fires once + stops", () => {
  it("fires the query exactly once and never polls", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(runningMap));

    const { result } = renderHook(
      () => useNodeStatuses(WORKFLOW_ID, RUN_ID, { active: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(runningMap);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Even with a non-terminal status map, polling must NOT fire because
    // opts.active = false forces refetchInterval to false. Wait several
    // poll intervals to confirm.
    await new Promise((r) =>
      setTimeout(r, NODE_STATUSES_POLL_INTERVAL_MS * 2 + 300),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — 404 and 410 surface as ApiError via the `error` field
// ---------------------------------------------------------------------------

describe("Scenario 5 — 404 / 410 surface as typed ApiError", () => {
  it("populates `error` with an ApiError carrying status=404", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "Run not found" }, { status: 404 }),
    );

    const { result } = renderHook(() => useNodeStatuses(WORKFLOW_ID, RUN_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe("Run not found");
  });

  it("populates `error` with an ApiError carrying status=410", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "Run retention expired" }, { status: 410 }),
    );

    const { result } = renderHook(() => useNodeStatuses(WORKFLOW_ID, RUN_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(410);
    expect((err as ApiError).message).toBe("Run retention expired");
  });
});
