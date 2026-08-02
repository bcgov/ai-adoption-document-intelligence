/**
 * Tests for WorkflowSwitcher — the Inderdeep-walkthrough (2026-07-29)
 * in-editor switcher: searchable list of workflows plus the "All workflows"
 * back affordance.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("marks the current workflow and does not navigate to it", () => {
    renderSwitcher("wf-1");
    fireEvent.click(screen.getByTestId("workflow-switcher-button"));
    const current = screen.getByTestId("workflow-switcher-result-wf-1");
    expect(current).toHaveTextContent("(current)");
    expect(current).toBeDisabled();
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
