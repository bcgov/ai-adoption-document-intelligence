/**
 * Tests for `WorkflowEditorV2Page` covering Milestone L (auto-layout):
 *   - US-049 Scenario 3: top-bar "Auto-arrange" button stamps fresh
 *     positions on every node and asks the canvas to re-fit.
 *   - US-050 Scenarios 1–4: template-load auto-layout policy + save
 *     payload retains computed positions.
 *
 * The page wires together React Router, react-query, Mantine, xyflow,
 * and a handful of child features. The tests mock the leaf integrations
 * so each scenario can exercise the auto-layout wiring in isolation.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityNode, GraphWorkflowConfig } from "../../types/workflow";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture the live config the canvas was rendered with so assertions can
// inspect what the page is feeding it. The handler stub also exposes the
// onReactFlowReady callback so we can simulate the canvas mount.
const {
  capturedCanvasProps,
  capturedCreateDto,
  capturedPaletteProps,
  capturedRunDrawerProps,
  fitViewMock,
  existingWorkflowRef,
} = vi.hoisted(() => {
  return {
    capturedCanvasProps: { current: null as null | Record<string, unknown> },
    capturedCreateDto: { current: null as null | Record<string, unknown> },
    // US-121 — palette stub captures the add-* callbacks so tests can
    // invoke `onAddSource(...)` directly without spinning up the real
    // palette UI.
    capturedPaletteProps: { current: null as null | Record<string, unknown> },
    // US-148 — the Run drawer stub captures its props so the trigger
    // tests can verify `openMode` was set correctly by whichever
    // top-bar button opened the drawer.
    capturedRunDrawerProps: {
      current: null as null | Record<string, unknown>,
    },
    fitViewMock: vi.fn(),
    // US-121 Scenario 3 — let tests inject a fake existing workflow that
    // the page's `useWorkflow` mock will return, so edit-mode hydration
    // exercises the legacy-entryNodeId-preservation path.
    existingWorkflowRef: { current: null as null | Record<string, unknown> },
  };
});

vi.mock("./canvas/WorkflowEditorCanvas", () => {
  return {
    WorkflowEditorCanvas: (props: Record<string, unknown>) => {
      capturedCanvasProps.current = props;
      // Simulate xyflow handing back an instance once mounted so the page
      // can trigger fitView on Auto-arrange.
      const onReady = props.onReactFlowReady as
        | ((instance: { fitView: typeof fitViewMock }) => void)
        | undefined;
      React.useEffect(() => {
        onReady?.({ fitView: fitViewMock });
      }, [onReady]);
      return <div data-testid="canvas-stub" />;
    },
  };
});

vi.mock("./palette/ActivityPalette", () => ({
  ActivityPalette: (props: Record<string, unknown>) => {
    capturedPaletteProps.current = props;
    return <div data-testid="palette-stub" />;
  },
}));

vi.mock("./settings/NodeSettingsPanel", () => ({
  NodeSettingsPanel: (props: Record<string, unknown>) => {
    const activeGroupId = props.activeGroupId as string | null | undefined;
    return (
      <div
        data-testid="node-settings-stub"
        data-active-group-id={activeGroupId ?? ""}
      >
        {activeGroupId ? (
          <div
            data-testid="group-node-settings"
            data-group-id={activeGroupId}
          />
        ) : null}
      </div>
    );
  },
}));

vi.mock("./settings/WorkflowSettingsDrawer", () => ({
  WorkflowSettingsDrawer: () => null,
}));

vi.mock("./validation/ValidationDrawer", () => ({
  ValidationDrawer: () => null,
}));

// US-148 — capture the live props the page passes so the trigger tests
// can verify both `opened` and `openMode` for either button. The stub
// renders nothing; the page-level assertions are about which trigger
// requested what, not about the drawer body itself (US-149 owns the
// tab UI).
vi.mock("./run/RunWorkflowDrawer", () => ({
  RunWorkflowDrawer: (props: Record<string, unknown>) => {
    capturedRunDrawerProps.current = props;
    return props.opened ? (
      <div
        data-testid="run-workflow-drawer-stub"
        data-open-mode={String(props.openMode ?? "run")}
      />
    ) : null;
  },
}));

vi.mock("./validation/useGraphValidation", () => ({
  useGraphValidation: () => ({
    errorCount: 0,
    warningCount: 0,
    isPending: false,
    errorsByNode: new Map(),
    errors: [],
  }),
}));

// US-153 — the Run-history drawer body calls `useWorkflowRuns`, which
// would hit `globalThis.fetch` if left unstubbed. Surface a stable
// empty-list shape so the drawer renders its empty-state node.
vi.mock("./run-history/useWorkflowRuns", () => ({
  useWorkflowRuns: () => ({
    data: { pages: [{ runs: [], nextCursor: null }], pageParams: [undefined] },
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock("../../data/hooks/useWorkflows", () => ({
  useWorkflow: () => ({
    data: existingWorkflowRef.current ?? undefined,
    isLoading: false,
  }),
  useCreateWorkflow: () => ({
    mutateAsync: async (dto: Record<string, unknown>) => {
      capturedCreateDto.current = dto;
      return { id: "new-workflow-id" };
    },
    isPending: false,
  }),
  useUpdateWorkflow: () => ({
    mutateAsync: async () => undefined,
    isPending: false,
  }),
  // US-083 — the page now calls `useRevertWorkflowHead` for the
  // version-history drawer's Revert action. Surface a no-op mutation
  // so the page renders.
  useRevertWorkflowHead: () => ({
    mutateAsync: async () => undefined,
    isPending: false,
  }),
  // RunWorkflowDrawer is only mounted in edit mode (isEditMode &&
  // workflowId), but the page imports its hooks unconditionally at
  // module level, so the mock must surface them.
  useWorkflowRunSpec: () => ({ data: undefined, isLoading: false }),
  useStartWorkflowRun: () => ({
    mutateAsync: async () => undefined,
    isPending: false,
  }),
  // US-081 — hook is exported alongside the others; the page itself
  // does not call it directly, but the version-history drawer body
  // (mounted in US-082) does, so the mock must surface it.
  useWorkflowVersion: () => ({ data: undefined, isLoading: false }),
  // US-082 — `VersionHistoryDrawer` calls `useWorkflowVersions` to list
  // the lineage's versions. Default to an empty list so the drawer
  // renders its empty-state text instead of querying the network.
  useWorkflowVersions: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import type { WorkflowTemplate } from "./templates";
// Now import the page under test. Must come AFTER the vi.mock calls so
// the page picks up the mocked dependencies.
import { WorkflowEditorV2Page } from "./WorkflowEditorV2Page";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

function makeActivity(
  id: string,
  position?: { x: number; y: number },
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "data.transform",
    inputs: [],
    outputs: [],
    parameters: {},
    metadata: position ? { position } : undefined,
  };
}

function buildTemplateConfig(opts: {
  positions: "none" | "all" | "partial";
}): GraphWorkflowConfig {
  const a =
    opts.positions === "all"
      ? makeActivity("a", { x: 10, y: 20 })
      : makeActivity("a");
  const b =
    opts.positions === "all" || opts.positions === "partial"
      ? makeActivity(
          "b",
          opts.positions === "partial" ? { x: 999, y: 999 } : { x: 30, y: 40 },
        )
      : makeActivity("b");
  const c =
    opts.positions === "all"
      ? makeActivity("c", { x: 50, y: 60 })
      : makeActivity("c");
  return {
    schemaVersion: "1.0",
    metadata: { name: "fixture" },
    nodes: { a, b, c },
    edges: [
      { id: "e1", source: "a", target: "b", type: "normal" },
      { id: "e2", source: "b", target: "c", type: "normal" },
    ],
    entryNodeId: "a",
    ctx: {},
  };
}

function makeTemplate(
  config: GraphWorkflowConfig,
  name = "Fixture Template",
): WorkflowTemplate {
  return {
    id: "fixture",
    name,
    description: "fixture description",
    tags: [],
    nodeCount: Object.keys(config.nodes).length,
    config,
  };
}

function renderPage(template?: WorkflowTemplate) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const initialEntry = template
    ? { pathname: "/workflows/create-v2", state: { template } }
    : { pathname: "/workflows/create-v2" };
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/workflows/create-v2"
              element={<WorkflowEditorV2Page mode="create" />}
            />
            <Route
              path="/workflows/:workflowId/edit-v2"
              element={<WorkflowEditorV2Page mode="edit" />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function readPositionsFromCanvas(): Record<
  string,
  { x: number; y: number } | undefined
> {
  const config = (capturedCanvasProps.current?.config as
    | GraphWorkflowConfig
    | undefined)!;
  const positions: Record<string, { x: number; y: number } | undefined> = {};
  for (const [id, node] of Object.entries(config.nodes)) {
    positions[id] = (
      node.metadata as { position?: { x: number; y: number } } | undefined
    )?.position;
  }
  return positions;
}

// ---------------------------------------------------------------------------
// US-050 — template-load behaviour
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-050: template-load auto-layout", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  it("Scenario 1: runs auto-layout once when no node carries a position", () => {
    const template = makeTemplate(buildTemplateConfig({ positions: "none" }));
    renderPage(template);
    const positions = readPositionsFromCanvas();
    for (const id of ["a", "b", "c"]) {
      expect(positions[id]).toBeDefined();
      expect(typeof positions[id]?.x).toBe("number");
      expect(typeof positions[id]?.y).toBe("number");
    }
  });

  it("Scenario 2: leaves existing positions alone when every node has one", () => {
    const template = makeTemplate(buildTemplateConfig({ positions: "all" }));
    renderPage(template);
    const positions = readPositionsFromCanvas();
    expect(positions.a).toEqual({ x: 10, y: 20 });
    expect(positions.b).toEqual({ x: 30, y: 40 });
    expect(positions.c).toEqual({ x: 50, y: 60 });
  });

  it("Scenario 3: mixed-state templates are NOT re-laid-out", () => {
    const template = makeTemplate(
      buildTemplateConfig({ positions: "partial" }),
    );
    renderPage(template);
    const positions = readPositionsFromCanvas();
    expect(positions.b).toEqual({ x: 999, y: 999 });
    expect(positions.a).toBeUndefined();
    expect(positions.c).toBeUndefined();
  });

  it("Scenario 4: save payload includes the auto-laid-out positions", async () => {
    const template = makeTemplate(buildTemplateConfig({ positions: "none" }));
    renderPage(template);
    const positionsBeforeSave = readPositionsFromCanvas();
    const saveButton = screen.getByRole("button", { name: /^Save$/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(capturedCreateDto.current).toBeTruthy();
    const dtoConfig = (
      capturedCreateDto.current as { config: GraphWorkflowConfig }
    ).config;
    for (const id of ["a", "b", "c"]) {
      const saved = (
        dtoConfig.nodes[id].metadata as
          | { position?: { x: number; y: number } }
          | undefined
      )?.position;
      expect(saved).toEqual(positionsBeforeSave[id]);
    }
  });
});

// ---------------------------------------------------------------------------
// US-041 — "Group selected" top-bar action
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-041-group-from-selection.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-041: Group selected button", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  /**
   * Drives the canvas-mock's `onSelectionChangeMany` callback so the
   * top-bar button can react to a multi-select. The canvas stub captures
   * its props in `capturedCanvasProps`, so we reach in and invoke the
   * handler the same way the real canvas would after xyflow's
   * `onSelectionChange` fires.
   */
  function dispatchSelection(ids: string[]) {
    const onMany = capturedCanvasProps.current?.onSelectionChangeMany as
      | ((nodeIds: string[]) => void)
      | undefined;
    if (!onMany)
      throw new Error("Canvas stub did not capture onSelectionChangeMany");
    act(() => {
      onMany(ids);
    });
  }

  function makeTwoNodeTemplate(): WorkflowTemplate {
    return makeTemplate(buildTemplateConfig({ positions: "all" }));
  }

  it("Scenario 1: button is enabled once 2 nodes are selected", () => {
    renderPage(makeTwoNodeTemplate());
    const button = screen.getByTestId("group-selected-btn");
    // Starts disabled — no selection yet.
    expect(button).toBeDisabled();
    dispatchSelection(["a", "b"]);
    expect(button).not.toBeDisabled();
  });

  it("Scenario 2: button is disabled when 0 or 1 nodes are selected", () => {
    renderPage(makeTwoNodeTemplate());
    const button = screen.getByTestId("group-selected-btn");
    expect(button).toBeDisabled();
    // One node selected → still disabled.
    dispatchSelection(["a"]);
    expect(button).toBeDisabled();
    // Tooltip on disabled button surfaces the hint.
    expect(button).toHaveAttribute("title", "Select 2+ nodes to group them");
    // Clearing the selection keeps the button disabled.
    dispatchSelection([]);
    expect(button).toBeDisabled();
  });

  it("Scenario 3: clicking adds a nodeGroups[<id>] entry to the next config", () => {
    renderPage(makeTwoNodeTemplate());
    dispatchSelection(["a", "b"]);
    const button = screen.getByTestId("group-selected-btn");
    expect(button).not.toBeDisabled();
    // Capture the config the canvas was being fed BEFORE the click so
    // we can prove the new group was added by the click handler.
    const before = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    expect(before.nodeGroups ?? {}).toEqual({});
    act(() => {
      fireEvent.click(button);
    });
    const after = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    expect(after.nodeGroups).toBeDefined();
    const groupIds = Object.keys(after.nodeGroups ?? {});
    expect(groupIds).toHaveLength(1);
    const newGroup = after.nodeGroups?.[groupIds[0]];
    expect(newGroup).toEqual({
      label: "Group 1",
      nodeIds: ["a", "b"],
      exposedParams: [],
    });
    // US-042: after the click, the group-settings panel mounts in the
    // right rail (the page passes the new id through `activeGroupId`).
    const stub = screen.getByTestId("node-settings-stub");
    expect(stub.getAttribute("data-active-group-id")).toBe(groupIds[0]);
    const panel = screen.getByTestId("group-node-settings");
    expect(panel).toBeInTheDocument();
    expect(panel.getAttribute("data-group-id")).toBe(groupIds[0]);
  });
});

