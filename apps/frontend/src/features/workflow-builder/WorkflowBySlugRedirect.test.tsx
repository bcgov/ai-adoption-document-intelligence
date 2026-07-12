import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowInfo } from "../../data/hooks/useWorkflows";
import { WorkflowBySlugRedirect } from "./WorkflowBySlugRedirect";

// The redirect resolves the slug through `useWorkflowBySlug`; stub that hook
// so the test drives the three UI states (loading / resolved / error) without
// TanStack + the network.
const useWorkflowBySlug = vi.fn();
vi.mock("../../data/hooks/useWorkflows", () => ({
  useWorkflowBySlug: (slug: string) => useWorkflowBySlug(slug),
}));

function EditorProbe() {
  const { search } = useLocation();
  return <div>EDITOR{search}</div>;
}

function renderAt(entry: string) {
  const path = entry.startsWith("/")
    ? entry
    : `/workflows/by-slug/${entry}/edit`;
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/workflows/by-slug/:slug/edit"
            element={<WorkflowBySlugRedirect />}
          />
          <Route path="/workflows/:workflowId/edit" element={<EditorProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

function result(partial: {
  data?: Partial<WorkflowInfo>;
  isPending?: boolean;
  isError?: boolean;
}): ReactNode {
  return {
    data: partial.data as WorkflowInfo | undefined,
    isPending: partial.isPending ?? false,
    isError: partial.isError ?? false,
  } as never;
}

describe("WorkflowBySlugRedirect", () => {
  beforeEach(() => {
    useWorkflowBySlug.mockReset();
  });

  it("shows a loader while the slug is resolving", () => {
    useWorkflowBySlug.mockReturnValue(result({ isPending: true }));
    renderAt("my-demo");
    expect(screen.getByText(/resolving workflow/i)).toBeDefined();
    expect(screen.queryByText("EDITOR")).toBeNull();
  });

  it("redirects to the canonical id-based editor route once resolved", () => {
    useWorkflowBySlug.mockReturnValue(result({ data: { id: "lin-42" } }));
    renderAt("my-demo");
    expect(screen.getByText("EDITOR")).toBeDefined();
  });

  it("passes the slug from the route to the hook", () => {
    useWorkflowBySlug.mockReturnValue(result({ isPending: true }));
    renderAt("invoice-flow");
    expect(useWorkflowBySlug).toHaveBeenCalledWith("invoice-flow");
  });

  it("preserves the query string across the redirect (e.g. ?agentChat)", () => {
    useWorkflowBySlug.mockReturnValue(result({ data: { id: "lin-42" } }));
    renderAt("/workflows/by-slug/my-demo/edit?agentChat=conv-9");
    expect(screen.getByText("EDITOR?agentChat=conv-9")).toBeDefined();
  });

  it("shows an error when the slug does not resolve", () => {
    useWorkflowBySlug.mockReturnValue(result({ isError: true }));
    renderAt("ghost");
    expect(screen.getByText(/couldn't find a workflow/i)).toBeDefined();
    expect(screen.queryByText("EDITOR")).toBeNull();
  });
});
