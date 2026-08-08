/**
 * Tests for WorkflowSwitcher — the UX walkthrough (2026-07-29)
 * in-editor switcher: searchable list of workflows plus the "All workflows"
 * back affordance.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowInfo } from "../../data/hooks/useWorkflows";
import { useWorkflows } from "../../data/hooks/useWorkflows";
import { WorkflowSwitcher } from "./WorkflowSwitcher";

vi.mock("../../data/hooks/useWorkflows", () => ({
  useWorkflows: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

const workflow = (id: string, name: string, slug: string): WorkflowInfo =>
  ({
    id,
    workflowVersionId: `${id}-v`,
    slug,
    name,
    description: null,
    actorId: "actor-1",
    config: { schemaVersion: "2.0", nodes: [], edges: [] },
    schemaVersion: "2.0",
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  }) as unknown as WorkflowInfo;

const renderSwitcher = (currentWorkflowId: string | null = "wf-1") =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <WorkflowSwitcher currentWorkflowId={currentWorkflowId} />
      </MemoryRouter>
    </MantineProvider>,
  );

describe("WorkflowSwitcher", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(useWorkflows).mockReturnValue({
      data: [
        workflow("wf-1", "Standard OCR", "standard-ocr"),
        workflow("wf-2", "Handwriting extraction", "handwriting-extraction"),
        workflow("wf-3", "Classification only", "classification-only"),
      ],
    } as unknown as ReturnType<typeof useWorkflows>);
  });

  it("lists workflows on open and navigates to the picked one", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.click(screen.getByTestId("workflow-switcher-result-wf-2"));
    expect(mockNavigate).toHaveBeenCalledWith("/workflows/wf-2/edit");
  });

  // Item 15 — the current row was dimmed and disabled while every other row
  // was bold; it must now be the dominant row without reading as disabled.
  it("marks the current workflow as dominant, not disabled", () => {
    renderSwitcher("wf-1");
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    const current = screen.getByTestId("workflow-switcher-result-wf-1");
    expect(current).not.toBeDisabled();
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).not.toHaveTextContent("(current)");
    expect(
      screen.getByTestId("workflow-switcher-current-check"),
    ).toBeInTheDocument();

    const other = screen.getByTestId("workflow-switcher-result-wf-2");
    expect(other).not.toHaveAttribute("aria-current");
    expect(within(current).getByText("Standard OCR")).toHaveStyle({
      fontWeight: "600",
    });
    expect(within(other).getByText("Handwriting extraction")).toHaveStyle({
      fontWeight: "400",
    });
  });

  it("does not navigate when the current workflow is clicked", () => {
    renderSwitcher("wf-1");
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.click(screen.getByTestId("workflow-switcher-result-wf-1"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Item 15 — "do we need that here? No."
  it("does not show the slug or version line", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    const row = screen.getByTestId("workflow-switcher-result-wf-2");
    expect(row).not.toHaveTextContent("handwriting-extraction");
    expect(row).not.toHaveTextContent("v1");
  });

  // Item 16 — the list used to stop at 12 rows and render a dead
  // "+N more — refine the search" line.
  it("lists every workflow with no cap and no '+N more' line", () => {
    const many = Array.from({ length: 29 }, (_, i) =>
      workflow(`wf-${i + 1}`, `Workflow ${i + 1}`, `workflow-${i + 1}`),
    );
    vi.mocked(useWorkflows).mockReturnValue({
      data: many,
    } as unknown as ReturnType<typeof useWorkflows>);

    renderSwitcher("wf-1");
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));

    for (const w of many) {
      expect(
        screen.getByTestId(`workflow-switcher-result-${w.id}`),
      ).toBeInTheDocument();
    }
    expect(screen.queryByText(/more — refine the search/)).toBeNull();
  });

  // Item 17 — clicking outside left the dropdown open.
  it("closes on an outside click", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    expect(screen.getByTestId("workflow-switcher-search")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(screen.queryByTestId("workflow-switcher-search")).toBeNull();
  });

  // Item 17 — Escape had to reach the search input to work; focus is now
  // trapped in the dropdown so the popover handles it.
  it("closes on Escape", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.keyDown(screen.getByTestId("workflow-switcher-search"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("workflow-switcher-search")).toBeNull();
  });

  it("filters by name or slug as you type", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.change(screen.getByTestId("workflow-switcher-search"), {
      target: { value: "handwriting" },
    });
    expect(
      screen.getByTestId("workflow-switcher-result-wf-2"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("workflow-switcher-result-wf-1"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.change(screen.getByTestId("workflow-switcher-search"), {
      target: { value: "zzz-no-match" },
    });
    expect(screen.getByTestId("workflow-switcher-empty")).toHaveTextContent(
      "No workflow matches",
    );
  });

  it("navigates back to the workflows list via All workflows", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    fireEvent.click(screen.getByTestId("workflow-switcher-all"));
    expect(mockNavigate).toHaveBeenCalledWith("/workflows");
  });
});
