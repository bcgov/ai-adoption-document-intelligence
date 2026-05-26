/**
 * Tests for `DynamicNodeEditPage` (Phase 6 US-181).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DynamicNodeEditPage from "./DynamicNodeEditPage";

// Stub CodeMirror (browser primitives jsdom lacks).
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="codemirror-stub"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

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

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function sampleDetail(slug: string) {
  return {
    slug,
    headVersion: {
      versionNumber: 1,
      signature: {
        name: slug,
        description: "",
        category: "Custom",
        deterministic: false,
        inputs: [],
        outputs: [],
        paramsSchema: {},
        allowNet: [],
        timeoutMs: 5000,
        maxMemoryMB: 128,
      },
      publishedAt: "2026-05-24T10:00:00.000Z",
    },
    versions: [
      {
        versionNumber: 1,
        script: "// v1",
        signature: {
          name: slug,
          description: "",
          category: "Custom",
          deterministic: false,
          inputs: [],
          outputs: [],
          paramsSchema: {},
          allowNet: [],
          timeoutMs: 5000,
          maxMemoryMB: 128,
        },
        allowNet: [],
        deterministic: false,
        publishedAt: "2026-05-24T10:00:00.000Z",
      },
    ],
  };
}

function renderEditPage(slug: string) {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={[`/dynamic-nodes/${slug}`]}>
            <Routes>
              <Route
                path="/dynamic-nodes"
                element={<div data-testid="route-list" />}
              />
              <Route
                path="/dynamic-nodes/:slug"
                element={<DynamicNodeEditPage />}
              />
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("DynamicNodeEditPage", () => {
  it("Scenario 2: reads slug from useParams + mounts editor in edit mode", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleDetail("alpha")));
    renderEditPage("alpha");
    await waitFor(() => {
      expect(screen.getByTestId("dynamic-node-edit-page")).toBeInTheDocument();
    });
    expect(screen.getByText("Editing alpha")).toBeInTheDocument();
  });

  it("Scenario 2: renders 'not found' on 404", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "not found" }, { status: 404 }),
    );
    renderEditPage("missing");
    await waitFor(() => {
      expect(
        screen.getByTestId("dynamic-node-edit-page-not-found"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("dynamic-node-edit-page-back-link"),
    ).toBeInTheDocument();
  });
});
