/**
 * Unit tests for `useVersionRunCount` (US-152).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-152-version-run-count-endpoint-and-badge.md.
 *
 * Follows the same fetch-stub convention as the sibling hooks
 * (`useNodeStatuses.test.tsx`, `useActivityOutputPreview.test.tsx`) —
 * vi-spied `globalThis.fetch`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import {
  ApiError,
  useVersionRunCount,
  VERSION_RUN_COUNT_STALE_TIME_MS,
} from "./useVersionRunCount";

const WORKFLOW_ID = "workflow-abc";
const VERSION_ID = "version-xyz";
const RUN_COUNT_URL = `${API_BASE_URL}/workflows/${WORKFLOW_ID}/versions/${VERSION_ID}/run-count`;

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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useVersionRunCount (US-152)", () => {
  // -----------------------------------------------------------------------
  // Scenario 4 — hook signature + base behaviour
  // -----------------------------------------------------------------------
  it("Scenario 4: fetches the run-count endpoint and surfaces `data.runCount`", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ runCount: 7 }));

    const { result } = renderHook(
      () => useVersionRunCount(WORKFLOW_ID, VERSION_ID),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ runCount: 7 });
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(RUN_COUNT_URL);
    const init = calledInit as RequestInit;
    expect(init.method).toBe("GET");
  });

  it("does NOT fire when workflowId or versionId is missing", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ runCount: 7 }));

    renderHook(() => useVersionRunCount("", VERSION_ID), {
      wrapper: createWrapper(),
    });
    renderHook(() => useVersionRunCount(WORKFLOW_ID, ""), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Scenario 4: does not poll (single fetch over multiple stale-time windows)", async () => {
    // Asserts the hook is stale-time bound, not polling-driven: a single
    // mount triggers exactly one network round-trip and never re-fires
    // on its own. Refetch only happens on explicit invalidation, which
    // we don't trigger here.
    fetchSpy.mockResolvedValue(jsonResponse({ runCount: 3 }));

    const { result } = renderHook(
      () => useVersionRunCount(WORKFLOW_ID, VERSION_ID),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ runCount: 3 });
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Wait substantially longer than the stale-time — no refetch should
    // happen. (We don't actually wait 60s; a few hundred ms suffices to
    // catch any erroneous `refetchInterval` wiring.)
    await new Promise((r) => setTimeout(r, 250));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Sanity: the constant matches the documented TTL.
    expect(VERSION_RUN_COUNT_STALE_TIME_MS).toBe(60_000);
  });

  it("Scenario 4: surfaces `ApiError` with status + message on non-2xx", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Workflow not found" }, { status: 404 }),
    );

    const { result } = renderHook(
      () => useVersionRunCount(WORKFLOW_ID, VERSION_ID),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.error).not.toBe(null);
    });
    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.status).toBe(404);
    expect(err?.message).toBe("Workflow not found");
    expect(result.current.data).toBe(null);
  });
});
