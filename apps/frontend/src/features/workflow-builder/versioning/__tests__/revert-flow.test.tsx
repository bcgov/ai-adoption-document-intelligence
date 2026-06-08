/**
 * Tests for the revert-to-version flow (Phase 2 Track 3 — US-083).
 *
 * Scope: the wiring inside `WorkflowEditorV2Page` between the
 * `VersionHistoryDrawer`'s Revert button, Mantine's `openConfirmModal`,
 * the `useRevertWorkflowHead` mutation, and the success / error
 * notifications. Mocks the data hooks at the module boundary so the
 * tests don't depend on the HTTP layer or React-Query's cache
 * machinery.
 *
 * Covers US-083 Scenarios 1–4:
 *   1. Confirm modal opens with the expected warning copy; Cancel
 *      closes without invoking the mutation.
 *   2. Confirm calls `useRevertWorkflowHead.mutateAsync` with
 *      `{ lineageId, workflowVersionId }`; on success the drawer
 *      closes and a green notification fires.
 *   3. On mutation error a red notification fires and the drawer
 *      stays open.
 *   4. The Vitest coverage itself.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
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
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkflowInfo,
  WorkflowVersionSummary,
} from "../../../../data/hooks/useWorkflows";

// ---------------------------------------------------------------------------
// Hoisted mocks — shared between vi.mock factories and individual tests.
// ---------------------------------------------------------------------------

const { revertMutateAsyncMock, notificationsShowMock, capturedCanvasProps } =
  vi.hoisted(() => {
    return {
      revertMutateAsyncMock: vi.fn(),
      notificationsShowMock: vi.fn(),
      capturedCanvasProps: { current: null as null | Record<string, unknown> },
    };
  });

// `useActivityCatalog` (transitively used by the page) calls `useGroup()`.
// The test fixture doesn't wrap in a `GroupProvider`, so stub the catalog
// hook with an empty list. Mirrors the shim used in
// `WorkflowEditorCanvas.type-pill.test.tsx` and `WorkflowEditorV2Page.test.tsx`.
vi.mock("../../dynamic-nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../dynamic-nodes")>();
  return {
    ...actual,
    useActivityCatalog: () => ({
      isLoading: false,
      entries: [],
      error: null,
    }),
  };
});

vi.mock("@mantine/notifications", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@mantine/notifications")>();
  return {
    ...original,
    notifications: {
      ...original.notifications,
      show: notificationsShowMock,
    },
  };
});

// The page imports the canvas / palette / settings / drawers. Stub them
// so the test focuses on the revert flow alone.
vi.mock("../../canvas/WorkflowEditorCanvas", () => ({
  WorkflowEditorCanvas: (props: Record<string, unknown>) => {
    capturedCanvasProps.current = props;
    return <div data-testid="canvas-stub" />;
  },
}));

vi.mock("../../palette/ActivityPalette", () => ({
  ActivityPalette: () => <div data-testid="palette-stub" />,
}));

vi.mock("../../settings/NodeSettingsPanel", () => ({
  NodeSettingsPanel: () => <div data-testid="node-settings-stub" />,
}));

vi.mock("../../settings/WorkflowSettingsDrawer", () => ({
  WorkflowSettingsDrawer: () => null,
}));

vi.mock("../../validation/ValidationDrawer", () => ({
  ValidationDrawer: () => null,
}));

vi.mock("../../validation/useGraphValidation", () => ({
  useGraphValidation: () => ({
    errorCount: 0,
    warningCount: 0,
    isPending: false,
    errorsByNode: new Map(),
    errors: [],
  }),
}));

// Edit-mode workflow load + the version-list query that backs the
// drawer body.
const baseWorkflow: WorkflowInfo = {
  id: "wf-lineage-1",
  workflowVersionId: "v3-id",
  slug: "test-workflow",
  name: "Test workflow",
  description: null,
  actorId: "actor-1",
  config: {
    schemaVersion: "1.0",
    metadata: { name: "Test workflow" },
    nodes: {},
    edges: [],
    entryNodeId: "",
    ctx: {},
  },
  schemaVersion: "1.0",
  version: 3,
  createdAt: "2026-05-22T18:00:00.000Z",
  updatedAt: "2026-05-22T18:00:00.000Z",
};

const sampleVersions: WorkflowVersionSummary[] = [
  { id: "v3-id", versionNumber: 3, createdAt: "2026-05-22T18:00:00.000Z" },
  { id: "v2-id", versionNumber: 2, createdAt: "2026-05-21T18:00:00.000Z" },
  { id: "v1-id", versionNumber: 1, createdAt: "2026-05-20T18:00:00.000Z" },
];

vi.mock("../../../../data/hooks/useWorkflows", () => ({
  useWorkflow: () => ({ data: baseWorkflow, isLoading: false }),
  useCreateWorkflow: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateWorkflow: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRevertWorkflowHead: () => ({
    mutateAsync: revertMutateAsyncMock,
    isPending: false,
  }),
  useWorkflowRunSpec: () => ({ data: undefined, isLoading: false }),
  useStartWorkflowRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWorkflowVersion: () => ({ data: undefined, isLoading: false }),
  useWorkflowVersions: () => ({
    data: sampleVersions,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// Now import the page under test. Must come AFTER the vi.mock calls so
// the page picks up the mocked dependencies.
import { WorkflowEditorV2Page } from "../../WorkflowEditorV2Page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={["/workflows/wf-lineage-1/edit"]}>
            <Routes>
              <Route
                path="/workflows/:workflowId/edit"
                element={<WorkflowEditorV2Page mode="edit" />}
              />
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

/**
 * Opens the History drawer and clicks the Revert button on the
 * non-head v2 row. Returns once the confirm modal has rendered.
 *
 * Task 6 moved the History entry into the More menu, so the drawer is
 * opened via `topbar-more-button` → `topbar-menu-history` rather than
 * the previous standalone `history-button`.
 */
