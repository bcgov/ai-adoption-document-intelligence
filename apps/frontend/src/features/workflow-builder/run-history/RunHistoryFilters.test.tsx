/**
 * Tests for `RunHistoryFilters` (US-153 — Scenario 4).
 *
 * Verifies:
 *   - the four inputs render
 *   - "all" status selection clears `filters.status` (no query param)
 *   - selecting a concrete status surfaces it on the onChange payload
 *   - the version `<Select>` is populated from `useWorkflowVersions`
 *   - "all" version selection clears `filters.workflowVersionId`
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunHistoryFilters } from "./RunHistoryFilters";
import type { ListRunsFilters } from "./useWorkflowRuns";

vi.mock("../../../data/hooks/useWorkflows", () => ({
  useWorkflowVersions: vi.fn(),
}));

import { useWorkflowVersions } from "../../../data/hooks/useWorkflows";

const useWorkflowVersionsMock = useWorkflowVersions as unknown as ReturnType<
  typeof vi.fn
>;

describe("RunHistoryFilters (US-153 Scenario 4)", () => {
  beforeEach(() => {
    useWorkflowVersionsMock.mockReturnValue({
      data: [
        { id: "wv-3", versionNumber: 3, createdAt: "2026-05-23T00:00:00.000Z" },
        { id: "wv-2", versionNumber: 2, createdAt: "2026-05-22T00:00:00.000Z" },
        { id: "wv-1", versionNumber: 1, createdAt: "2026-05-21T00:00:00.000Z" },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderFilters(initial: ListRunsFilters = {}) {
    const onChange = vi.fn();
    render(
      <MantineProvider>
        <RunHistoryFilters
          workflowId="workflow-1"
          filters={initial}
          onChange={onChange}
        />
      </MantineProvider>,
    );
    return { onChange };
  }

  it("renders all four filter inputs", () => {
    renderFilters();
    expect(screen.getByTestId("run-history-filter-status")).toBeInTheDocument();
    expect(screen.getByTestId("run-history-filter-from")).toBeInTheDocument();
    expect(screen.getByTestId("run-history-filter-to")).toBeInTheDocument();
    expect(
      screen.getByTestId("run-history-filter-version"),
    ).toBeInTheDocument();
  });

  it("populates the version Select from useWorkflowVersions", () => {
    renderFilters();
    // Open the version Select to expose its options. The displayed
    // value defaults to "All versions" since `filters.workflowVersionId`
    // is undefined.
    const versionSelect = screen.getByTestId(
      "run-history-filter-version",
    ) as HTMLInputElement;
    expect(versionSelect.value).toBe("All versions");
    // Opening the dropdown surfaces the option labels.
    fireEvent.click(versionSelect);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("clears filters.status when 'All statuses' is chosen", () => {
    // Same component contract: simulate the picked-option directly via
    // an `<input type="hidden">`-style React-test interaction. Mantine
    // exposes the chosen value through the `onChange` callback; we
    // verify the handler's pure logic by constructing the component
    // with a pre-populated `status` and asserting the displayed value.
    const { onChange } = renderFilters({ status: "succeeded" });
    // Open the dropdown and click "All statuses".
    const statusInput = screen.getByTestId("run-history-filter-status");
    fireEvent.click(statusInput);
    fireEvent.click(screen.getByText("All statuses"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.status).toBeUndefined();
  });

  it("propagates a concrete status to onChange (no 'all' sentinel)", () => {
    const { onChange } = renderFilters();
    const statusInput = screen.getByTestId("run-history-filter-status");
    fireEvent.click(statusInput);
    fireEvent.click(screen.getByText("Succeeded"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.status).toBe("succeeded");
  });

  it("clears filters.workflowVersionId when 'All versions' is chosen", () => {
    const { onChange } = renderFilters({ workflowVersionId: "wv-2" });
    const versionInput = screen.getByTestId("run-history-filter-version");
    fireEvent.click(versionInput);
    fireEvent.click(screen.getByText("All versions"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.workflowVersionId).toBeUndefined();
  });
});
