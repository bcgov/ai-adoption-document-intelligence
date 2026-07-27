/**
 * Tests for `DynamicNodeNewPage` (Phase 6 US-181).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Group } from "../../auth/AuthContext";
import DynamicNodeNewPage from "./DynamicNodeNewPage";

// The dynamic-node hooks scope every request to the active group
// (`x-group-id`). Mock `useGroup` rather than mounting `GroupProvider`, which
// transitively needs `AuthProvider`.
vi.mock("../../auth/GroupContext", async () => {
  const actual = await vi.importActual<
    typeof import("../../auth/GroupContext")
  >("../../auth/GroupContext");
  return {
    ...actual,
    useGroup: () => ({
      availableGroups: [] as Group[],
      activeGroup: { id: "test-group-id", name: "Test Group" } as Group,
      setActiveGroup: vi.fn(),
    }),
  };
});

// Stub the CodeMirror editor (browser primitives jsdom lacks).
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

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe("DynamicNodeNewPage", () => {
  it("mounts the DynamicNodeEditor in create mode with full-page layout", async () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <MantineProvider>
          <ModalsProvider>
            <Notifications />
            <MemoryRouter initialEntries={["/dynamic-nodes/new"]}>
              <Routes>
                <Route
                  path="/dynamic-nodes/new"
                  element={<DynamicNodeNewPage />}
                />
                <Route
                  path="/dynamic-nodes/:slug"
                  element={<div data-testid="route-edit" />}
                />
              </Routes>
            </MemoryRouter>
          </ModalsProvider>
        </MantineProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dynamic-node-editor")).toBeInTheDocument();
    });
    const editor = screen.getByTestId("dynamic-node-editor");
    expect(editor.getAttribute("data-layout")).toBe("full-page");
    // The header text in create mode reads "New dynamic node".
    expect(screen.getByText("New dynamic node")).toBeInTheDocument();
  });
});