async function openRevertConfirm() {
  fireEvent.click(screen.getByTestId("topbar-more-button"));
  const historyItem = await screen.findByTestId("topbar-menu-history");
  fireEvent.click(historyItem);
  // Drawer body renders the row asynchronously after the drawer opens
  // (Mantine's Drawer mounts its children on open). Wait for the row.
  const revertButton = await screen.findByTestId("history-row-revert-v2-id");
  fireEvent.click(revertButton);
  // Confirm-modal text proves the modal opened.
  await screen.findByText(/Reverting will replace the current head/i);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-083 revert-to-version flow", () => {
  beforeEach(() => {
    revertMutateAsyncMock.mockReset();
    notificationsShowMock.mockReset();
    capturedCanvasProps.current = null;
  });

  it("Scenario 1: clicking Revert opens the confirm modal with the warning copy; Cancel closes without calling the mutation", async () => {
    renderEditor();
    await openRevertConfirm();

    // The full warning copy includes the version number and a
    // formatted timestamp — assert the load-bearing substrings rather
    // than the locale-formatted date.
    expect(
      screen.getByText(/Reverting will replace the current head with v2,/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Any unsaved canvas changes will be discarded/i),
    ).toBeInTheDocument();

    // Cancel closes the modal without invoking the mutation.
    const cancelButton = screen.getByTestId("revert-cancel-button");
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(
        screen.queryByText(/Reverting will replace the current head/i),
      ).not.toBeInTheDocument();
    });
    expect(revertMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("Scenario 2: confirming calls the mutation with { lineageId, workflowVersionId }, closes the drawer, and fires a green notification", async () => {
    revertMutateAsyncMock.mockResolvedValueOnce({
      ...baseWorkflow,
      workflowVersionId: "v2-id",
      versionNumber: 2,
    });

    renderEditor();
    await openRevertConfirm();

    const confirmButton = screen.getByTestId("revert-confirm-button");
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(revertMutateAsyncMock).toHaveBeenCalledWith({
        lineageId: "wf-lineage-1",
        workflowVersionId: "v2-id",
      });
    });

    // Drawer closes — the history-drawer-list element is no longer
    // mounted because the Mantine Drawer unmounts its children on
    // close.
    await waitFor(() => {
      expect(
        screen.queryByTestId("history-drawer-list"),
      ).not.toBeInTheDocument();
    });

    // Green notification fires with the v{n} title.
    expect(notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "green",
        title: "Reverted to v2",
      }),
    );
  });

  it("Scenario 3: on mutation error, a red notification fires and the drawer stays open", async () => {
    revertMutateAsyncMock.mockRejectedValueOnce(new Error("Backend exploded"));

    renderEditor();
    await openRevertConfirm();

    const confirmButton = screen.getByTestId("revert-confirm-button");
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(notificationsShowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "red",
          title: "Revert failed",
          message: "Backend exploded",
        }),
      );
    });

    // Drawer stays open — the revert row is still in the DOM.
    expect(screen.getByTestId("history-row-revert-v2-id")).toBeInTheDocument();
  });
});
