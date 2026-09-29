/**
 * Tests for VersionHistoryDrawer (Phase 2 Track 3 — US-082).
 *
 * Covers scenarios 1–4 from the story: newest-first row ordering, head
 * badge placement, action-button disabled-state on the head row with
 * the right tooltip copy, and loading / empty / error states.
 *
 * Mocks `useWorkflowVersions` directly so the tests don't depend on the
 * HTTP layer — they exercise the drawer's render contract against the
 * hook's known return shape.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWorkflowVersions,
  type WorkflowVersionSummary,
} from "../../../../data/hooks/useWorkflows";
import { VersionHistoryDrawer } from "../VersionHistoryDrawer";

vi.mock("../../../../data/hooks/useWorkflows", () => ({
  useWorkflowVersions: vi.fn(),
}));

vi.mock("../useVersionRunCount", () => ({
  useVersionRunCount: vi.fn(),
}));

type UseWorkflowVersionsReturn = {
  data: WorkflowVersionSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

type UseVersionRunCountReturn = {
  data: { runCount: number } | null;
  isLoading: boolean;
  error: unknown;
};

const useWorkflowVersionsMock = useWorkflowVersions as unknown as ReturnType<
  typeof vi.fn
>;

function mockVersionsState(state: Partial<UseWorkflowVersionsReturn>): void {
  const merged: UseWorkflowVersionsReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...state,
  };
  useWorkflowVersionsMock.mockReturnValue(merged);
}

// Default: each row's run-count query resolves to a deterministic count
// based on the version id (so the existing badge-agnostic tests have a
// stable shape to assert against). Individual tests can override via
// `useVersionRunCountMock.mockImplementation(...)`.
async function setupRunCountMock() {
  const { useVersionRunCount } = await import("../useVersionRunCount");
  const mock = useVersionRunCount as unknown as ReturnType<typeof vi.fn>;
  mock.mockImplementation(
    (_workflowId: string, versionId: string): UseVersionRunCountReturn => ({
      data: {
        runCount: versionId === "v3-id" ? 5 : versionId === "v2-id" ? 0 : 2,
      },
      isLoading: false,
      error: null,
    }),
  );
  return mock;
}

function renderDrawer(props: {
  lineageId?: string;
  headVersionId?: string | undefined;
}) {
  const { lineageId = "lineage-1", headVersionId } = props;
  return render(
    <MantineProvider>
      <VersionHistoryDrawer
        lineageId={lineageId}
        headVersionId={headVersionId}
      />
    </MantineProvider>,
  );
}

const sampleVersions: WorkflowVersionSummary[] = [
  // Backend returns newest-first; mirror that ordering here.
  { id: "v3-id", versionNumber: 3, createdAt: "2026-05-22T18:00:00.000Z" },
  { id: "v2-id", versionNumber: 2, createdAt: "2026-05-21T18:00:00.000Z" },
  { id: "v1-id", versionNumber: 1, createdAt: "2026-05-20T18:00:00.000Z" },
];

describe("VersionHistoryDrawer", () => {
  beforeEach(async () => {
    await setupRunCountMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders rows newest-first (v3, v2, v1 reading top-to-bottom)", () => {
    mockVersionsState({ data: sampleVersions });

    renderDrawer({ headVersionId: "v3-id" });

    const list = screen.getByTestId("history-drawer-list");
    const rows = within(list).getAllByTestId(/^history-row-v\d+-id$/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "history-row-v3-id",
      "history-row-v2-id",
      "history-row-v1-id",
    ]);
    // Spot-check that the version-number badges are present.
    expect(within(rows[0]).getByText("v3")).toBeInTheDocument();
    expect(within(rows[1]).getByText("v2")).toBeInTheDocument();
    expect(within(rows[2]).getByText("v1")).toBeInTheDocument();
  });

  it("marks only the row matching headVersionId with the head badge", () => {
    mockVersionsState({ data: sampleVersions });

    renderDrawer({ headVersionId: "v2-id" });

    const headRow = screen.getByTestId("history-row-v2-id");
    expect(
      within(headRow).getByTestId("history-row-head-badge"),
    ).toBeInTheDocument();
    // Other rows must not carry a head badge.
    const v3Row = screen.getByTestId("history-row-v3-id");
    const v1Row = screen.getByTestId("history-row-v1-id");
    expect(
      within(v3Row).queryByTestId("history-row-head-badge"),
    ).not.toBeInTheDocument();
    expect(
      within(v1Row).queryByTestId("history-row-head-badge"),
    ).not.toBeInTheDocument();
    // Exactly one head badge in the whole drawer.
    expect(screen.getAllByTestId("history-row-head-badge")).toHaveLength(1);
  });

  it("disables Revert + Compare on the head row and enables them on others", () => {
    mockVersionsState({ data: sampleVersions });

    renderDrawer({ headVersionId: "v3-id" });

    const headRevert = screen.getByTestId("history-row-revert-v3-id");
    const headCompare = screen.getByTestId("history-row-compare-v3-id");
    expect(headRevert).toBeDisabled();
    expect(headCompare).toBeDisabled();

    const oldRevert = screen.getByTestId("history-row-revert-v2-id");
    const oldCompare = screen.getByTestId("history-row-compare-v2-id");
    expect(oldRevert).not.toBeDisabled();
    expect(oldCompare).not.toBeDisabled();
  });

  it("surfaces the Revert tooltip 'Already the head' on hover over the head row's disabled button", async () => {
    mockVersionsState({ data: sampleVersions });

    renderDrawer({ headVersionId: "v3-id" });

    // Same pattern as WorkflowEditorV2Page's history-button tooltip
    // test — Mantine's Tooltip relays hover from a disabled child via
    // its wrapper, so `mouseEnter` on the button surfaces the floating
    // label into the DOM.
    const headRevert = screen.getByTestId("history-row-revert-v3-id");
    expect(headRevert).toBeDisabled();
    fireEvent.mouseEnter(headRevert);
    await waitFor(() => {
      expect(screen.getByText("Already the head")).toBeInTheDocument();
    });
  });

  it("surfaces the Compare tooltip 'This is the head — nothing to compare' on hover over the head row's disabled button", async () => {
    mockVersionsState({ data: sampleVersions });

    renderDrawer({ headVersionId: "v3-id" });

    const headCompare = screen.getByTestId("history-row-compare-v3-id");
    expect(headCompare).toBeDisabled();
    fireEvent.mouseEnter(headCompare);
    await waitFor(() => {
      expect(
        screen.getByText("This is the head — nothing to compare"),
      ).toBeInTheDocument();
    });
  });

  it("invokes onRevert and onCompare with id + version number + createdAt on click", () => {
    mockVersionsState({ data: sampleVersions });
    const onRevert = vi.fn();
    const onCompare = vi.fn();

    render(
      <MantineProvider>
        <VersionHistoryDrawer
          lineageId="lineage-1"
          headVersionId="v3-id"
          onRevert={onRevert}
          onCompare={onCompare}
        />
      </MantineProvider>,
    );

    screen.getByTestId("history-row-revert-v2-id").click();
    expect(onRevert).toHaveBeenCalledWith(
      "v2-id",
      2,
      "2026-05-21T18:00:00.000Z",
    );

    screen.getByTestId("history-row-compare-v1-id").click();
    expect(onCompare).toHaveBeenCalledWith(
      "v1-id",
      1,
      "2026-05-20T18:00:00.000Z",
    );
  });

  it("renders Skeleton rows while loading", () => {
    mockVersionsState({ isLoading: true });

    renderDrawer({ headVersionId: undefined });

    const loading = screen.getByTestId("history-drawer-loading");
    expect(loading).toBeInTheDocument();
    // Mantine Skeleton renders a styled div; assert we have at least 3.
    expect(loading.children.length).toBeGreaterThanOrEqual(3);
    // Sanity: no rows yet, no empty state.
    expect(screen.queryByTestId("history-drawer-list")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("history-drawer-empty"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty-state text when the version list is empty", () => {
    mockVersionsState({ data: [] });

    renderDrawer({ headVersionId: undefined });

    expect(screen.getByTestId("history-drawer-empty")).toHaveTextContent(
      "No versions yet — save the workflow first.",
    );
  });

  it("renders a red Alert with the error message on query error", () => {
    mockVersionsState({
      isError: true,
      error: new Error("Boom — backend down"),
    });

    renderDrawer({ headVersionId: undefined });

    expect(screen.getByText("Failed to load versions")).toBeInTheDocument();
    expect(screen.getByText(/Boom — backend down/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // US-152 — Scenario 5: run-count badge on each row
  // ---------------------------------------------------------------------
  describe("US-152 — run-count badge", () => {
    it("renders a '<n> runs' badge per row using useVersionRunCount", async () => {
      mockVersionsState({ data: sampleVersions });
      await setupRunCountMock();

      renderDrawer({ headVersionId: "v3-id" });

      // v3-id → 5, v2-id → 0, v1-id → 2 (per the default mock).
      expect(
        screen.getByTestId("history-row-run-count-v3-id"),
      ).toHaveTextContent("5 runs");
      // Zero must render explicitly, not be hidden.
      expect(
        screen.getByTestId("history-row-run-count-v2-id"),
      ).toHaveTextContent("0 runs");
      expect(
        screen.getByTestId("history-row-run-count-v1-id"),
      ).toHaveTextContent("2 runs");
    });

    it("hides the badge while the run-count query is loading", async () => {
      mockVersionsState({ data: sampleVersions });
      const { useVersionRunCount } = await import("../useVersionRunCount");
      (
        useVersionRunCount as unknown as ReturnType<typeof vi.fn>
      ).mockReturnValue({ data: null, isLoading: true, error: null });

      renderDrawer({ headVersionId: "v3-id" });

      // Loading state → badge is not rendered (renders nothing).
      expect(
        screen.queryByTestId("history-row-run-count-v3-id"),
      ).not.toBeInTheDocument();
    });

    it("hides the badge when the run-count query errors", async () => {
      mockVersionsState({ data: sampleVersions });
      const { useVersionRunCount } = await import("../useVersionRunCount");
      (
        useVersionRunCount as unknown as ReturnType<typeof vi.fn>
      ).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error("backend down"),
      });

      renderDrawer({ headVersionId: "v3-id" });

      // Error state → badge is not rendered (renders nothing).
      expect(
        screen.queryByTestId("history-row-run-count-v3-id"),
      ).not.toBeInTheDocument();
    });
  });
});
