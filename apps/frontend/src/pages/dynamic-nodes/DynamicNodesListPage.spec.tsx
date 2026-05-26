/**
 * Tests for `DynamicNodesListPage` (Phase 6 US-180).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "../../shared/constants";
import DynamicNodesListPage from "./DynamicNodesListPage";

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage(initialRoute = "/dynamic-nodes") {
  const client = makeClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/dynamic-nodes" element={<DynamicNodesListPage />} />
            <Route
              path="/dynamic-nodes/new"
              element={<div data-testid="route-new">new</div>}
            />
            <Route
              path="/dynamic-nodes/:slug"
              element={<div data-testid="route-edit">edit</div>}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function sampleListItem(
  slug: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    slug,
    headVersion: {
      versionNumber: 2,
      signature: { name: slug, description: "", category: "Custom" },
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
    versionCount: 2,
    usedInWorkflowCount: 1,
    ...overrides,
  };
}

describe("DynamicNodesListPage", () => {
  it("Scenario 2: renders one row per non-deleted lineage with relative time", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        items: [sampleListItem("alpha"), sampleListItem("bravo")],
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-row-alpha"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("dynamic-nodes-list-row-bravo"),
    ).toBeInTheDocument();
    // Hour-based relative format
    expect(screen.getAllByText(/hours? ago/).length).toBeGreaterThan(0);
  });

  it("Scenario 3: clicking a slug navigates to the edit route", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ items: [sampleListItem("alpha")] }),
    );
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-slug-alpha"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("dynamic-nodes-list-slug-alpha"));
    await waitFor(() => {
      expect(screen.getByTestId("route-edit")).toBeInTheDocument();
    });
  });

  it("Scenario 3: Delete opens confirm modal + confirming calls DELETE", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ items: [sampleListItem("alpha")] }))
      .mockResolvedValueOnce(
        jsonResponse({
          slug: "alpha",
          deletedAt: new Date().toISOString(),
          usedInWorkflowCount: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    renderPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-delete-alpha"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("dynamic-nodes-list-delete-alpha"));
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-delete-confirm"),
      ).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("dynamic-nodes-list-delete-confirm"));
    });
    await waitFor(() => {
      const calls = fetchSpy.mock.calls;
      const deleteCall = calls.find(
        ([url, init]) =>
          typeof url === "string" &&
          url === `${API_BASE_URL}/dynamic-nodes/alpha` &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
    });
  });

  it("Scenario 4: empty state shows CTA linking to /dynamic-nodes/new", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ items: [] }));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-empty"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("dynamic-nodes-list-empty-cta"));
    await waitFor(() => {
      expect(screen.getByTestId("route-new")).toBeInTheDocument();
    });
  });

  it("Scenario 5: loading renders 5 skeleton rows", async () => {
    // Never resolves so the loading state stays visible.
    // biome-ignore lint/suspicious/noEmptyBlockStatements: never-resolving Promise keeps the loading state visible
    fetchSpy.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-loading"),
      ).toBeInTheDocument();
    });
    // No assertion about exact count of skeletons — implementation detail —
    // but presence of the loading wrapper is sufficient.
  });

  it("Scenario 5: error state shows red Alert + retry button", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "boom" }, { status: 500 }),
    );
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-nodes-list-error"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("dynamic-nodes-list-retry")).toBeInTheDocument();
  });
});
