/**
 * Tests for CompareToHeadModal (Phase 2 Track 3 — US-084).
 *
 * Covers Scenarios 1–4 from the story:
 *   1. Modal opens with two side-by-side columns + the expected
 *      header text for both columns.
 *   2. Both JsonInputs render their config JSON and are read-only.
 *   3. Loading state shows a single skeleton in the left column while
 *      `useWorkflowVersion` is in flight; right column still renders
 *      head's config (no extra fetch).
 *   4. Error state shows a red Alert in the left column; right column
 *      still renders head's config.
 *
 * Mocks `useWorkflowVersion` at the module boundary so the tests don't
 * depend on the HTTP layer.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useWorkflowVersion,
  type WorkflowInfo,
} from "../../../../data/hooks/useWorkflows";
import { CompareToHeadModal } from "../CompareToHeadModal";

vi.mock("../../../../data/hooks/useWorkflows", () => ({
  useWorkflowVersion: vi.fn(),
}));

type UseWorkflowVersionReturn = {
  data: WorkflowInfo | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

const useWorkflowVersionMock = useWorkflowVersion as unknown as ReturnType<
  typeof vi.fn
>;

function mockVersionState(state: Partial<UseWorkflowVersionReturn>): void {
  const merged: UseWorkflowVersionReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...state,
  };
  useWorkflowVersionMock.mockReturnValue(merged);
}

const headWorkflow: WorkflowInfo = {
  id: "wf-lineage-1",
  workflowVersionId: "v3-id",
  slug: "test-workflow",
  name: "Test workflow",
  description: null,
  actorId: "actor-1",
  config: {
    schemaVersion: "1.0",
    metadata: { name: "Test workflow head" },
    nodes: {},
    edges: [],
    entryNodeId: "",
    ctx: { headOnly: { type: "string" } },
  },
  schemaVersion: "1.0",
  version: 3,
  createdAt: "2026-05-22T18:00:00.000Z",
  updatedAt: "2026-05-22T18:00:00.000Z",
};

const olderVersion: WorkflowInfo = {
  ...headWorkflow,
  workflowVersionId: "v2-id",
  config: {
    schemaVersion: "1.0",
    metadata: { name: "Test workflow older" },
    nodes: {},
    edges: [],
    entryNodeId: "",
    ctx: { olderOnly: { type: "string" } },
  },
  version: 2,
  createdAt: "2026-05-21T18:00:00.000Z",
  updatedAt: "2026-05-21T18:00:00.000Z",
};

function renderModal(
  overrides: Partial<{
    opened: boolean;
    selectedVersionId: string;
    selectedVersionNumber: number;
    selectedCreatedAt: string;
  }> = {},
) {
  const props = {
    opened: true,
    onClose: vi.fn(),
    lineageId: "wf-lineage-1",
    selectedVersionId: "v2-id",
    selectedVersionNumber: 2,
    selectedCreatedAt: "2026-05-21T18:00:00.000Z",
    headWorkflow,
    ...overrides,
  };
  return render(
    <MantineProvider>
      <CompareToHeadModal {...props} />
    </MantineProvider>,
  );
}

describe("CompareToHeadModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Scenario 1: opens a modal with two columns and the expected header text on each", () => {
    mockVersionState({ data: olderVersion });

    renderModal();

    // Modal renders.
    expect(screen.getByTestId("compare-to-head-modal")).toBeInTheDocument();
    expect(screen.getByText("Compare to head")).toBeInTheDocument();

    // Both columns mount.
    const leftColumn = screen.getByTestId("compare-left-column");
    const rightColumn = screen.getByTestId("compare-right-column");
    expect(leftColumn).toBeInTheDocument();
    expect(rightColumn).toBeInTheDocument();

    // Left header: "v{n} — {iso timestamp}".
    expect(
      within(leftColumn).getByText("v2 — 2026-05-21T18:00:00.000Z"),
    ).toBeInTheDocument();
    // Right header: "head (v{headN} — {iso timestamp})".
    expect(
      within(rightColumn).getByText("head (v3 — 2026-05-22T18:00:00.000Z)"),
    ).toBeInTheDocument();
  });

  it("Scenario 2: each column renders a read-only JsonInput with the config JSON", () => {
    mockVersionState({ data: olderVersion });

    renderModal();

    const leftJson = screen.getByTestId("compare-left-json");
    const rightJson = screen.getByTestId("compare-right-json");

    // Both must be marked read-only — Mantine JsonInput is a textarea
    // under the hood with `readonly` set when `readOnly` is true.
    expect(leftJson).toHaveAttribute("readonly");
    expect(rightJson).toHaveAttribute("readonly");

    // Each JsonInput's value should be the stringified config. Mantine
    // renders the value as the textarea's `value`.
    expect(leftJson).toHaveValue(JSON.stringify(olderVersion.config, null, 2));
    expect(rightJson).toHaveValue(JSON.stringify(headWorkflow.config, null, 2));
  });

  it("Scenario 3: shows a single skeleton in the left column while loading; right column still renders head's JSON", () => {
    mockVersionState({ isLoading: true });

    renderModal();

    // Skeleton in left column.
    expect(screen.getByTestId("compare-left-skeleton")).toBeInTheDocument();

    // The left column's JsonInput is NOT yet rendered.
    expect(screen.queryByTestId("compare-left-json")).not.toBeInTheDocument();
    // No error alert in the left column.
    expect(screen.queryByTestId("compare-left-error")).not.toBeInTheDocument();

    // Right column still renders the head's config — no extra fetch.
    const rightJson = screen.getByTestId("compare-right-json");
    expect(rightJson).toBeInTheDocument();
    expect(rightJson).toHaveValue(JSON.stringify(headWorkflow.config, null, 2));
  });

  it("Scenario 4: shows a red Alert with the error message in the left column on fetch error; right column still renders head's JSON", () => {
    mockVersionState({
      isError: true,
      error: new Error("Version not found"),
    });

    renderModal();

    const alert = screen.getByTestId("compare-left-error");
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText(/Version not found/)).toBeInTheDocument();
    expect(
      within(alert).getByText("Failed to load version"),
    ).toBeInTheDocument();

    // Left column has no JsonInput while in error state.
    expect(screen.queryByTestId("compare-left-json")).not.toBeInTheDocument();
    // No skeleton either.
    expect(
      screen.queryByTestId("compare-left-skeleton"),
    ).not.toBeInTheDocument();

    // Right column still renders the head's config.
    expect(screen.getByTestId("compare-right-json")).toBeInTheDocument();
  });
});
