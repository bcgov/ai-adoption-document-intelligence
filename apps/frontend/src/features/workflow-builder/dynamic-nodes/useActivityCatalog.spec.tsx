/**
 * Tests for the Phase 6 US-175 frontend catalog hook + mutation
 * invalidation seam.
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/user_stories/US-175-use-activity-catalog-hot-reload.md.
 *
 * Uses the same `vi.spyOn(globalThis, "fetch")` convention as the
 * sibling hooks (`useActivityOutputPreview.test.tsx`, etc.).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import type { ActivityCatalogEntry } from "./activity-catalog.types";
import { useActivityCatalog } from "./useActivityCatalog";
import { useDynamicNodeDelete } from "./useDynamicNodeDelete";
import { useDynamicNodePublish } from "./useDynamicNodePublish";

function createWrapper(): {
  Wrapper: (props: { children: ReactNode }) => ReturnType<typeof createElement>;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { Wrapper, client };
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

function fakeStaticEntry(): ActivityCatalogEntry {
  return {
    activityType: "document.split",
    displayName: "Split Document",
    category: "Document Handling",
    description: "Split a multi-page PDF",
    iconHint: "doc",
    colorHint: "blue",
    inputs: [{ name: "document", label: "Document", kind: "Document" }],
    outputs: [{ name: "segments", label: "Segments", kind: "Segment[]" }],
  };
}

function fakeDynamicEntry(slug: string, version = 1): ActivityCatalogEntry {
  return {
    activityType: `dyn.${slug}`,
    category: "Custom",
    description: `desc-${slug}`,
    iconHint: "dyn",
    colorHint: "dyn",
    inputs: [],
    outputs: [{ name: "result", label: "result", kind: "Artifact" }],
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    nonCacheable: true,
    dynamicNodeSlug: slug,
    dynamicNodeVersion: version,
    allowNet: [],
  };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useActivityCatalog (US-175)", () => {
  // -----------------------------------------------------------------------
  // Scenario 1 — hook sees merged entries
  // -----------------------------------------------------------------------
  it("Scenario 1: returns merged static + dynamic entries", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        entries: [fakeStaticEntry(), fakeDynamicEntry("alpha")],
      }),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useActivityCatalog(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });
    expect(result.current.entries[0].activityType).toBe("document.split");
    expect(result.current.entries[1].dynamicNodeSlug).toBe("alpha");
    expect(result.current.entries[1].colorHint).toBe("dyn");
    expect(result.current.error).toBe(null);
    expect(result.current.isLoading).toBe(false);

    // Scenario 5 — exactly one fetch to /api/activity-catalog
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(`${API_BASE_URL}/activity-catalog`);
  });

  it("returns an empty list while the query is in flight", async () => {
    // Never-resolving fetch keeps the hook in pending state.
    fetchSpy.mockReturnValue(new Promise(() => undefined));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useActivityCatalog(), {
      wrapper: Wrapper,
    });
    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("surfaces a typed ApiError on non-2xx", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "no access" }, { status: 403 }),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useActivityCatalog(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error?.status).toBe(403);
  });
});

describe("useDynamicNodePublish (US-175 Scenarios 2 + 3)", () => {
  it("POST success invalidates the catalog query (Scenario 2)", async () => {
    const initial = jsonResponse({
      entries: [fakeStaticEntry()],
    });
    const refreshed = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("new-node")],
    });
    const publishResp = jsonResponse({
      slug: "new-node",
      version: 1,
      signature: {
        name: "new-node",
        description: "x",
        category: "Custom",
        deterministic: false,
        inputs: [],
        outputs: [],
        paramsSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowNet: [],
        timeoutMs: 60_000,
        maxMemoryMB: 256,
      },
      errors: [],
    });

    // First GET → initial; mutation → publishResp; second GET (after
    // invalidation) → refreshed.
    fetchSpy
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(publishResp)
      .mockResolvedValueOnce(refreshed);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        catalog: useActivityCatalog(),
        publish: useDynamicNodePublish(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(1);
    });

    await act(async () => {
      await result.current.publish.mutateAsync({ script: "/* */" });
    });

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(2);
    });
    expect(
      result.current.catalog.entries.some(
        (e) => e.dynamicNodeSlug === "new-node",
      ),
    ).toBe(true);

    // The POST hit /api/dynamic-nodes — sanity check the URL.
    const postCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        url === `${API_BASE_URL}/dynamic-nodes` &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCall).toBeDefined();
  });

  it("PUT success invalidates the catalog query (Scenario 3)", async () => {
    const initial = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("existing", 1)],
    });
    const publishResp = jsonResponse({
      slug: "existing",
      version: 2,
      signature: {
        name: "existing",
        description: "x",
        category: "Custom",
        deterministic: false,
        inputs: [],
        outputs: [],
        paramsSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowNet: [],
        timeoutMs: 60_000,
        maxMemoryMB: 256,
      },
      errors: [],
    });
    const refreshed = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("existing", 2)],
    });

    fetchSpy
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(publishResp)
      .mockResolvedValueOnce(refreshed);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        catalog: useActivityCatalog(),
        publish: useDynamicNodePublish(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(2);
    });
    expect(result.current.catalog.entries[1].dynamicNodeVersion).toBe(1);

    await act(async () => {
      await result.current.publish.mutateAsync({
        slug: "existing",
        script: "/* updated */",
      });
    });

    await waitFor(() => {
      expect(result.current.catalog.entries[1].dynamicNodeVersion).toBe(2);
    });

    const putCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        url === `${API_BASE_URL}/dynamic-nodes/existing` &&
        (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCall).toBeDefined();
  });

  it("failed publish does NOT invalidate the catalog", async () => {
    const initial = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("a")],
    });
    const failResp = jsonResponse({ message: "bad script" }, { status: 400 });

    fetchSpy.mockResolvedValueOnce(initial).mockResolvedValueOnce(failResp);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        catalog: useActivityCatalog(),
        publish: useDynamicNodePublish(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(2);
    });

    await act(async () => {
      await result.current.publish
        .mutateAsync({ script: "/* */" })
        .catch(() => undefined);
    });

    // Mutation failed → cache should NOT have been busted. Confirm
    // we only saw two fetches: the initial GET + the POST.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("useDynamicNodeDelete (US-175 Scenario 4)", () => {
  it("DELETE success invalidates the catalog query", async () => {
    const initial = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("to-delete")],
    });
    const deleteResp = jsonResponse({
      slug: "to-delete",
      deletedAt: "2026-05-25T00:00:00Z",
      usedInWorkflowCount: 0,
    });
    const refreshed = jsonResponse({
      entries: [fakeStaticEntry()],
    });

    fetchSpy
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(deleteResp)
      .mockResolvedValueOnce(refreshed);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        catalog: useActivityCatalog(),
        del: useDynamicNodeDelete(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(2);
    });

    await act(async () => {
      await result.current.del.mutateAsync("to-delete");
    });

    await waitFor(() => {
      expect(result.current.catalog.entries).toHaveLength(1);
    });
    expect(
      result.current.catalog.entries.some(
        (e) => e.dynamicNodeSlug === "to-delete",
      ),
    ).toBe(false);

    const deleteCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        url === `${API_BASE_URL}/dynamic-nodes/to-delete` &&
        (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });
});