// ---------------------------------------------------------------------------
// US-049 Scenario 3 — top-bar "Auto-arrange" button
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-049 Scenario 3: Auto-arrange button", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  it("relays the helper output through onConfigChange and asks for fitView", async () => {
    const template = makeTemplate(buildTemplateConfig({ positions: "all" }));
    renderPage(template);

    const positionsBefore = readPositionsFromCanvas();
    expect(positionsBefore.a).toEqual({ x: 10, y: 20 });

    const button = screen.getByTestId("auto-arrange-button");
    await act(async () => {
      fireEvent.click(button);
      // The handler defers fitView one macrotask via setTimeout.
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const positionsAfter = readPositionsFromCanvas();
    // Every node still has a position
    for (const id of ["a", "b", "c"]) {
      expect(positionsAfter[id]).toBeDefined();
    }
    // At least one position changed away from the original stub
    const changed = ["a", "b", "c"].some(
      (id) =>
        positionsAfter[id]?.x !== positionsBefore[id]?.x ||
        positionsAfter[id]?.y !== positionsBefore[id]?.y,
    );
    expect(changed).toBe(true);
    expect(fitViewMock).toHaveBeenCalled();
  });

  it("is disabled when the editor has no nodes", () => {
    renderPage();
    const button = screen.getByTestId("auto-arrange-button");
    expect(button).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// US-043 — Simplified-view top-bar Switch
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-043-simplified-view-toggle.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-043: Simplified-view toggle", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  it("Scenario 1: a 'Simplified view' Switch is present in the top bar", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const toggle = screen.getByTestId("simplified-view-toggle");
    expect(toggle).toBeInTheDocument();
  });

  it("passes the toggle state through to the canvas (false → true → false)", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    // Starts OFF — canvas receives `simplifiedView: false`.
    expect(capturedCanvasProps.current?.simplifiedView).toBe(false);
    const toggle = screen.getByTestId("simplified-view-toggle");
    act(() => {
      fireEvent.click(toggle);
    });
    expect(capturedCanvasProps.current?.simplifiedView).toBe(true);
    // Toggling OFF — back to false.
    act(() => {
      fireEvent.click(toggle);
    });
    expect(capturedCanvasProps.current?.simplifiedView).toBe(false);
  });

  it("Scenario 5: a chip click opens GroupNodeSettings for that group via onGroupChipClick", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    // Drive the canvas-mock's `onGroupChipClick` so the page promotes
    // the clicked group into `activeGroupId`. The right-rail stub
    // surfaces the value via `data-active-group-id`.
    const onGroupChipClick = capturedCanvasProps.current?.onGroupChipClick as
      | ((groupId: string) => void)
      | undefined;
    if (!onGroupChipClick) {
      throw new Error("Canvas stub did not capture onGroupChipClick");
    }
    act(() => {
      onGroupChipClick("g_42");
    });
    const stub = screen.getByTestId("node-settings-stub");
    expect(stub.getAttribute("data-active-group-id")).toBe("g_42");
    expect(screen.getByTestId("group-node-settings")).toBeInTheDocument();
  });

  it("clears any activeGroupId when the simplified-view toggle flips OFF", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const toggle = screen.getByTestId("simplified-view-toggle");
    // Flip ON, then click a chip to set activeGroupId.
    act(() => {
      fireEvent.click(toggle);
    });
    expect(capturedCanvasProps.current?.simplifiedView).toBe(true);
    const onGroupChipClick = capturedCanvasProps.current?.onGroupChipClick as
      | ((groupId: string) => void)
      | undefined;
    if (!onGroupChipClick) {
      throw new Error("Canvas stub did not capture onGroupChipClick");
    }
    act(() => {
      onGroupChipClick("g_42");
    });
    expect(
      screen
        .getByTestId("node-settings-stub")
        .getAttribute("data-active-group-id"),
    ).toBe("g_42");
    // Flip OFF — the right-rail returns to its empty state (no active
    // group, no selected node).
    act(() => {
      fireEvent.click(toggle);
    });
    expect(capturedCanvasProps.current?.simplifiedView).toBe(false);
    expect(
      screen
        .getByTestId("node-settings-stub")
        .getAttribute("data-active-group-id"),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// US-081 — "History" top-bar button
//   feature-docs/20260528-workflow-builder-phase2-versioning-ui/user_stories/
//   US-081-history-top-bar-button-and-hook.md (Scenarios 1, 2, 4)
// ---------------------------------------------------------------------------

/**
 * Renders the page directly under the `:workflowId/edit-v2` route so
 * `mode="edit"` + a defined `workflowId` flow through to the top-bar
 * disabled-state checks. The default `renderPage` only supports
 * create-mode entries.
 */
function renderEditPage(workflowId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <MemoryRouter
          initialEntries={[{ pathname: `/workflows/${workflowId}/edit-v2` }]}
        >
          <Routes>
            <Route
              path="/workflows/create-v2"
              element={<WorkflowEditorV2Page mode="create" />}
            />
            <Route
              path="/workflows/:workflowId/edit-v2"
              element={<WorkflowEditorV2Page mode="edit" />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("WorkflowEditorV2Page — US-081: History top-bar button", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  it("Scenario 1: renders the History button in edit mode and clicking it opens the drawer", async () => {
    renderEditPage("workflow-7");
    const button = screen.getByTestId("history-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/History/i);
    expect(button).not.toBeDisabled();

    // Mantine only renders the Drawer body when `opened=true`. The
    // `useWorkflowVersions` mock in this file returns an empty list, so
    // the open drawer renders `VersionHistoryDrawer`'s empty-state node
    // — `history-drawer-empty` doubles as our open/closed signal.
    expect(
      screen.queryByTestId("history-drawer-empty"),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    // The Drawer body mounts inside a Mantine portal — `findByTestId`
    // searches `document.body`, so the portaled empty-state node is
    // visible.
    const emptyState = await screen.findByTestId("history-drawer-empty");
    expect(emptyState).toBeInTheDocument();
  });

  it("Scenario 1: History button sits between Save and Run this workflow in the DOM", () => {
    renderEditPage("workflow-7");
    const saveBtn = screen.getByTestId("save-button");
    const historyBtn = screen.getByTestId("history-button");
    const runBtn = screen.getByTestId("run-this-workflow-button");

    // `compareDocumentPosition` returns a bitmask. The bit `DOCUMENT_POSITION_FOLLOWING`
    // (4) is set when the argument node follows the receiver in
    // document order.
    expect(
      saveBtn.compareDocumentPosition(historyBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      historyBtn.compareDocumentPosition(runBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Scenario 2: History button is disabled in create mode", () => {
    renderPage();
    const button = screen.getByTestId("history-button");
    expect(button).toBeDisabled();
  });

  it("Scenario 2: tooltip 'Save the workflow first' surfaces on hover when the button is disabled", async () => {
    renderPage();
    const button = screen.getByTestId("history-button");
    expect(button).toBeDisabled();
    // Same pattern as DocumentUploadPanel's tooltip test — Mantine's
    // Tooltip relays hover from a disabled child via its wrapper, so
    // `mouseEnter` on the button surfaces the floating label.
    fireEvent.mouseEnter(button);
    await waitFor(() => {
      expect(screen.getByText("Save the workflow first")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// US-153 — "Run history" top-bar button
//   feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/
//   US-153-run-history-drawer-and-filters.md (Scenario 1)
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-153: Run history top-bar button", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    fitViewMock.mockClear();
  });

  it("Scenario 1: renders the Run history button in edit mode and clicking it opens the drawer", async () => {
    renderEditPage("workflow-7");
    const button = screen.getByTestId("run-history-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/Run history/i);
    expect(button).not.toBeDisabled();

    // Drawer body is gated by `opened={runHistoryDrawerOpen}` — the
    // `run-history-drawer` body-testid is only in the DOM after click.
    expect(screen.queryByTestId("run-history-drawer")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    const body = await screen.findByTestId("run-history-drawer");
    expect(body).toBeInTheDocument();
  });

  it("Scenario 1: Run history button sits between Save and Run this workflow in the DOM", () => {
    renderEditPage("workflow-7");
    const saveBtn = screen.getByTestId("save-button");
    const runHistoryBtn = screen.getByTestId("run-history-button");
    const runBtn = screen.getByTestId("run-this-workflow-button");

    expect(
      saveBtn.compareDocumentPosition(runHistoryBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      runHistoryBtn.compareDocumentPosition(runBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Scenario 1: Run history button is disabled in create mode", () => {
    renderPage();
    const button = screen.getByTestId("run-history-button");
    expect(button).toBeDisabled();
  });

  it("Scenario 1: tooltip 'Save the workflow first' surfaces on hover when the button is disabled", async () => {
    renderPage();
    const button = screen.getByTestId("run-history-button");
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button);
    await waitFor(() => {
      // Two buttons share the same tooltip copy (history + run-history)
      // — `getAllByText` accepts either.
      expect(
        screen.getAllByText("Save the workflow first").length,
      ).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// US-121 — `entryNodeId` autoset on source-node-first drop
//   feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/
//   US-121-entry-node-autoset.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-121: entryNodeId autoset on source drop", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  /**
   * Drives the palette-mock's `onAddSource` callback so the page's
   * `addSource` callback fires the same way it would after a real drop.
   */
  function dispatchAddSource(sourceType: string) {
    const onAddSource = capturedPaletteProps.current?.onAddSource as
      | ((type: string) => void)
      | undefined;
    if (!onAddSource) {
      throw new Error("Palette stub did not capture onAddSource");
    }
    act(() => {
      onAddSource(sourceType);
    });
  }

  function dispatchAddActivity(activityType: string) {
    const onAddActivity = capturedPaletteProps.current?.onAddActivity as
      | ((type: string) => void)
      | undefined;
    if (!onAddActivity) {
      throw new Error("Palette stub did not capture onAddActivity");
    }
    act(() => {
      onAddActivity(activityType);
    });
  }

  function readConfigFromCanvas(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) {
      throw new Error("Canvas stub did not capture config");
    }
    return config;
  }

  it("Scenario 1: source dropped on empty canvas sets entryNodeId to the new source id", () => {
    renderPage();
    // Pre-condition: the editor opens empty (the default EMPTY_CONFIG
    // surfaces `entryNodeId: ""` + `nodes: {}`).
    const before = readConfigFromCanvas();
    expect(Object.keys(before.nodes)).toHaveLength(0);
    expect(before.entryNodeId).toBe("");

    dispatchAddSource("source.api");

    const after = readConfigFromCanvas();
    const sourceIds = Object.keys(after.nodes);
    expect(sourceIds).toHaveLength(1);
    // The new node is a source node with the registered subtype.
    const newNode = after.nodes[sourceIds[0]];
    expect(newNode.type).toBe("source");
    // And the workflow's entryNodeId points at that new source.
    expect(after.entryNodeId).toBe(sourceIds[0]);
  });

  it("Scenario 2: additional source drop on a non-empty canvas does NOT rewrite entryNodeId", () => {
    renderPage();
    // First drop establishes the entry.
    dispatchAddSource("source.api");
    const afterFirst = readConfigFromCanvas();
    const firstSourceId = Object.keys(afterFirst.nodes)[0];
    expect(afterFirst.entryNodeId).toBe(firstSourceId);

    // Second drop — entryNodeId must NOT move.
    dispatchAddSource("source.upload");
    const afterSecond = readConfigFromCanvas();
    expect(Object.keys(afterSecond.nodes)).toHaveLength(2);
    expect(afterSecond.entryNodeId).toBe(firstSourceId);
  });

  it("Scenario 2 (activity variant): activity drop after a source leaves entryNodeId unchanged", () => {
    renderPage();
    dispatchAddSource("source.api");
    const afterSource = readConfigFromCanvas();
    const sourceId = Object.keys(afterSource.nodes)[0];
    expect(afterSource.entryNodeId).toBe(sourceId);

    // Drop an activity — entryNodeId stays on the source.
    dispatchAddActivity("data.transform");
    const afterActivity = readConfigFromCanvas();
    expect(Object.keys(afterActivity.nodes)).toHaveLength(2);
    expect(afterActivity.entryNodeId).toBe(sourceId);
  });

  it("Scenario 3: legacy workflow with entryNodeId pointing at an activity is preserved on open AND a later source drop does NOT autoset", () => {
    // Build a legacy-shaped workflow: one activity, entryNodeId pointing
    // at it, no source nodes. The page's edit-mode hydration effect
    // pushes this into local state.
    const legacyConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Legacy" },
      ctx: {},
      nodes: {
        legacy_activity: {
          id: "legacy_activity",
          type: "activity",
          label: "Legacy activity",
          activityType: "data.transform",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "legacy_activity",
    };
    existingWorkflowRef.current = {
      id: "wf-legacy",
      name: "Legacy",
      description: "",
      config: legacyConfig,
      workflowVersionId: "wf-legacy-v1",
    };
    renderEditPage("wf-legacy");

    const hydrated = readConfigFromCanvas();
    expect(hydrated.entryNodeId).toBe("legacy_activity");

    // Now drop a source node — the canvas is NOT empty, so the autoset
    // must not fire. entryNodeId stays pinned to the legacy activity.
    dispatchAddSource("source.api");
    const after = readConfigFromCanvas();
    expect(Object.keys(after.nodes)).toHaveLength(2);
    expect(after.entryNodeId).toBe("legacy_activity");
  });
});

// ---------------------------------------------------------------------------
// US-148 — In-canvas "Try" top-bar button (Phase 4 — Milestone E)
//   feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/
//   US-148-in-canvas-try-button.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — US-148: in-canvas Try button", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    capturedRunDrawerProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  /**
   * Builds a fully-populated existing workflow record matching the
   * shape `useWorkflow` returns to the editor. Each helper varies only
   * in the `config.nodes` map + the `config.ctx` declarations so the
   * tests can exercise the page's `tryButtonVisible` predicate.
   */
  function makeExistingWorkflow(
    config: GraphWorkflowConfig,
  ): Record<string, unknown> {
    return {
      id: "wf-test",
      name: "Test",
      description: "",
      config,
      workflowVersionId: "wf-test-v1",
    };
  }

  function configWithSourceApi(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "Source.api workflow" },
      ctx: {
        callerInput: { type: "string" },
      },
      nodes: {
        api_source_1: {
          id: "api_source_1",
          type: "source",
          label: "API source",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
      },
      edges: [],
      entryNodeId: "api_source_1",
    };
  }

  function configWithSourceUploadOnly(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "Upload-only workflow" },
      ctx: {},
      nodes: {
        upload_source_1: {
          id: "upload_source_1",
          type: "source",
          label: "Upload source",
          sourceType: "source.upload",
          parameters: {
            allowedMimeTypes: ["application/pdf"],
            maxFileSizeMB: 10,
            ctxKey: "documentUrl",
          },
        },
      },
      edges: [],
      entryNodeId: "upload_source_1",
    };
  }

  function configWithMixedSources(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "Mixed workflow" },
      ctx: {
        callerInput: { type: "string" },
      },
      nodes: {
        api_source_1: {
          id: "api_source_1",
          type: "source",
          label: "API source",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
        upload_source_1: {
          id: "upload_source_1",
          type: "source",
          label: "Upload source",
          sourceType: "source.upload",
          parameters: {
            allowedMimeTypes: ["application/pdf"],
            maxFileSizeMB: 10,
            ctxKey: "documentUrl",
          },
        },
      },
      edges: [],
      entryNodeId: "api_source_1",
    };
  }

  function configWithLegacyIsInputCtx(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "Legacy isInput workflow" },
      ctx: {
        callerInput: { type: "string", isInput: true },
      },
      nodes: {
        legacy_activity: {
          id: "legacy_activity",
          type: "activity",
          label: "Legacy activity",
          activityType: "data.transform",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "legacy_activity",
    };
  }

  it("Scenario 1: renders a Try button between Run this workflow and Save as library", () => {
    existingWorkflowRef.current = makeExistingWorkflow(configWithSourceApi());
    renderEditPage("wf-test");

    const tryBtn = screen.getByTestId("try-button");
    expect(tryBtn).toBeInTheDocument();
    expect(tryBtn).toHaveTextContent(/^Try$/);

    const runBtn = screen.getByTestId("run-this-workflow-button");
    const saveAsLibraryBtn = screen.getByTestId("save-as-library-button");
    expect(
      runBtn.compareDocumentPosition(tryBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tryBtn.compareDocumentPosition(saveAsLibraryBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Scenario 2: Try button is disabled in create mode with the 'Save the workflow first' tooltip", async () => {
    renderPage();
    // Create mode → no source nodes yet, no isInput ctx → the predicate
    // simplifies to "no source.upload" so the button is visible-and-disabled
    // (the documented Phase-4 behaviour for empty / legacy workflows).
    const tryBtn = screen.getByTestId("try-button");
    expect(tryBtn).toBeDisabled();
    fireEvent.mouseEnter(tryBtn);
    await waitFor(() => {
      expect(screen.getByText("Save the workflow first")).toBeInTheDocument();
    });
  });

  it('Scenario 3: clicking Try opens the Run drawer with openMode="try"', async () => {
    existingWorkflowRef.current = makeExistingWorkflow(configWithSourceApi());
    renderEditPage("wf-test");

    // Drawer is closed initially.
    expect(
      screen.queryByTestId("run-workflow-drawer-stub"),
    ).not.toBeInTheDocument();

    const tryBtn = screen.getByTestId("try-button");
    await act(async () => {
      fireEvent.click(tryBtn);
    });

    const drawerStub = await screen.findByTestId("run-workflow-drawer-stub");
    expect(drawerStub.getAttribute("data-open-mode")).toBe("try");
    // Confirm the page passed the openMode prop through to the drawer.
    expect(capturedRunDrawerProps.current?.opened).toBe(true);
    expect(capturedRunDrawerProps.current?.openMode).toBe("try");
  });

  it('Scenario 3 (Run vs Try): the existing Run this workflow button opens the drawer with openMode="run"', async () => {
    existingWorkflowRef.current = makeExistingWorkflow(configWithSourceApi());
    renderEditPage("wf-test");

    const runBtn = screen.getByTestId("run-this-workflow-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    const drawerStub = await screen.findByTestId("run-workflow-drawer-stub");
    expect(drawerStub.getAttribute("data-open-mode")).toBe("run");
    expect(capturedRunDrawerProps.current?.openMode).toBe("run");
  });

  it("Scenario 4: Try button is HIDDEN for source.upload-only workflows", () => {
    existingWorkflowRef.current = makeExistingWorkflow(
      configWithSourceUploadOnly(),
    );
    renderEditPage("wf-test");

    expect(screen.queryByTestId("try-button")).not.toBeInTheDocument();
    // The Run button stays visible — only the Try button is conditional.
    expect(screen.getByTestId("run-this-workflow-button")).toBeInTheDocument();
  });

  it("Scenario 5: Try button is VISIBLE for mixed workflows (source.api + source.upload)", () => {
    existingWorkflowRef.current = makeExistingWorkflow(
      configWithMixedSources(),
    );
    renderEditPage("wf-test");

    expect(screen.getByTestId("try-button")).toBeInTheDocument();
  });

  it("Scenario 5 (legacy isInput): Try button is VISIBLE when isInput-flagged ctx coexists with source.upload", () => {
    const config = configWithSourceUploadOnly();
    config.ctx = { callerInput: { type: "string", isInput: true } };
    existingWorkflowRef.current = makeExistingWorkflow(config);
    renderEditPage("wf-test");

    expect(screen.getByTestId("try-button")).toBeInTheDocument();
  });

  it("Scenario 5 (legacy isInput, no source): Try button is VISIBLE for legacy isInput-only workflows", () => {
    existingWorkflowRef.current = makeExistingWorkflow(
      configWithLegacyIsInputCtx(),
    );
    renderEditPage("wf-test");

    expect(screen.getByTestId("try-button")).toBeInTheDocument();
  });
});
