/**
 * Tests for RootLayout route predicates that drive the AppShell.Main
 * layout branch (padded / full-viewport workspace / full-bleed editor).
 *
 * The visual wiring (class names on AppShell.Main, outlet height) is verified
 * live; here we lock the routing logic and — critically — that the workspace
 * and editor predicates are mutually exclusive, since they select competing
 * full-height branches.
 */

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  isAgentChatRoute,
  isEditorRoute,
  isWorkspaceRoute,
  RootLayout,
} from "./RootLayout";

// The BC DS header/footer are web-component wrappers that do not render in
// jsdom; the layout only uses them as slots, so stub them to pass children
// through.
vi.mock("@bcgov/design-system-react-components", () => ({
  Header: ({ children }: { children?: ReactNode }) => (
    <div data-testid="bcds-header">{children}</div>
  ),
  Footer: () => <div data-testid="bcds-footer" />,
}));

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn(), user: undefined }),
}));

vi.mock("../components/group/GroupSelector", () => ({
  GroupSelector: () => <div data-testid="group-selector" />,
}));

// RootLayout reads the active group to decide whether to show admin-only
// navigation. No group means a non-admin user, which is what these cases
// assert against.
vi.mock("@/auth/GroupContext", () => ({
  useGroup: () => ({
    availableGroups: [],
    activeGroup: null,
    setActiveGroup: vi.fn(),
  }),
}));

// The real drawer drags in the assistant-ui runtime and TanStack Query; the
// question here is only whether the layout mounts it at all.
vi.mock("../features/agent-chat/AgentChatDrawer", () => ({
  AgentChatDrawer: () => <div data-testid="agent-chat-drawer" />,
}));

function renderLayoutAt(pathname: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <Routes>
          <Route path="*" element={<RootLayout />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("isEditorRoute", () => {
  it("matches the create route", () => {
    expect(isEditorRoute("/workflows/create")).toBe(true);
  });

  it("matches the canonical edit route", () => {
    expect(isEditorRoute("/workflows/abc123/edit")).toBe(true);
    expect(isEditorRoute("/workflows/some-lineage-id/edit")).toBe(true);
  });

  it("does NOT match the workflows list route", () => {
    expect(isEditorRoute("/workflows")).toBe(false);
  });

  it("does NOT match the by-slug redirect route (extra segment)", () => {
    // This route only redirects to /workflows/:id/edit, so it must not be
    // treated as the editor itself.
    expect(isEditorRoute("/workflows/by-slug/my-slug/edit")).toBe(false);
  });

  it("does NOT match unrelated or partial paths", () => {
    expect(isEditorRoute("/documents")).toBe(false);
    expect(isEditorRoute("/workflows/create/extra")).toBe(false);
    expect(isEditorRoute("/workflows/abc123")).toBe(false);
    expect(isEditorRoute("/workflows/abc123/edit/steps")).toBe(false);
  });
});

describe("isWorkspaceRoute", () => {
  it("matches template-model, review and benchmarking-review routes", () => {
    expect(isWorkspaceRoute("/template-models/m1/document/d1")).toBe(true);
    expect(isWorkspaceRoute("/review/doc-1")).toBe(true);
    expect(
      isWorkspaceRoute("/benchmarking/datasets/ds1/versions/v1/review/doc-1"),
    ).toBe(true);
  });

  it("does NOT match editor routes", () => {
    expect(isWorkspaceRoute("/workflows/create")).toBe(false);
    expect(isWorkspaceRoute("/workflows/abc123/edit")).toBe(false);
  });
});

describe("isAgentChatRoute", () => {
  it("matches every route in the workflow section", () => {
    expect(isAgentChatRoute("/workflows")).toBe(true);
    expect(isAgentChatRoute("/workflows/create")).toBe(true);
    expect(isAgentChatRoute("/workflows/abc123/edit")).toBe(true);
    expect(isAgentChatRoute("/workflows/by-slug/my-slug/edit")).toBe(true);
    expect(isAgentChatRoute("/workflows/dev-form-preview")).toBe(true);
  });

  it("does NOT match routes outside the workflow section", () => {
    expect(isAgentChatRoute("/")).toBe(false);
    expect(isAgentChatRoute("/documents")).toBe(false);
    expect(isAgentChatRoute("/dynamic-nodes")).toBe(false);
    expect(isAgentChatRoute("/review/doc-1")).toBe(false);
    expect(isAgentChatRoute("/benchmarking/datasets")).toBe(false);
  });

  it("does NOT match a path that merely starts with the same characters", () => {
    expect(isAgentChatRoute("/workflows-archive")).toBe(false);
  });
});

describe("the agent chat entry point is scoped to the workflow routes", () => {
  it("renders neither the icon nor the drawer on a non-workflow route", () => {
    renderLayoutAt("/documents");
    expect(screen.queryByTestId("agent-chat-icon")).toBeNull();
    expect(screen.queryByTestId("agent-chat-drawer")).toBeNull();
  });

  it("renders the icon and the drawer on the workflow editor route", () => {
    renderLayoutAt("/workflows/abc123/edit");
    expect(screen.getByTestId("agent-chat-icon")).toBeInTheDocument();
    expect(screen.getByTestId("agent-chat-drawer")).toBeInTheDocument();
  });

  it("renders the icon on the workflows list route", () => {
    renderLayoutAt("/workflows");
    expect(screen.getByTestId("agent-chat-icon")).toBeInTheDocument();
  });
});

describe("workspace vs editor predicates are mutually exclusive", () => {
  const paths = [
    "/workflows/create",
    "/workflows/abc123/edit",
    "/workflows/by-slug/my-slug/edit",
    "/workflows",
    "/template-models/m1/document/d1",
    "/review/doc-1",
    "/benchmarking/datasets/ds1/versions/v1/review/doc-1",
    "/documents",
    "/",
  ];

  it("never classifies a path as both workspace and editor", () => {
    for (const path of paths) {
      expect(isWorkspaceRoute(path) && isEditorRoute(path)).toBe(false);
    }
  });
});
