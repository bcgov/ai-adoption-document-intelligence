/**
 * Tests for `useDynamicNode` + `useDynamicNodeList` hooks
 * (Phase 6 US-176 Scenarios 3 + 4).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "../../../shared/constants";
import { useDynamicNode } from "./useDynamicNode";
import { useDynamicNodeDelete } from "./useDynamicNodeDelete";
import { useDynamicNodeList } from "./useDynamicNodeList";
import { useDynamicNodePublish } from "./useDynamicNodePublish";

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
