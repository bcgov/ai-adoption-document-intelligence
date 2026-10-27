/**
 * Tests for `useDynamicNode` + `useDynamicNodeList` hooks
 * (Phase 6 US-176 Scenarios 3 + 4).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../../../auth/AuthContext";
import { API_BASE_URL } from "../../../shared/constants";
import { useDynamicNode } from "./useDynamicNode";
import { useDynamicNodeDelete } from "./useDynamicNodeDelete";
import { useDynamicNodeList } from "./useDynamicNodeList";
import { useDynamicNodePublish } from "./useDynamicNodePublish";

// These hooks call `useGroup()` to scope each request to the active group
// (`x-group-id`). Mock it rather than dragging in `GroupProvider` (which
// transitively pulls in `AuthProvider`) — the same convention the sibling
// `useActivityCatalog.spec.tsx` uses.
vi.mock("../../../auth/GroupContext", async () => {
  const actual = await vi.importActual<
    typeof import("../../../auth/GroupContext")
  >("../../../auth/GroupContext");
  return {
    ...actual,
    useGroup: () => ({
      availableGroups: [] as Group[],
      activeGroup: { id: "test-group-id", name: "Test Group" } as Group,
      setActiveGroup: vi.fn(),
    }),
  };
});

/** Read the `x-group-id` header off a recorded `fetch` call. */
function groupHeaderOf(call: Parameters<typeof fetch>): string | undefined {
  const init = call[1];
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers["x-group-id"];
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { Wrapper, client };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDynamicNode (US-176 Scenario 3)", () => {
  it("GETs /api/dynamic-nodes/:slug and surfaces the detail payload", async () => {
    const detail = {
      slug: "alpha",
      headVersion: {
        versionNumber: 1,
        signature: { name: "alpha" },
        publishedAt: "2026-05-24T10:00:00.000Z",
      },
      versions: [
        {
          versionNumber: 1,
          script: "// v1",
          signature: { name: "alpha" },
          allowNet: [],
          deterministic: false,
          publishedAt: "2026-05-24T10:00:00.000Z",
        },
      ],
    };
    fetchSpy.mockResolvedValue(jsonResponse(detail));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNode("alpha"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.slug).toBe("alpha");
    });
    expect(result.current.data?.versions[0].script).toBe("// v1");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/dynamic-nodes/alpha`);
    expect((init as RequestInit | undefined)?.method).toBe("GET");
  });

  it("is disabled (no fetch) when slug is undefined", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNode(undefined), {
      wrapper: Wrapper,
    });
    // Give the hook a tick to (NOT) fire.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});

describe("useDynamicNodeList (US-176 Scenario 3)", () => {
  it("GETs /api/dynamic-nodes and returns the list response", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        items: [
          {
            slug: "alpha",
            headVersion: {
              versionNumber: 1,
              signature: { name: "alpha" },
              publishedAt: "2026-05-24T10:00:00.000Z",
            },
            versionCount: 1,
            usedInWorkflowCount: 0,
          },
        ],
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodeList(), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.data?.items.length).toBe(1);
    });
    expect(result.current.data?.items[0].slug).toBe("alpha");
  });
});

describe("Cross-hook invalidation (US-176 Scenario 4)", () => {
  it("a successful publish invalidates the detail + list keys", async () => {
    // GET detail → publish PUT → re-fetch GET detail.
    const initialDetail = {
      slug: "beta",
      headVersion: {
        versionNumber: 1,
        signature: { name: "beta" },
        publishedAt: "2026-05-23T10:00:00.000Z",
      },
      versions: [
        {
          versionNumber: 1,
          script: "// v1",
          signature: { name: "beta" },
          allowNet: [],
          deterministic: false,
          publishedAt: "2026-05-23T10:00:00.000Z",
        },
      ],
    };
    const refreshedDetail = {
      ...initialDetail,
      headVersion: { ...initialDetail.headVersion, versionNumber: 2 },
      versions: [
        {
          versionNumber: 2,
          script: "// v2",
          signature: { name: "beta" },
          allowNet: [],
          deterministic: false,
          publishedAt: "2026-05-24T10:00:00.000Z",
        },
        ...initialDetail.versions,
      ],
    };
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(initialDetail))
      .mockResolvedValueOnce(
        jsonResponse({
          slug: "beta",
          version: 2,
          signature: { name: "beta" },
          errors: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(refreshedDetail));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => ({
        detail: useDynamicNode("beta"),
        publish: useDynamicNodePublish(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.detail.data?.headVersion.versionNumber).toBe(1);
    });

    await act(async () => {
      await result.current.publish.mutateAsync({
        slug: "beta",
        script: "// v2",
      });
    });

    await waitFor(() => {
      expect(result.current.detail.data?.headVersion.versionNumber).toBe(2);
    });
  });

  it("a successful delete invalidates the detail + list keys", async () => {
    const initialDetail = {
      slug: "gamma",
      headVersion: {
        versionNumber: 1,
        signature: { name: "gamma" },
        publishedAt: "2026-05-23T10:00:00.000Z",
      },
      versions: [
        {
          versionNumber: 1,
          script: "// v1",
          signature: { name: "gamma" },
          allowNet: [],
          deterministic: false,
          publishedAt: "2026-05-23T10:00:00.000Z",
        },
      ],
    };
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(initialDetail))
      .mockResolvedValueOnce(
        jsonResponse({
          slug: "gamma",
          deletedAt: "2026-05-25T00:00:00Z",
          usedInWorkflowCount: 0,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: "not found" }, { status: 404 }),
      );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => ({
        detail: useDynamicNode("gamma"),
        del: useDynamicNodeDelete(),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.detail.data?.slug).toBe("gamma");
    });

    await act(async () => {
      await result.current.del.mutateAsync("gamma");
    });

    // After invalidation the detail refetches; on 404 the error
    // surfaces via the query's error field.
    await waitFor(() => {
      expect(result.current.detail.error).not.toBeNull();
    });
  });
});

/**
 * Every `/api/dynamic-nodes/*` endpoint resolves the calling group via the
 * backend's `resolveCallingGroupId`, which returns `undefined` group ids for a
 * system administrator and therefore REQUIRES an explicit group hint. Without
 * one the whole feature 400s ("System-admin callers must include a `groupId`
 * …") for every admin user — the list page, the editor, and the canvas's "Edit
 * script" action alike.
 *
 * `useActivityCatalog` already sent the hint; these five calls did not, so the
 * backend fix that taught the controller to accept it (5c777d61) never reached
 * the management surface.
 */
describe("group scoping — every call carries the active group", () => {
  it("sends x-group-id on GET /dynamic-nodes/:slug", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ slug: "alpha", headVersion: {}, versions: [] }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNode("alpha"), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.data?.slug).toBe("alpha");
    });
    expect(groupHeaderOf(fetchSpy.mock.calls[0])).toBe("test-group-id");
  });

  it("sends x-group-id on GET /dynamic-nodes", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ items: [] }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodeList(), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.data?.items).toEqual([]);
    });
    expect(groupHeaderOf(fetchSpy.mock.calls[0])).toBe("test-group-id");
  });

  it("sends x-group-id on POST /dynamic-nodes (create-mode publish)", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ slug: "alpha", version: 1, signature: {}, errors: [] }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodePublish(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ script: "// v1" });
    });
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API_BASE_URL}/dynamic-nodes`);
    expect(groupHeaderOf(fetchSpy.mock.calls[0])).toBe("test-group-id");
  });

  it("sends x-group-id on PUT /dynamic-nodes/:slug (update-mode publish)", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ slug: "alpha", version: 2, signature: {}, errors: [] }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodePublish(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ slug: "alpha", script: "// v2" });
    });
    expect(groupHeaderOf(fetchSpy.mock.calls[0])).toBe("test-group-id");
  });

  it("sends x-group-id on DELETE /dynamic-nodes/:slug", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        slug: "alpha",
        deletedAt: "2026-07-27T00:00:00.000Z",
        usedInWorkflowCount: 0,
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodeDelete(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync("alpha");
    });
    expect(groupHeaderOf(fetchSpy.mock.calls[0])).toBe("test-group-id");
  });

  it("keeps the JSON content-type alongside the group header on publish", async () => {
    // The header object is merged, not replaced — a lost Content-Type would
    // make Nest reject the body before `resolveCallingGroupId` ever runs.
    fetchSpy.mockResolvedValue(
      jsonResponse({ slug: "alpha", version: 1, signature: {}, errors: [] }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDynamicNodePublish(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ script: "// v1" });
    });
    const headers = (fetchSpy.mock.calls[0][1]?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