describe("cross-group isolation (US-175 Scenario 6)", () => {
  it("the catalog hook scopes to whatever the calling key returns (no per-group query key needed)", async () => {
    // The merged endpoint scopes itself by the caller's identity — the
    // hook doesn't need to know about groups. Two consecutive renders
    // with different fetch responses simulate the page loading under
    // group A then later under group B (after a key swap).
    const respGroupA = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("only-in-a")],
    });
    const respGroupB = jsonResponse({
      entries: [fakeStaticEntry(), fakeDynamicEntry("only-in-b")],
    });

    fetchSpy
      .mockResolvedValueOnce(respGroupA)
      .mockResolvedValueOnce(respGroupB);

    const { Wrapper: WrapperA } = createWrapper();
    const { result: resultA } = renderHook(() => useActivityCatalog(), {
      wrapper: WrapperA,
    });
    await waitFor(() => {
      expect(
        resultA.current.entries.some((e) => e.dynamicNodeSlug === "only-in-a"),
      ).toBe(true);
    });

    const { Wrapper: WrapperB } = createWrapper();
    const { result: resultB } = renderHook(() => useActivityCatalog(), {
      wrapper: WrapperB,
    });
    await waitFor(() => {
      expect(
        resultB.current.entries.some((e) => e.dynamicNodeSlug === "only-in-b"),
      ).toBe(true);
    });
    expect(
      resultB.current.entries.some((e) => e.dynamicNodeSlug === "only-in-a"),
    ).toBe(false);
  });
});
