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
import { Notifications, notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  catalogEntriesRef,
  validationRef,
  capturedRunDrawerProps,
  capturedSettingsPanelProps,
  capturedValidationDrawerProps,
  fitViewMock,
  measuredNodes,
  setCenterMock,
  setNodesMock,
  setEdgesMock,
  existingWorkflowRef,
  versionQueryRef,
  capturedVersionQueryArgs,
  capturedRunHistoryProps,
  saveValidationRef,
} = vi.hoisted(() => {
  return {
    capturedCanvasProps: { current: null as null | Record<string, unknown> },
    capturedCreateDto: { current: null as null | Record<string, unknown> },
    capturedValidationDrawerProps: {
      current: null as null | Record<string, unknown>,
    },
    // US-121 — palette stub captures the add-* callbacks so tests can
    // invoke `onAddSource(...)` directly without spinning up the real
    // palette UI.
    capturedPaletteProps: { current: null as null | Record<string, unknown> },
    // The merged activity catalog, mutable so a test can model the entry
    // arriving AFTER a publish (which is when `onAddDynamicNode` fires).
    catalogEntriesRef: { current: [] as Array<Record<string, unknown>> },
    // D-11: mutable so a test can put the graph into an error state.
    validationRef: {
      current: {
        errorCount: 0,
        warningCount: 0,
        isPending: false,
        errorsByNode: new Map(),
        errors: [] as Array<Record<string, unknown>>,
      },
    },
    // US-148 — the Run drawer stub captures its props so the trigger
    // tests can verify `openMode` was set correctly by whichever
    // top-bar button opened the drawer.
    capturedRunDrawerProps: {
      current: null as null | Record<string, unknown>,
    },
    // Regression test — capture the settings panel's onConfigChange so
    // we can verify the page routes its writes through the synthetic
    // strip helper (handleCanvasConfigChange) just like the canvas does.
    capturedSettingsPanelProps: {
      current: null as null | Record<string, unknown>,
    },
    // What the stubbed xyflow instance reports from `getNodes()`. Default is
    // empty, which is what most tests want (auto-arrange falls back to its
    // default node width). The arrange-on-load poll only fires once every node
    // reports a measured width, so that test populates this.
    measuredNodes: { current: [] as unknown[] },
    fitViewMock: vi.fn(),
    // G-010 — the page must drive xyflow's own selection store so a
    // programmatic selection STICKS. These record that it did.
    setNodesMock: vi.fn(),
    setEdgesMock: vi.fn(),
    // G-004 — what `useWorkflowVersion` resolves to, and the (lineageId,
    // versionId) it was asked for.
    versionQueryRef: {
      current: { data: undefined, isLoading: false, isError: false } as {
        data?: { config: GraphWorkflowConfig };
        isLoading: boolean;
        isError: boolean;
      },
    },
    capturedVersionQueryArgs: { current: null as null | [string, string] },
    capturedRunHistoryProps: {
      current: null as null | Record<string, unknown>,
    },
    // Item 6X — the jump-to-producer handler pans via the live instance's
    // `setCenter`; capture calls so the page test can assert the pan fired.
    setCenterMock: vi.fn(),
    // US-121 Scenario 3 — let tests inject a fake existing workflow that
    // the page's `useWorkflow` mock will return, so edit-mode hydration
    // exercises the legacy-entryNodeId-preservation path.
    existingWorkflowRef: { current: null as null | Record<string, unknown> },
    // Draft-save (2026-08-02) — what the save mutations report back.
    // Mutable so a test can model a save that persisted an invalid config
    // and assert the amber "issues remain" toast.
    saveValidationRef: {
      current: { valid: true, errors: [] } as {
        valid: boolean;
        errors: Array<{ path: string; message: string; severity?: string }>;
      },
    },
  };
});

vi.mock("./canvas/WorkflowEditorCanvas", () => {
  return {
    WorkflowEditorCanvas: (props: Record<string, unknown>) => {
      capturedCanvasProps.current = props;
      // Simulate xyflow handing back an instance once mounted so the page
      // can trigger fitView on Auto-arrange, and `setNodes` (a no-op here)
      // so `selectNodeSticky` — used by `handleFixNodeInput` — doesn't
      // throw when a test drives the canvas's `onFixNodeInput` callback.
      const onReady = props.onReactFlowReady as
        | ((instance: {
            fitView: typeof fitViewMock;
            setCenter: typeof setCenterMock;
            setNodes: typeof setNodesMock;
            setEdges: typeof setEdgesMock;
            getNodes: () => unknown[];
            getNode: (id: string) => unknown;
            getZoom: () => number;
          }) => void)
        | undefined;
      React.useEffect(() => {
        onReady?.({
          fitView: fitViewMock,
          // Item 6X — jump-to-producer pans via setCenter.
          setCenter: setCenterMock,
          // The stub doesn't simulate xyflow's selection side effects; the
          // spies only record that the page went through the live store.
          setNodes: setNodesMock,
          setEdges: setEdgesMock,
          // Auto-arrange reads measured node widths off the live instance,
          // and the arrange-on-load poll waits for every node to report one.
          // Defaults to none, so layoutGraph falls back to its default width —
          // the width-packing maths is covered in auto-layout.test.ts.
          getNodes: () => measuredNodes.current,
          // Item 6X — the stub reports no resolved node so the page falls
          // back to reading the position from config (still calls setCenter).
          getNode: () => undefined,
          getZoom: () => 1,
        });
      }, [onReady]);
      return <div data-testid="canvas-stub" />;
    },
  };
});

// Mantine's <Notifications/> host does not actually mount its toasts under
// jsdom, so assert on the payload the editor hands the notifications system,
// and render the message element directly when a test needs to click inside
// it. Same approach as WorkflowEditorCanvas.test.tsx.
vi.mock("@mantine/notifications", () => ({
  Notifications: () => null,
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock("./palette/ActivityPalette", () => ({
  ActivityPalette: (props: Record<string, unknown>) => {
    capturedPaletteProps.current = props;
    return <div data-testid="palette-stub" />;
  },
}));

vi.mock("./settings/NodeSettingsPanel", () => ({
  NodeSettingsPanel: (props: Record<string, unknown>) => {
    capturedSettingsPanelProps.current = props;
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

// G-004 — capture the run-history drawer's onReplay so tests can enter
// replay without driving the real list UI.
vi.mock("./run-history/RunHistoryDrawer", () => ({
  RunHistoryDrawer: (props: Record<string, unknown>) => {
    capturedRunHistoryProps.current = props;
    return <div data-testid="run-history-drawer" />;
  },
}));

vi.mock("./settings/WorkflowSettingsDrawer", () => ({
  WorkflowSettingsDrawer: (props: Record<string, unknown>) =>
    props.opened ? <div data-testid="workflow-settings-drawer-stub" /> : null,
}));

vi.mock("./validation/ValidationDrawer", () => ({
  ValidationDrawer: (props: Record<string, unknown>) => {
    capturedValidationDrawerProps.current = props;
    return null;
  },
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

// Dynamic-node merged catalog hook calls `useGroup()`, which requires the
// app-level `GroupProvider` upstream. Tests don't mount that provider, so
// stub the hook + the helper the page imports alongside it.
vi.mock("./dynamic-nodes", () => ({
  ACTIVITY_CATALOG_QUERY_KEY: ["activity-catalog"],
  useActivityCatalog: () => ({
    entries: catalogEntriesRef.current,
    isLoading: false,
    error: null,
  }),
  materialiseParamDefaults: () => ({}),
}));

vi.mock("./validation/useGraphValidation", () => ({
  useGraphValidation: () => validationRef.current,
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
  // UX walkthrough 2026-07-29 — the top-bar WorkflowSwitcher lists
  // all workflows; an empty list keeps it inert in these page tests.
  useWorkflows: () => ({ data: [], isLoading: false }),
  useWorkflow: () => ({
    data: existingWorkflowRef.current ?? undefined,
    isLoading: false,
  }),
  useCreateWorkflow: () => ({
    // Draft-save (2026-08-02): mutations resolve { workflow, validation } —
    // the page reads `workflow.id` for navigation and `validation` for the
    // green-vs-amber saved toast.
    mutateAsync: async (dto: Record<string, unknown>) => {
      capturedCreateDto.current = dto;
      return {
        workflow: { id: "new-workflow-id" },
        validation: saveValidationRef.current,
      };
    },
    isPending: false,
  }),
  useUpdateWorkflow: () => ({
    mutateAsync: async () => ({
      workflow: { id: "wf-1" },
      validation: saveValidationRef.current,
    }),
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
  useWorkflowVersion: (lineageId: string, versionId: string) => {
    capturedVersionQueryArgs.current = [lineageId, versionId];
    return versionQueryRef.current;
  },
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

import { projectGroupedConfig } from "./canvas/group-projection";
import { ORPHANED_DELETE_TOAST_ID } from "./delete-orphan-toast";
import { resolveWireableInputRows } from "./settings/input-row-resolution";
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
    ? { pathname: "/workflows/create", state: { template } }
    : { pathname: "/workflows/create" };
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <RouterProvider router={makeEditorRouter([initialEntry])} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

/**
 * G-027's leave-guard uses react-router's `useBlocker`, which only exists on a
 * DATA router — the same kind `App.tsx` builds with `createBrowserRouter`. The
 * old `<MemoryRouter><Routes>` harness is a non-data router and would throw, so
 * every page render goes through this helper instead.
 */
function makeEditorRouter(
  initialEntries: (string | { pathname: string; state?: unknown })[],
) {
  return createMemoryRouter(
    [
      {
        path: "/workflows/create",
        element: <WorkflowEditorV2Page mode="create" />,
      },
      {
        path: "/workflows/:workflowId/edit",
        element: <WorkflowEditorV2Page mode="edit" />,
      },
    ],
    { initialEntries },
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
// Draft-save (UX walkthrough item 3, 2026-08-02) — saving always
// persists; the backend's verdict picks the toast. Green when the saved
// config is clean, amber ("Created as a draft") when it still cannot run.
//
// P-6 (2026-08-03) rewrote the amber body: one user-facing line plus a
// "Review issues" action that opens the ValidationDrawer, instead of up to
// three raw `path — message` pairs pasted into the notification.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — draft-save toast", () => {
  beforeEach(() => {
    capturedCreateDto.current = null;
    capturedValidationDrawerProps.current = null;
    saveValidationRef.current = { valid: true, errors: [] };
    vi.mocked(notifications.show).mockClear();
    vi.mocked(notifications.hide).mockClear();
  });

  async function clickSave() {
    const saveButton = screen.getByRole("button", { name: /^Save$/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });
  }

  /** The last payload handed to `notifications.show`. */
  function lastToast(): Record<string, unknown> {
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    const calls = showMock.mock.calls;
    if (calls.length === 0) throw new Error("no notification was raised");
    return calls[calls.length - 1][0] as Record<string, unknown>;
  }

  it("shows the green toast when the saved config is clean", async () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    await clickSave();
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "green", title: "Created" }),
    );
  });

  it("saves AND shows the amber draft toast when the verdict has errors", async () => {
    saveValidationRef.current = {
      valid: false,
      errors: [
        {
          path: "nodes.b.inputs.fileData",
          message: "Input port has no source",
          severity: "error",
        },
      ],
    };
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    await clickSave();
    // The save itself went through — the dto reached the mutation.
    expect(capturedCreateDto.current).toBeTruthy();
    const toast = lastToast();
    expect(toast.color).toBe("yellow");
    expect(toast.title).toBe("Created as a draft");
    // One user-facing line. The validator's own `path` strings stay OUT of it
    // — they belong in the drawer, which is what the action opens.
    const body = render(
      <MantineProvider>{toast.message as React.ReactNode}</MantineProvider>,
    );
    expect(body.container.textContent).toContain(
      "1 issue to fix before it can run",
    );
    expect(body.container.textContent).not.toContain("nodes.b.inputs.fileData");
    body.unmount();
  });

  it("counts only severity-error findings, and pluralises", async () => {
    saveValidationRef.current = {
      valid: false,
      errors: [
        { path: "a", message: "broken one", severity: "error" },
        { path: "b", message: "broken two", severity: "error" },
        { path: "c", message: "just a heads-up", severity: "warning" },
      ],
    };
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    await clickSave();
    const toast = lastToast();
    expect(toast.title).toBe("Created as a draft");
    const body = render(
      <MantineProvider>{toast.message as React.ReactNode}</MantineProvider>,
    );
    expect(body.container.textContent).toContain(
      "2 issues to fix before it can run",
    );
    body.unmount();
  });

  it("'Review issues' dismisses the toast and opens the validation drawer", async () => {
    saveValidationRef.current = {
      valid: false,
      errors: [{ path: "a", message: "broken one", severity: "error" }],
    };
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    await clickSave();
    expect(capturedValidationDrawerProps.current?.opened).toBe(false);

    // The toast body is a ReactNode; Mantine's host doesn't mount under jsdom,
    // so render the node itself and click the action inside it.
    const toast = lastToast();
    const body = render(
      <MantineProvider>{toast.message as React.ReactNode}</MantineProvider>,
    );
    act(() => {
      fireEvent.click(body.getByTestId("saved-toast-review-issues"));
    });
    expect(notifications.hide).toHaveBeenCalledWith(toast.id);
    expect(capturedValidationDrawerProps.current?.opened).toBe(true);
    // Opened on the FULL list — no node filter left over from a badge click.
    expect(capturedValidationDrawerProps.current?.filterNodeId).toBeNull();
    body.unmount();
  });
});

// ---------------------------------------------------------------------------
// Edit-mode hydration auto-layout — an opened workflow that carries no node
// positions (seeded workflows from docs-md/workflows/templates/*.json,
// or any API/agent-authored workflow) must be auto-laid-out on open, mirroring
// the create-from-template path. Regression: such workflows rendered
// stacked/out-of-order because hydration skipped layoutGraphIfMissingPositions.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — edit-mode hydration auto-layout", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  it("runs auto-layout when an opened (seeded) workflow has no node positions", async () => {
    existingWorkflowRef.current = {
      id: "wf-seeded",
      name: "Seeded WF",
      description: "",
      slug: "seeded",
      version: 1,
      workflowVersionId: "v-1",
      config: buildTemplateConfig({ positions: "none" }),
    };
    renderEditPage("wf-seeded");
    await waitFor(() => {
      expect(readPositionsFromCanvas().a).toBeDefined();
    });
    const positions = readPositionsFromCanvas();
    for (const id of ["a", "b", "c"]) {
      expect(positions[id]).toBeDefined();
      expect(typeof positions[id]?.x).toBe("number");
      expect(typeof positions[id]?.y).toBe("number");
    }
  });

  it("leaves positions untouched when an opened workflow already has them", async () => {
    existingWorkflowRef.current = {
      id: "wf-positioned",
      name: "Positioned WF",
      description: "",
      slug: "positioned",
      version: 1,
      workflowVersionId: "v-1",
      config: buildTemplateConfig({ positions: "all" }),
    };
    renderEditPage("wf-positioned");
    await waitFor(() => {
      expect(readPositionsFromCanvas().a).toBeDefined();
    });
    const positions = readPositionsFromCanvas();
    expect(positions.a).toEqual({ x: 10, y: 20 });
    expect(positions.b).toEqual({ x: 30, y: 40 });
    expect(positions.c).toEqual({ x: 50, y: 60 });
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

  /**
   * Task 6 moved the secondary actions (including "Group selected")
   * into a Mantine `<Menu>` opened by the `topbar-more-button`. The
   * Menu's dropdown body is lazy-mounted; this helper clicks the
   * trigger inside an `act(...)` so React's microtask queue flushes
   * before tests read menu items.
   */
  async function openMoreMenu() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-more-button"));
    });
  }

  it("Scenario 1: button is enabled once 2 nodes are selected", async () => {
    renderPage(makeTwoNodeTemplate());
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-group-selected");
    // Starts disabled — no selection yet.
    expect(item).toHaveAttribute("data-disabled", "true");
    dispatchSelection(["a", "b"]);
    // Menu re-renders synchronously on parent state change.
    expect(
      screen.getByTestId("topbar-menu-group-selected"),
    ).not.toHaveAttribute("data-disabled", "true");
  });

  it("Scenario 2: button is disabled when 0 or 1 nodes are selected", async () => {
    renderPage(makeTwoNodeTemplate());
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-group-selected");
    expect(item).toHaveAttribute("data-disabled", "true");
    // One node selected → still disabled.
    dispatchSelection(["a"]);
    expect(screen.getByTestId("topbar-menu-group-selected")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    // Tooltip/title on disabled menu item surfaces the hint.
    expect(screen.getByTestId("topbar-menu-group-selected")).toHaveAttribute(
      "title",
      "Select 2+ nodes to group them",
    );
    // Clearing the selection keeps the button disabled.
    dispatchSelection([]);
    expect(screen.getByTestId("topbar-menu-group-selected")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("Scenario 3: clicking adds a nodeGroups[<id>] entry to the next config", async () => {
    renderPage(makeTwoNodeTemplate());
    dispatchSelection(["a", "b"]);
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-group-selected");
    expect(item).not.toHaveAttribute("data-disabled", "true");
    // Capture the config the canvas was being fed BEFORE the click so
    // we can prove the new group was added by the click handler.
    const before = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    expect(before.nodeGroups ?? {}).toEqual({});
    act(() => {
      fireEvent.click(item);
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

  /**
   * G-3 (2026-08-03) — grouping used to flip the canvas into simplified view,
   * because a toast plus a faint dashed ring was all the feedback there was.
   * G-1's container box is drawn around the members in place, so the mode
   * change became cost with no benefit: it moved the author somewhere they
   * had not asked to go and hid the very nodes they had just grouped.
   */
  it("does not flip the canvas into simplified view, and says what the box does", async () => {
    vi.mocked(notifications.show).mockClear();
    renderPage(makeTwoNodeTemplate());
    dispatchSelection(["a", "b"]);
    expect(capturedCanvasProps.current?.simplifiedView).toBe(false);
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-group-selected");
    act(() => {
      fireEvent.click(item);
    });
    // Still expanded — the members stay on screen inside their new box.
    expect(capturedCanvasProps.current?.simplifiedView).toBe(false);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Grouped",
        message:
          "2 steps grouped. Drag the box's header to move them together.",
      }),
    );
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

    // P-3 brought Auto-arrange back out of the More menu into the view group;
    // it kept its `topbar-menu-auto-arrange` testid so e2e still finds it.
    const item = screen.getByTestId("topbar-menu-auto-arrange");
    await act(async () => {
      fireEvent.click(item);
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
    expect(screen.getByTestId("topbar-menu-auto-arrange")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  /**
   * G-4 — in simplified view the graph on screen is chips + ungrouped nodes,
   * so that is what the top-bar button lays out. Laying out the MEMBER graph
   * (what it used to do) only slid each chip to the centre of its own member
   * chain: for the visible nodes, nothing happened.
   */
  it("lays out the CHIP graph when simplified view is on, leaving the expanded arrangement alone", async () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    // a → b → c, with {a,b} collapsed into one group. `a` and `b` start 20px
    // apart on each axis; that offset has to survive the arrange.
    cfg.nodeGroups = { g1: { label: "Stage one", nodeIds: ["a", "b"] } };
    renderPage(makeTemplate(cfg));

    act(() => {
      fireEvent.click(screen.getByTestId("simplified-view-toggle"));
    });
    expect(capturedCanvasProps.current?.simplifiedView).toBe(true);

    const before = readPositionsFromCanvas();
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-menu-auto-arrange"));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const after = readPositionsFromCanvas();

    // W-1 — every member's EXPANDED position survives an arrange performed in
    // the simplified view. Not just the internal offset: the coordinates.
    expect(after.a).toEqual(before.a);
    expect(after.b).toEqual(before.b);
    expect(after.c).toEqual(before.c);

    // ...and the visible graph really was laid out: the chip sits a clear
    // column behind the ungrouped `c`, in the simplified view's own geometry.
    const arranged = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    const chip = projectGroupedConfig(arranged).chips[0];
    const simplifiedC = (
      arranged.nodes.c.metadata as {
        simplifiedPosition?: { x: number; y: number };
      }
    )?.simplifiedPosition;
    expect(simplifiedC?.x ?? 0).toBeGreaterThan(chip.position.x + 248);
    expect(arranged.nodeGroups?.g1.position).toEqual(chip.position);
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

  /**
   * P-3 (2026-08-03) took the Switch back out of the More menu: it changes
   * what you are looking at, which is not a menu item's job. It is a visible
   * control in the view group now, so the tests reach for it directly — the
   * testid is unchanged.
   */

  it("Scenario 1: a 'Simplified' Switch is visible in the top bar", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    expect(screen.getByTestId("simplified-view-toggle")).toBeInTheDocument();
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
    // A chip only exists for a group that IS in the config — chips are
    // projected from `nodeGroups`. Since G-091 the page drops an
    // `activeGroupId` whose group has gone, so the fixture has to declare the
    // group the click names rather than inventing an id.
    const cfg = buildTemplateConfig({ positions: "all" });
    cfg.nodeGroups = {
      g_42: { label: "Stage one", nodeIds: Object.keys(cfg.nodes).slice(0, 1) },
    };
    renderPage(makeTemplate(cfg));
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

  // Found in a browser after G-1 shipped, and it defeated G-1's headline new
  // affordance in the state you are in almost all of the time. The panel
  // renders the group body only when `!node && activeGroupId`, so a lingering
  // node selection outranks the group — and the container is
  // `selectable: false`, so xyflow fires no selection change to clear it
  // either. Clicking a group header with any step selected did nothing at all.
  it("opens the group panel even when a node is already selected", async () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    const firstNodeId = Object.keys(cfg.nodes)[0];
    cfg.nodeGroups = {
      g_42: { label: "Stage one", nodeIds: [firstNodeId] },
    };
    renderPage(makeTemplate(cfg));

    const onSelectNode = capturedCanvasProps.current?.onSelectNode as
      | ((id: string | null) => void)
      | undefined;
    const onGroupChipClick = capturedCanvasProps.current?.onGroupChipClick as
      | ((groupId: string) => void)
      | undefined;
    if (!onSelectNode || !onGroupChipClick) {
      throw new Error("Canvas stub did not capture the selection callbacks");
    }

    act(() => {
      onSelectNode(firstNodeId);
    });
    expect(capturedSettingsPanelProps.current?.selectedNodeId).toBe(
      firstNodeId,
    );

    act(() => {
      onGroupChipClick("g_42");
    });

    // Asserted on the PROPS the page hands the panel, not on rendered output.
    // The panel is mocked here and the mock renders a group body whenever
    // `activeGroupId` is set — it does not reproduce the real component's
    // `!node && activeGroupId` gate, so a render assertion would pass with the
    // bug still present. `selectedNodeId` going null is the half that was
    // actually broken, and it is the half the real gate reads.
    await waitFor(() => {
      expect(capturedSettingsPanelProps.current?.activeGroupId).toBe("g_42");
    });
    expect(capturedSettingsPanelProps.current?.selectedNodeId).toBeNull();
  });

  it("clears any activeGroupId when the simplified-view toggle flips OFF", () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    cfg.nodeGroups = {
      g_42: { label: "Stage one", nodeIds: Object.keys(cfg.nodes).slice(0, 1) },
    };
    renderPage(makeTemplate(cfg));
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
 * Renders the page directly under the `:workflowId/edit` route so
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
        <RouterProvider
          router={makeEditorRouter([
            { pathname: `/workflows/${workflowId}/edit` },
          ])}
        />
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

  /**
   * Task 6 moved the History action from a top-level button into the
   * More menu. Each test opens the menu before interacting with the
   * `topbar-menu-history` item.
   */
  async function openMoreMenu() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-more-button"));
    });
  }

  it("Scenario 1: renders the History menu item in edit mode and clicking it opens the drawer", async () => {
    renderEditPage("workflow-7");
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-history");
    expect(item).toBeInTheDocument();
    expect(item).toHaveTextContent(/History/i);
    expect(item).not.toHaveAttribute("data-disabled", "true");

    // Mantine only renders the Drawer body when `opened=true`. The
    // `useWorkflowVersions` mock in this file returns an empty list, so
    // the open drawer renders `VersionHistoryDrawer`'s empty-state node
    // — `history-drawer-empty` doubles as our open/closed signal.
    expect(
      screen.queryByTestId("history-drawer-empty"),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(item);
    });

    // The Drawer body mounts inside a Mantine portal — `findByTestId`
    // searches `document.body`, so the portaled empty-state node is
    // visible.
    const emptyState = await screen.findByTestId("history-drawer-empty");
    expect(emptyState).toBeInTheDocument();
  });

  it("Scenario 1: More menu trigger sits after Save and Run this workflow in the DOM", () => {
    // Task 6 placed History inside the More menu (a portaled dropdown),
    // so the original "between Save and Run" ordering no longer applies.
    // The right-zone primary cluster keeps Save → Run → More, and the
    // History menu item lives inside More.
    renderEditPage("workflow-7");
    const saveBtn = screen.getByTestId("save-button");
    const runBtn = screen.getByTestId("run-this-workflow-button");
    const moreBtn = screen.getByTestId("topbar-more-button");

    expect(
      saveBtn.compareDocumentPosition(runBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      runBtn.compareDocumentPosition(moreBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Scenario 2: History menu item is disabled in create mode", async () => {
    renderPage();
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-history");
    expect(item).toHaveAttribute("data-disabled", "true");
  });

  it("Scenario 2: History menu item surfaces 'Save the workflow first' via its title attribute when disabled", async () => {
    renderPage();
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-history");
    expect(item).toHaveAttribute("data-disabled", "true");
    // Menu items inside Mantine's Menu don't have a Tooltip wrapper here
    // (Mantine's Menu.Item ignores Tooltip wrapping cleanly). The page
    // sets `title="Save the workflow first"` on the disabled item so the
    // hint still surfaces natively on hover.
    expect(item).toHaveAttribute("title", "Save the workflow first");
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

  /**
   * Task 6 moved Run history into the More menu. Open the menu before
   * interacting with the `topbar-menu-run-history` item.
   */
  async function openMoreMenu() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-more-button"));
    });
  }

  it("Scenario 1: renders the Run history menu item in edit mode and clicking it opens the drawer", async () => {
    renderEditPage("workflow-7");
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-run-history");
    expect(item).toBeInTheDocument();
    expect(item).toHaveTextContent(/Run history/i);
    expect(item).not.toHaveAttribute("data-disabled", "true");

    // Drawer body is gated by `opened={runHistoryDrawerOpen}` — the
    // `run-history-drawer` body-testid is only in the DOM after click.
    expect(screen.queryByTestId("run-history-drawer")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(item);
    });

    const body = await screen.findByTestId("run-history-drawer");
    expect(body).toBeInTheDocument();
  });

  it("Scenario 1: More menu trigger sits after Save and Run this workflow in the DOM", () => {
    // Task 6 placed Run history inside the More menu; the right-zone
    // primary cluster keeps Save → Run → More with secondaries inside.
    renderEditPage("workflow-7");
    const saveBtn = screen.getByTestId("save-button");
    const runBtn = screen.getByTestId("run-this-workflow-button");
    const moreBtn = screen.getByTestId("topbar-more-button");

    expect(
      saveBtn.compareDocumentPosition(runBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      runBtn.compareDocumentPosition(moreBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Scenario 1: Run history menu item is disabled in create mode", async () => {
    renderPage();
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-run-history");
    expect(item).toHaveAttribute("data-disabled", "true");
  });

  it("Scenario 1: Run history menu item surfaces 'Save the workflow first' via its title attribute when disabled", async () => {
    renderPage();
    await openMoreMenu();
    const item = await screen.findByTestId("topbar-menu-run-history");
    expect(item).toHaveAttribute("data-disabled", "true");
    expect(item).toHaveAttribute("title", "Save the workflow first");
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

  it("Scenario 1: renders a Try button between Save and Run this workflow", async () => {
    // Task 6 reordered the right-zone cluster to Save → Try → Run →
    // More, and "Save as library" moved into the More menu.
    existingWorkflowRef.current = makeExistingWorkflow(configWithSourceApi());
    renderEditPage("wf-test");

    const tryBtn = screen.getByTestId("try-button");
    expect(tryBtn).toBeInTheDocument();
    expect(tryBtn).toHaveTextContent(/^Try$/);

    const saveBtn = screen.getByTestId("save-button");
    const runBtn = screen.getByTestId("run-this-workflow-button");
    expect(
      saveBtn.compareDocumentPosition(tryBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tryBtn.compareDocumentPosition(runBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Save as library moved into the More menu — confirm it's available
    // via the new testid.
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-more-button"));
    });
    expect(
      await screen.findByTestId("topbar-menu-save-as-library"),
    ).toBeInTheDocument();
  });

  it("Scenario 2: Try button is disabled in create mode with the 'Save the workflow first' tooltip", async () => {
    renderPage();
    // Create mode → no source nodes yet, no isInput ctx → the predicate
    // simplifies to "no source.upload" so the button is visible-and-disabled
    // (the documented Phase-4 behaviour for empty / legacy workflows).
    const tryBtn = screen.getByTestId("try-button");
    expect(tryBtn).toBeDisabled();
    // Hover the WRAPPER, not the button. A disabled button fires no pointer
    // events in a real browser, so a tooltip bound to the button itself never
    // opens — jsdom dispatches synthetic events on disabled elements anyway,
    // which is how this went unnoticed until it was checked in a browser
    // (2026-08-02). Hovering the wrapper is what a user's pointer does.
    fireEvent.mouseEnter(tryBtn.parentElement as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText("Save the workflow first")).toBeInTheDocument();
    });
  });

  it("Scenario 2b: the Run button explains itself while disabled too", async () => {
    // Run used a native `title` attribute, which Chrome suppresses on a
    // disabled control — so the one moment the reason matters (draft save
    // persisted an unrunnable graph) it was invisible. Now it shares Try's
    // tooltip treatment.
    renderPage();
    const runBtn = screen.getByTestId("run-this-workflow-button");
    expect(runBtn).toBeDisabled();
    fireEvent.mouseEnter(runBtn.parentElement as HTMLElement);
    await waitFor(() => {
      expect(
        screen.getAllByText("Save the workflow first").length,
      ).toBeGreaterThan(0);
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

// ---------------------------------------------------------------------------
// Top bar — P-3 (ruling R-2, 2026-08-03) rebuilt it as four
// divider-separated groups on one baseline:
//
//   [ switcher · name ] │ [ find · simplified · arrange · fit ] │
//   [ undo/redo · validity ] │ [ Save · Try · Run · More ]
//
// Name is a click-to-edit title, Description left for Workflow settings, and
// Simplified view + Auto-arrange left the More menu for the view group. The
// `topbar-zone-*` testids are kept (e2e scopes lookups to them) with
// `topbar-zone-right` now wrapping both right-hand groups.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — top bar (P-3)", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    capturedRunDrawerProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  function renderEditor() {
    return renderPage();
  }

  it("identifies the workflow in the left group: switcher, title, counts", () => {
    renderEditor();
    const left = screen.getByTestId("topbar-zone-left");
    expect(
      within(left).getByTestId("workflow-switcher-button"),
    ).toBeInTheDocument();
    expect(within(left).getByTestId("workflow-title")).toHaveTextContent(
      "New workflow",
    );
    expect(left).toHaveTextContent(/node/);
  });

  it("puts the view controls in the centre group", () => {
    renderEditor();
    const centre = screen.getByTestId("topbar-zone-center");
    expect(within(centre).getByTestId("node-search-input")).toBeInTheDocument();
    expect(
      within(centre).getByTestId("simplified-view-toggle"),
    ).toBeInTheDocument();
    expect(
      within(centre).getByTestId("topbar-menu-auto-arrange"),
    ).toBeInTheDocument();
    expect(within(centre).getByTestId("topbar-fit-view")).toBeInTheDocument();
  });

  it("no longer carries Name/Description text inputs", () => {
    renderEditor();
    // R-2 — the description lives in Workflow settings now, and the name is a
    // title until clicked. Neither is a labelled field in the bar.
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("splits the right zone into a state group and an actions group", () => {
    renderEditor();
    const right = screen.getByTestId("topbar-zone-right");
    const state = within(right).getByTestId("topbar-group-state");
    const actions = within(right).getByTestId("topbar-group-actions");
    expect(within(state).getByTestId("undo-button")).toBeInTheDocument();
    expect(within(state).getByTestId("redo-button")).toBeInTheDocument();
    expect(within(actions).getByTestId("save-button")).toBeInTheDocument();
    expect(
      within(actions).getByTestId("run-this-workflow-button"),
    ).toBeInTheDocument();
    expect(
      within(actions).getByTestId("topbar-more-button"),
    ).toBeInTheDocument();
  });

  it("opens the overflow Menu and lists what is left in it", async () => {
    renderEditor();
    const more = screen.getByTestId("topbar-more-button");
    more.click();
    expect(
      await screen.findByTestId("topbar-menu-history"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-run-history")).toBeInTheDocument();
    expect(
      screen.getByTestId("topbar-menu-save-as-library"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("topbar-menu-group-selected"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("topbar-menu-workflow-settings"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-form-preview")).toBeInTheDocument();
  });

  it("Fit view asks the live instance to fit, and stamps no positions", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const before = readPositionsFromCanvas();
    act(() => {
      fireEvent.click(screen.getByTestId("topbar-fit-view"));
    });
    expect(fitViewMock).toHaveBeenCalled();
    // Unlike Auto-arrange, fit is a camera move — the graph must be untouched.
    expect(readPositionsFromCanvas()).toEqual(before);
  });

  it("disables Auto-arrange and Fit view on an empty graph", () => {
    renderEditor();
    expect(screen.getByTestId("topbar-menu-auto-arrange")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    expect(screen.getByTestId("topbar-fit-view")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("renames through the click-to-edit title and saves the new name", async () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    act(() => {
      fireEvent.click(screen.getByTestId("workflow-title"));
    });
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Renamed workflow" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("workflow-title")).toHaveTextContent(
      "Renamed workflow",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    });
    expect(capturedCreateDto.current?.name).toBe("Renamed workflow");
  });

  it("disables History and Run history menu items in create mode", async () => {
    renderEditor();
    screen.getByTestId("topbar-more-button").click();
    expect(await screen.findByTestId("topbar-menu-history")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    expect(screen.getByTestId("topbar-menu-run-history")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });
});

// ---------------------------------------------------------------------------
// Item 6X — interactive producer input rows: click jumps + pans to the
// producer node; hover highlights it on the canvas.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — item 6X: jump/highlight producer", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedSettingsPanelProps.current = null;
    fitViewMock.mockClear();
    setCenterMock.mockClear();
  });

  it("onJumpToProducer selects the producer node and pans the canvas to it", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const onJump = capturedSettingsPanelProps.current?.onJumpToProducer as
      | ((id: string) => void)
      | undefined;
    if (!onJump) throw new Error("panel stub did not capture onJumpToProducer");
    act(() => {
      onJump("b");
    });
    // Selection flows page → canvas.
    expect(capturedCanvasProps.current?.selectedNodeId).toBe("b");
    // And the page asked the live instance to pan/center the producer.
    expect(setCenterMock).toHaveBeenCalled();
  });

  it("onHoverProducer drives the canvas highlightedNodeId prop (id → null)", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const onHover = capturedSettingsPanelProps.current?.onHoverProducer as
      | ((id: string | null) => void)
      | undefined;
    if (!onHover) throw new Error("panel stub did not capture onHoverProducer");
    // Nothing highlighted initially.
    expect(capturedCanvasProps.current?.highlightedNodeId).toBeNull();
    act(() => {
      onHover("c");
    });
    expect(capturedCanvasProps.current?.highlightedNodeId).toBe("c");
    act(() => {
      onHover(null);
    });
    expect(capturedCanvasProps.current?.highlightedNodeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 5: drag-from-palette → canvas drop handler
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — drag-and-drop from palette", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    capturedRunDrawerProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  /**
   * jsdom doesn't implement `DragEvent` / `DataTransfer`. Build a minimal
   * stand-in that satisfies the page's drop handler (which only calls
   * `getData(...)` + reads `clientX/Y`) and dispatch as a regular Event
   * with the dataTransfer property attached.
   */
  function dispatchDrop(
    target: HTMLElement,
    payload: unknown,
    clientX = 400,
    clientY = 300,
  ) {
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => {
        store.set(type, value);
      },
      getData: (type: string) => store.get(type) ?? "",
      dropEffect: "",
      effectAllowed: "",
    };
    dataTransfer.setData(
      "application/x-workflow-palette",
      JSON.stringify(payload),
    );
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(event, "clientX", { value: clientX });
    Object.defineProperty(event, "clientY", { value: clientY });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  function readConfig(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) throw new Error("Canvas stub did not capture config");
    return config;
  }

  it("dropping a control-flow payload on the canvas adds a switch node", async () => {
    renderPage();
    const dropTarget = await screen.findByTestId("workflow-editor-canvas-drop");
    expect(Object.keys(readConfig().nodes)).toHaveLength(0);

    dispatchDrop(dropTarget, { kind: "controlFlow", type: "switch" });

    const after = readConfig();
    expect(after.nodes.switch_1).toBeDefined();
    expect(after.nodes.switch_1.type).toBe("switch");
  });

  it("dropping an activity payload on the canvas adds an activity node", async () => {
    renderPage();
    const dropTarget = await screen.findByTestId("workflow-editor-canvas-drop");

    dispatchDrop(dropTarget, {
      kind: "activity",
      activityType: "data.transform",
    });

    const after = readConfig();
    const ids = Object.keys(after.nodes);
    expect(ids).toHaveLength(1);
    const node = after.nodes[ids[0]] as ActivityNode;
    expect(node.type).toBe("activity");
    expect(node.activityType).toBe("data.transform");
  });

  it("dropping a source payload on the canvas adds a source node", async () => {
    renderPage();
    const dropTarget = await screen.findByTestId("workflow-editor-canvas-drop");

    dispatchDrop(dropTarget, { kind: "source", sourceType: "source.api" });

    const after = readConfig();
    const ids = Object.keys(after.nodes);
    expect(ids).toHaveLength(1);
    expect(after.nodes[ids[0]].type).toBe("source");
  });

  it("ignores drops without an x-workflow-palette payload", async () => {
    renderPage();
    const dropTarget = await screen.findByTestId("workflow-editor-canvas-drop");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        getData: () => "",
        setData: () => undefined,
      },
    });
    Object.defineProperty(event, "clientX", { value: 100 });
    Object.defineProperty(event, "clientY", { value: 100 });
    act(() => {
      dropTarget.dispatchEvent(event);
    });
    expect(Object.keys(readConfig().nodes)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 7 — Multi-Page Report template integration (map-body synthesis)
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — Multi-Page Report template integration (Task 7)", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    capturedRunDrawerProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  it("synthesises a map-body group around the processSegments body when the template loads", async () => {
    // Load the canonical template fixture from docs-md. Vite resolves
    // JSON via its native loader; the page-test's canvas mock captures
    // the merged `displayConfig` so we can read the synthesised
    // `nodeGroups` entry directly from `capturedCanvasProps.current`.
    const templateConfig = (
      await import(
        "../../../../../docs-md/workflows/templates/multi-page-report-workflow.json"
      )
    ).default as unknown as GraphWorkflowConfig;

    const template: WorkflowTemplate = {
      id: "multi-page-report-workflow",
      name: templateConfig.metadata?.name ?? "Multi-Page Report Workflow",
      description: templateConfig.metadata?.description ?? "",
      tags: templateConfig.metadata?.tags ?? [],
      nodeCount: Object.keys(templateConfig.nodes).length,
      config: templateConfig,
    };

    renderPage(template);

    // The page wraps the user's `config.nodeGroups` with synthesised
    // map-body entries inside its `displayConfig` memo before handing
    // it to the canvas. Inspect the captured config to verify the
    // synthesis flowed through end-to-end.
    const canvasConfig = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    expect(canvasConfig).toBeDefined();
    const groups = canvasConfig?.nodeGroups ?? {};
    const syntheticGroupId = "__map_body_processSegments";
    expect(groups[syntheticGroupId]).toBeDefined();

    const group = groups[syntheticGroupId];
    // synthesizeMapBodyGroups produces `${mapNode.label} · body`.
    expect(group.label).toBe("Process Each Segment · body");
    // BFS from `segmentRouter` → `passthrough` collects all six body nodes.
    const expectedBodyNodes = [
      "segmentRouter",
      "monthlyReportOcr",
      "payStubOcr",
      "bankRecordOcr",
      "unknownDocOcr",
      "passthrough",
    ];
    for (const id of expectedBodyNodes) {
      expect(group.nodeIds).toContain(id);
    }
    expect(group.nodeIds).toHaveLength(expectedBodyNodes.length);
  });
});

// ---------------------------------------------------------------------------
// Regression — NodeSettingsPanel writes must be stripped of synthetic
//   map-body groups before they hit persisted config state.
//
//   Bug: the page passed `displayConfig` (synthetic groups merged in) to
//   `NodeSettingsPanel` but bound its `onConfigChange` to `setConfig`
//   directly — bypassing `handleCanvasConfigChange`'s strip. Editing any
//   real group via the right rail while a map node with body endpoints
//   existed would have persisted `__map_body_*` entries into the saved
//   config.
//
//   Fix: route the panel's onConfigChange through `handleCanvasConfigChange`,
//   the same helper the canvas uses. This test invokes the captured prop
//   directly with a payload containing a synthetic group and asserts that
//   the resulting canvas config has no `__map_body_*` keys.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — NodeSettingsPanel synthetic-group strip", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedSettingsPanelProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  function buildMapWithGroupConfig(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "regression-map-body-strip" },
      ctx: {},
      nodes: {
        entry: makeActivity("entry", { x: 0, y: 0 }),
        mapNode: {
          id: "mapNode",
          type: "map",
          label: "Process Each",
          collectionCtxKey: "items",
          itemCtxKey: "item",
          bodyEntryNodeId: "bodyHead",
          bodyExitNodeId: "bodyTail",
        },
        bodyHead: makeActivity("bodyHead", { x: 200, y: 100 }),
        bodyTail: makeActivity("bodyTail", { x: 400, y: 100 }),
        tail: makeActivity("tail", { x: 600, y: 0 }),
      },
      edges: [
        { id: "e1", source: "entry", target: "mapNode", type: "normal" },
        { id: "e2", source: "bodyHead", target: "bodyTail", type: "normal" },
        { id: "e3", source: "mapNode", target: "tail", type: "normal" },
      ],
      entryNodeId: "entry",
      nodeGroups: {
        g_real: {
          label: "Real Group",
          nodeIds: ["entry", "tail"],
          exposedParams: [],
        },
      },
    };
  }

  it("strips __map_body_* entries from any config the settings panel dispatches", () => {
    const template = makeTemplate(buildMapWithGroupConfig());
    renderPage(template);

    // The page's displayConfig should expose the synthetic group to the
    // canvas (and, by extension, to NodeSettingsPanel — which is exactly
    // the bug surface this regression test guards).
    const canvasConfigBefore = capturedCanvasProps.current
      ?.config as GraphWorkflowConfig;
    const groupsBefore = canvasConfigBefore.nodeGroups ?? {};
    const syntheticId = "__map_body_mapNode";
    expect(groupsBefore[syntheticId]).toBeDefined();
    expect(groupsBefore.g_real).toBeDefined();

    // The panel stub captured the live props. The page must have wired
    // onConfigChange to the strip-on-emit helper, not to setConfig
    // directly.
    const onConfigChange = capturedSettingsPanelProps.current?.onConfigChange as
      | ((next: GraphWorkflowConfig) => void)
      | undefined;
    if (!onConfigChange) {
      throw new Error(
        "NodeSettingsPanel stub did not capture onConfigChange prop",
      );
    }

    // Simulate what GroupNodeSettings does when the user renames a real
    // group: it spreads `config.nodeGroups` (which includes the synthetic
    // entries it was rendered with) and dispatches the merged record.
    const renamed: GraphWorkflowConfig = {
      ...canvasConfigBefore,
      nodeGroups: {
        ...(canvasConfigBefore.nodeGroups ?? {}),
        g_real: {
          ...(canvasConfigBefore.nodeGroups?.g_real ?? {
            label: "",
            nodeIds: [],
            exposedParams: [],
          }),
          label: "Renamed Group",
        },
      },
    };

    act(() => {
      onConfigChange(renamed);
    });

    // After the dispatch, the canvas re-renders with the page's
    // `displayConfig`, which re-synthesises the map-body group on every
    // render. The displayConfig surface will therefore still contain
    // exactly one `__map_body_*` key (the freshly-synthesised one) —
    // that's correct. What MUST be true is that the underlying
    // persisted state has been stripped of synthetic entries: any
    // `__map_body_*` key in `displayConfig` after the dispatch must
    // have come from the synthesis pass, not from the dispatched
    // payload. Verify by counting: exactly one synthetic key (re-
    // synthesised from the unchanged map node), and the real group
    // carries the new label.
    const canvasConfigAfter = capturedCanvasProps.current
      ?.config as GraphWorkflowConfig;
    const groupsAfter = canvasConfigAfter.nodeGroups ?? {};
    expect(groupsAfter.g_real?.label).toBe("Renamed Group");
    const syntheticKeysAfter = Object.keys(groupsAfter).filter((id) =>
      id.startsWith("__map_body_"),
    );
    // Only the freshly re-synthesised entry should be present. If the
    // strip had been bypassed, the dispatched payload's synthetic entry
    // would have been merged with the re-synthesised one (same id),
    // still producing one key — but the source of truth is the save
    // payload below.
    expect(syntheticKeysAfter).toEqual(["__map_body_mapNode"]);

    // The save payload is the source of truth — it serialises the
    // underlying `config` state, NOT `displayConfig`. If the strip
    // worked, the DTO must contain no `__map_body_*` keys.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    });
    expect(capturedCreateDto.current).toBeTruthy();
    const dtoConfig = (
      capturedCreateDto.current as { config: GraphWorkflowConfig }
    ).config;
    for (const id of Object.keys(dtoConfig.nodeGroups ?? {})) {
      expect(id.startsWith("__map_body_")).toBe(false);
    }
    expect(dtoConfig.nodeGroups?.g_real?.label).toBe("Renamed Group");
  });
});

// ---------------------------------------------------------------------------
// Task 7 (auto-wire) — resolveBindings + stripRedundantLocks integration
// ---------------------------------------------------------------------------

describe("auto-wire integration", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

  it("auto-binds inputs when a new edge is drawn between typed activities", async () => {
    // Start with two unconnected typed-port nodes (file.prepare produces
    // preparedData:Document; azureOcr.submit consumes fileData:Document).
    // Simulate the canvas firing onConfigChange with an edge connecting A->B.
    // After handleCanvasConfigChange, the canvas should receive a config
    // where B.inputs includes fileData bound to __auto.A.preparedData.
    const initialConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "auto-wire test" },
      ctx: {},
      nodes: {
        A: {
          id: "A",
          type: "activity",
          label: "A",
          activityType: "file.prepare",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        B: {
          id: "B",
          type: "activity",
          label: "B",
          activityType: "azureOcr.submit",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "A",
    };

    const template = makeTemplate(initialConfig);
    renderPage(template);

    // Simulate the canvas calling onConfigChange after the user draws an edge
    // from A to B (the canvas stub captures the onConfigChange callback).
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as
      | ((next: GraphWorkflowConfig) => void)
      | undefined;
    if (!onConfigChange) {
      throw new Error("Canvas stub did not capture onConfigChange");
    }

    const configWithEdge: GraphWorkflowConfig = {
      ...initialConfig,
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
    };

    act(() => {
      onConfigChange(configWithEdge);
    });

    // After resolveBindings runs, B's fileData input should be bound to
    // __auto.A.preparedData (the synthesised ctx key for A's preparedData output).
    const canvasConfig = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    expect(canvasConfig).toBeDefined();
    const nodeB = canvasConfig?.nodes.B;
    expect(nodeB).toBeDefined();
    const fileDataBinding = (
      nodeB as { inputs?: { port: string; ctxKey: string }[] }
    )?.inputs?.find((b) => b.port === "fileData");
    expect(fileDataBinding).toBeDefined();
    expect(fileDataBinding?.ctxKey).toBe("__auto.A.preparedData");

    // Producer A's output row should also be stamped.
    const nodeA = canvasConfig?.nodes.A;
    const preparedDataBinding = (
      nodeA as { outputs?: { port: string; ctxKey: string }[] }
    )?.outputs?.find((b) => b.port === "preparedData");
    expect(preparedDataBinding).toBeDefined();
    expect(preparedDataBinding?.ctxKey).toBe("__auto.A.preparedData");
  });

  it("strips redundant lock metadata before invoking save", async () => {
    // A node with metadata.lockedInputPorts = ["fileData"] AND an input
    // binding with a non-__auto. ctxKey is "implicitly" locked via the
    // prefix convention. On save, the lockedInputPorts entry should be
    // dropped — the save mutation receives the config without it.
    const configWithRedundantLock: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "strip-locks test" },
      ctx: {},
      nodes: {
        A: {
          id: "A",
          type: "activity",
          label: "A",
          activityType: "file.prepare",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        B: {
          id: "B",
          type: "activity",
          label: "B",
          activityType: "azureOcr.submit",
          // Explicit (non-__auto.) binding — this lock is "implicit" and
          // should be stripped before save because normaliseLocks can re-derive it.
          inputs: [{ port: "fileData", ctxKey: "preparedData" }],
          outputs: [],
          parameters: {},
          metadata: {
            lockedInputPorts: ["fileData"],
          },
        },
      },
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
      entryNodeId: "A",
    };

    const template = makeTemplate(configWithRedundantLock);
    renderPage(template);

    // Click save; the DTO should not contain lockedInputPorts for node B.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    });

    expect(capturedCreateDto.current).toBeTruthy();
    const dtoConfig = (
      capturedCreateDto.current as { config: GraphWorkflowConfig }
    ).config;
    const nodeBInDto = dtoConfig.nodes.B as {
      metadata?: { lockedInputPorts?: string[] };
    };
    expect(nodeBInDto?.metadata?.lockedInputPorts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task 8 (§6.4): connect-summary popover's Fix deep-link
//   The canvas's `onFixNodeInput` prop must be the page's existing
//   `handleFixNodeInput` (already wired to `ValidationDrawer` and the
//   problem-badge click path) so the popover's Fix button reaches the same
//   node-select + focus-input behaviour, not a separate one-off.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — connect summary (§6.4) Fix deep-link", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedSettingsPanelProps.current = null;
  });

  it("passes onFixNodeInput to the canvas, wired to select the node and focus the port", () => {
    const config = buildTemplateConfig({ positions: "all" });
    renderPage(makeTemplate(config));

    const onFixNodeInput = capturedCanvasProps.current?.onFixNodeInput as
      | ((nodeId: string, port: string) => void)
      | undefined;
    expect(onFixNodeInput).toBeInstanceOf(Function);

    act(() => {
      onFixNodeInput?.("b", "fileData");
    });

    expect(capturedSettingsPanelProps.current?.focusInput).toEqual({
      nodeId: "b",
      port: "fileData",
    });
  });
});

// ---------------------------------------------------------------------------
// Node problems badge → node-scoped ValidationDrawer.
//   Clicking a node's problems badge must ALWAYS open the ValidationDrawer
//   filtered to that node (naming every problem), never blind-jump into the
//   bare source picker. The top-bar "Warnings" button opens it UNFILTERED.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — node problems badge", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedSettingsPanelProps.current = null;
    capturedValidationDrawerProps.current = null;
  });

  it("opens the ValidationDrawer filtered to the clicked node, without opening the bare picker", () => {
    const config = buildTemplateConfig({ positions: "all" });
    renderPage(makeTemplate(config));

    const onNodeBadgeClick = capturedCanvasProps.current?.onNodeBadgeClick as
      | ((nodeId: string) => void)
      | undefined;
    expect(onNodeBadgeClick).toBeInstanceOf(Function);

    act(() => {
      onNodeBadgeClick?.("b");
    });

    expect(capturedValidationDrawerProps.current?.opened).toBe(true);
    expect(capturedValidationDrawerProps.current?.filterNodeId).toBe("b");
    // The bare picker deep-link (focusInput) must NOT fire from a badge click.
    expect(capturedSettingsPanelProps.current?.focusInput ?? null).toBeNull();
  });

  it("top-bar Warnings button opens the drawer UNFILTERED", () => {
    const config = buildTemplateConfig({ positions: "all" });
    renderPage(makeTemplate(config));

    // Open a node-scoped view first so we can prove the top-bar path clears it.
    const onNodeBadgeClick = capturedCanvasProps.current?.onNodeBadgeClick as
      | ((nodeId: string) => void)
      | undefined;
    act(() => {
      onNodeBadgeClick?.("b");
    });
    expect(capturedValidationDrawerProps.current?.filterNodeId).toBe("b");

    // onShowAll (wired to clearing the filter) should reset to global.
    const onShowAll = capturedValidationDrawerProps.current?.onShowAll as
      | (() => void)
      | undefined;
    act(() => {
      onShowAll?.();
    });
    expect(capturedValidationDrawerProps.current?.filterNodeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// De-placeholdered activity drop — `addActivity` must NOT stamp a placeholder
// input binding (`ctxKey = portName`) on every input port. A freshly dropped
// node's typed inputs must surface the auto-wire resolver's honest state:
// "unsatisfied" with no upstream producer (NEVER "ctx-bound" / "from
// <portname>"), and the ctx-var auto-declaration must not invent port-named
// ctx keys.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — de-placeholdered activity drop", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedPaletteProps.current = null;
    existingWorkflowRef.current = null;
    fitViewMock.mockClear();
  });

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

  function readConfig(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) throw new Error("Canvas stub did not capture config");
    return config;
  }

  it("drops azureOcr.submit with no placeholder input binding", () => {
    renderPage();
    dispatchAddActivity("azureOcr.submit");
    const config = readConfig();
    const id = Object.keys(config.nodes)[0];
    const node = config.nodes[id] as ActivityNode;
    // No input binding should have been stamped — the resolver owns input
    // binding for a freshly dropped node.
    expect(node.inputs ?? []).toEqual([]);
  });

  it("does not auto-declare port-named ctx vars for a dropped activity", () => {
    renderPage();
    dispatchAddActivity("azureOcr.submit");
    const config = readConfig();
    // The old placeholder path declared ctx vars named after every port
    // (fileData / apimRequestId / statusCode / headers). None of those may
    // leak into ctx now that no binding references them.
    expect(config.ctx.fileData).toBeUndefined();
    expect(config.ctx.apimRequestId).toBeUndefined();
    expect(config.ctx.statusCode).toBeUndefined();
    expect(config.ctx.headers).toBeUndefined();
  });

  it("fileData resolves 'unsatisfied' (not ctx-bound) with no upstream producer", () => {
    renderPage();
    dispatchAddActivity("azureOcr.submit");
    const config = readConfig();
    const id = Object.keys(config.nodes)[0];
    const rows = resolveWireableInputRows(config, id);
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData).toBeDefined();
    expect(fileData?.resolution.status).toBe("unsatisfied");
  });
});

// ---------------------------------------------------------------------------
// G-002/G-003 — deleting a sole producer prunes the orphaned ctx declarations
// (so the surviving consumers visibly break instead of silently reading a
// variable nothing writes) and reports what it broke in a non-blocking toast
// carrying an Undo. No dialog: since G-003 the delete is reversible.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — orphaned ctx keys on delete (G-002)", () => {
  function readLiveConfig(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) throw new Error("Canvas stub did not capture config");
    return config;
  }

  function prepThenOcrTemplate(consumerBound: boolean): WorkflowTemplate {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "orphan-fixture" },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare File",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
          metadata: { position: { x: 0, y: 0 } },
        } as ActivityNode,
        ocr: {
          id: "ocr",
          type: "activity",
          label: "Submit OCR",
          activityType: "azureOcr.submit",
          ...(consumerBound
            ? { inputs: [{ port: "fileData", ctxKey: "preparedFile" }] }
            : {}),
          metadata: { position: { x: 200, y: 0 } },
        } as ActivityNode,
      },
      edges: [{ id: "e1", source: "prep", target: "ocr", type: "normal" }],
      entryNodeId: "prep",
      ctx: { preparedFile: { type: "object" } },
    };
    return makeTemplate(config, "Orphan Fixture");
  }

  function selectAndDelete(nodeId: string) {
    act(() => {
      (capturedCanvasProps.current?.onSelectNode as (id: string) => void)(
        nodeId,
      );
    });
    act(() => {
      (capturedSettingsPanelProps.current?.onDeleteSelected as () => void)();
    });
  }

  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedSettingsPanelProps.current = null;
    vi.restoreAllMocks();
    vi.mocked(notifications.show).mockClear();
    vi.mocked(notifications.hide).mockClear();
  });

  /** The orphaned-delete toast payload, or undefined when none was raised. */
  function orphanToast(): Record<string, unknown> | undefined {
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    return showMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((arg) => arg?.id === ORPHANED_DELETE_TOAST_ID);
  }

  /** Renders the toast body so its copy — and its Undo link — are reachable. */
  function renderToastBody(toast: Record<string, unknown> | undefined) {
    if (!toast) throw new Error("no orphaned-delete toast was raised");
    return render(
      <MantineProvider>{toast.message as React.ReactNode}</MantineProvider>,
    );
  }

  it("deletes without a dialog and toasts what broke", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage(prepThenOcrTemplate(true));
    selectAndDelete("prep");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(readLiveConfig().nodes.prep).toBeUndefined();
    const body = renderToastBody(orphanToast());
    expect(body.container.textContent).toContain(
      'Deleted "Prepare File" — 1 variable lost its source; 1 step reads it.',
    );
  });

  it("prunes the orphaned declaration", () => {
    renderPage(prepThenOcrTemplate(true));
    selectAndDelete("prep");
    const config = readLiveConfig();
    expect(config.nodes.prep).toBeUndefined();
    expect(config.ctx.preparedFile).toBeUndefined();
  });

  it("the toast's Undo restores the node AND its pruned declarations", () => {
    // The crux of retiring the confirm. Deletion prunes `config.ctx`; if undo
    // brought the node back without its declarations we would have swapped one
    // silent-data-loss bug for another. The whole-config snapshot should make
    // this fall out — proven here rather than assumed.
    renderPage(prepThenOcrTemplate(true));
    selectAndDelete("prep");
    expect(readLiveConfig().ctx.preparedFile).toBeUndefined();

    const body = renderToastBody(orphanToast());
    act(() => {
      fireEvent.click(body.getByTestId("orphaned-delete-undo"));
    });

    const restored = readLiveConfig();
    expect(restored.nodes.prep).toBeDefined();
    expect(restored.ctx.preparedFile).toEqual({ type: "object" });
    expect(restored.edges).toHaveLength(1);
    expect(restored.entryNodeId).toBe("prep");
  });

  it("Ctrl+Z undoes the delete just as the toast action does", () => {
    renderPage(prepThenOcrTemplate(true));
    selectAndDelete("prep");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    const restored = readLiveConfig();
    expect(restored.nodes.prep).toBeDefined();
    expect(restored.ctx.preparedFile).toEqual({ type: "object" });
  });

  it("shows no toast when the delete orphans nothing", () => {
    // NOTE: the `consumerBound: false` variant is NOT this case — the page's
    // resolveBindings pass auto-wires ocr.fileData to prep's key, so the key
    // IS read by the time the delete happens (correctly reported). "Nothing
    // reads it" means no surviving consumer at all.
    const loneProducer = prepThenOcrTemplate(false);
    loneProducer.config = {
      ...loneProducer.config,
      nodes: {
        prep: loneProducer.config.nodes.prep,
        // A surviving entry node: without one, deleting `prep` also moves
        // where the workflow starts, which G-039 now reports. This test is
        // about ORPHANS, so it keeps that second concern out of the way.
        start: {
          id: "start",
          type: "activity",
          label: "Start",
          activityType: "file.prepare",
        },
      },
      edges: [],
      entryNodeId: "start",
    };
    renderPage(loneProducer);
    selectAndDelete("prep");
    expect(readLiveConfig().nodes.prep).toBeUndefined();
    expect(orphanToast()).toBeUndefined();
  });

  it("reports it when the resolver — not the author — made the connection", () => {
    // The consumer carries no explicit binding; auto-wire connects it to
    // prep's key. Deleting prep still orphans a variable a step reads.
    renderPage(prepThenOcrTemplate(false));
    selectAndDelete("prep");
    const body = renderToastBody(orphanToast());
    expect(body.container.textContent).toContain("1 variable lost its source");
  });

  it("stays silent when deleting a node that writes nothing", () => {
    renderPage(prepThenOcrTemplate(true));
    selectAndDelete("ocr");
    expect(readLiveConfig().nodes.ocr).toBeUndefined();
    expect(orphanToast()).toBeUndefined();
  });

  it("never prunes a declaration marked isInput", () => {
    const template = prepThenOcrTemplate(true);
    template.config.ctx = {
      preparedFile: { type: "object", isInput: true },
    };
    renderPage(template);
    selectAndDelete("prep");
    const config = readLiveConfig();
    expect(config.nodes.prep).toBeUndefined();
    expect(config.ctx.preparedFile).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// G-003 — undo/redo. The two things worth pinning at the page level are the
// routing decision (which state changes record a history entry and which are
// lifecycle churn) and the interaction with the §4.4 hydration guard.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — undo/redo (G-003)", () => {
  function liveConfig(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) throw new Error("Canvas stub did not capture config");
    return config;
  }

  function undoButton(): HTMLElement {
    return screen.getByTestId("undo-button");
  }
  function redoButton(): HTMLElement {
    return screen.getByTestId("redo-button");
  }

  function addNode(activityType = "data.transform") {
    act(() => {
      (capturedPaletteProps.current?.onAddActivity as (t: string) => void)(
        activityType,
      );
    });
  }

  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedPaletteProps.current = null;
    capturedSettingsPanelProps.current = null;
    existingWorkflowRef.current = null;
    measuredNodes.current = [];
    fitViewMock.mockClear();
    vi.restoreAllMocks();
  });

  it("renders undo/redo controls, both disabled on a fresh editor", () => {
    renderPage();
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });

  it("undo reverses an add, redo re-applies it", () => {
    renderPage();
    addNode();
    const addedId = Object.keys(liveConfig().nodes)[0];
    expect(addedId).toBeDefined();
    expect(undoButton()).toBeEnabled();

    fireEvent.click(undoButton());
    expect(liveConfig().nodes[addedId]).toBeUndefined();
    expect(redoButton()).toBeEnabled();

    fireEvent.click(redoButton());
    expect(liveConfig().nodes[addedId]).toBeDefined();
  });

  it("a new edit after an undo drops the redo branch", () => {
    renderPage();
    addNode("data.transform");
    fireEvent.click(undoButton());
    expect(redoButton()).toBeEnabled();
    addNode("data.transform");
    expect(redoButton()).toBeDisabled();
  });

  it("loading a template is not itself an undo step", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    expect(undoButton()).toBeDisabled();
  });

  it("hydrating the server copy in edit mode is not an undo step", async () => {
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "Server workflow",
      description: "",
      config: buildTemplateConfig({ positions: "all" }),
      workflowVersionId: "wf-1-v1",
    };
    renderEditPage("wf-1");
    await waitFor(() =>
      expect(Object.keys(liveConfig().nodes)).toHaveLength(3),
    );
    expect(undoButton()).toBeDisabled();
  });

  it("the More > Auto-arrange menu action IS an undo step", async () => {
    // A deliberate authoring edit: the author asked for this layout and will
    // reach for Ctrl+Z if they dislike it.
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    expect(undoButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId("topbar-more-button"));
    fireEvent.click(await screen.findByTestId("topbar-menu-auto-arrange"));
    await waitFor(() => expect(fitViewMock).toHaveBeenCalled());
    expect(undoButton()).toBeEnabled();
  });

  it("undoing a manual auto-arrange restores the PREVIOUS positions", async () => {
    // Restored from the history snapshot — the layout algorithm must not be
    // re-run, or "undo" would just produce the arranged layout again.
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const before = readPositionsFromCanvas();
    expect(before.a).toEqual({ x: 10, y: 20 });

    fireEvent.click(screen.getByTestId("topbar-more-button"));
    fireEvent.click(await screen.findByTestId("topbar-menu-auto-arrange"));
    await waitFor(() => expect(fitViewMock).toHaveBeenCalled());
    const arranged = readPositionsFromCanvas();
    expect(arranged).not.toEqual(before);

    fireEvent.click(undoButton());
    expect(readPositionsFromCanvas()).toEqual(before);
  });

  it("undo bumps the layout nonce so the restored positions actually re-render", async () => {
    // §4.2 — the canvas's structural fingerprint excludes metadata.position,
    // so a position-only restore would persist to config while the rendered
    // nodes stayed put. The nonce is what makes the canvas re-apply them.
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    fireEvent.click(screen.getByTestId("topbar-more-button"));
    fireEvent.click(await screen.findByTestId("topbar-menu-auto-arrange"));
    await waitFor(() => expect(fitViewMock).toHaveBeenCalled());
    const afterArrange = capturedCanvasProps.current?.layoutNonce as number;

    fireEvent.click(undoButton());
    expect(capturedCanvasProps.current?.layoutNonce).toBeGreaterThan(
      afterArrange,
    );
    fireEvent.click(redoButton());
    expect(capturedCanvasProps.current?.layoutNonce).toBeGreaterThan(
      afterArrange + 1,
    );
  });

  it("the automatic arrange-on-load is NOT an undo step", async () => {
    // Fires by itself ~1.5s after a `metadata.arrangeOnLoad` demo opens.
    // Recording it would seed a phantom entry at the bottom of every demo's
    // stack, so the viewer's first Ctrl+Z would scramble the layout they were
    // just shown.
    const config = buildTemplateConfig({ positions: "all" });
    measuredNodes.current = Object.keys(config.nodes).map((id) => ({
      id,
      measured: { width: 200 },
    }));
    existingWorkflowRef.current = {
      id: "wf-arrange",
      name: "Demo",
      description: "",
      config: {
        ...config,
        metadata: { ...config.metadata, arrangeOnLoad: true },
      },
      workflowVersionId: "wf-arrange-v1",
    };
    renderEditPage("wf-arrange");
    await waitFor(() => expect(fitViewMock).toHaveBeenCalled());
    expect(undoButton()).toBeDisabled();
  });

  // P-1 (2026-08-03). A config with no authored positions is laid out during
  // hydration, before anything is mounted, so dagre only has the uniform
  // fallback width — the graph opens looser than the Auto-arrange button would
  // draw it. Re-running the measured pass after mount is the fix, and it must
  // fire WITHOUT `metadata.arrangeOnLoad`, which only the demo seeder stamps.
  it("re-arranges with measured widths when the server config had no positions", async () => {
    const config = buildTemplateConfig({ positions: "none" });
    measuredNodes.current = Object.keys(config.nodes).map((id) => ({
      id,
      measured: { width: 200 },
    }));
    existingWorkflowRef.current = {
      id: "wf-nopos",
      name: "Seeded workflow",
      description: "",
      config, // no arrangeOnLoad flag
      workflowVersionId: "wf-nopos-v1",
    };
    renderEditPage("wf-nopos");
    await waitFor(() => expect(fitViewMock).toHaveBeenCalled());
    // Same non-undoable, non-dirtying path the demo flag uses.
    expect(undoButton()).toBeDisabled();
  });

  it("leaves an authored layout alone: positions present and no flag → no arrange", async () => {
    const config = buildTemplateConfig({ positions: "all" });
    measuredNodes.current = Object.keys(config.nodes).map((id) => ({
      id,
      measured: { width: 200 },
    }));
    existingWorkflowRef.current = {
      id: "wf-authored",
      name: "Author's layout",
      description: "",
      config,
      workflowVersionId: "wf-authored-v1",
    };
    renderEditPage("wf-authored");
    await waitFor(() =>
      expect(Object.keys(liveConfig().nodes)).toHaveLength(3),
    );
    // The author placed these; nothing may move them on open.
    const positions = readPositionsFromCanvas();
    expect(positions.a).toEqual({ x: 10, y: 20 });
    expect(positions.c).toEqual({ x: 50, y: 60 });
  });

  it("keeps the hydration guard honest: an undone-to state still blocks a refetch", async () => {
    // §4.4 — the guard is a reference compare against the last hydrated
    // config. Undo hands back an EARLIER object, not the hydrated one, so a
    // background refetch must still be treated as "the author has unsaved
    // edits" and left alone. Verified rather than assumed.
    const serverConfig = buildTemplateConfig({ positions: "all" });
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "Server workflow",
      description: "",
      config: serverConfig,
      workflowVersionId: "wf-1-v1",
    };
    renderEditPage("wf-1");
    await waitFor(() =>
      expect(Object.keys(liveConfig().nodes)).toHaveLength(3),
    );

    addNode("data.transform"); // edit 1 → 4 nodes
    addNode("data.transform"); // edit 2 → 5 nodes
    expect(Object.keys(liveConfig().nodes)).toHaveLength(5);
    fireEvent.click(undoButton()); // back to the 4-node intermediate
    expect(Object.keys(liveConfig().nodes)).toHaveLength(4);

    // Simulate the agent-chat refetch loop handing back a different server
    // copy, then force the page to re-read it.
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "Server workflow",
      description: "",
      config: { ...serverConfig, nodes: { a: serverConfig.nodes.a } },
      workflowVersionId: "wf-1-v2",
    };
    act(() => {
      (capturedCanvasProps.current?.onSelectNode as (id: string) => void)("a");
    });

    // Still the author's undone-to state — the refetch did not stomp it.
    expect(Object.keys(liveConfig().nodes)).toHaveLength(4);
  });

  it("Ctrl+Z on the editor undoes; Ctrl+Z inside a settings text field does not", () => {
    renderPage();
    addNode();
    const addedId = Object.keys(liveConfig().nodes)[0];

    // Focus inside a text input → the browser's native text undo owns it.
    // P-3 made the name a click-to-edit title, so the field has to be opened
    // before there is an input to type in.
    act(() => {
      fireEvent.click(screen.getByTestId("workflow-title"));
    });
    const nameInput = screen.getByLabelText("Name");
    fireEvent.keyDown(nameInput, { key: "z", ctrlKey: true });
    expect(liveConfig().nodes[addedId]).toBeDefined();

    // Anywhere else → the graph's undo runs.
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(liveConfig().nodes[addedId]).toBeUndefined();

    fireEvent.keyDown(document.body, {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(liveConfig().nodes[addedId]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// G-027 — leaving the editor with unsaved changes asks first. The guard's own
// mechanics live in use-unsaved-guard.test.tsx; what matters here is that the
// page feeds it the SAME dirty signal the §4.4 hydration guard uses, and that
// a successful save re-baselines before navigating.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — unsaved-changes guard (G-027)", () => {
  function fireBeforeUnload(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    capturedPaletteProps.current = null;
    existingWorkflowRef.current = null;
    vi.restoreAllMocks();
  });

  it("an untouched new workflow does not warn on unload", () => {
    renderPage();
    expect(fireBeforeUnload()).toBe(false);
  });

  it("an untouched template-loaded workflow does not warn on unload", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    expect(fireBeforeUnload()).toBe(false);
  });

  it("warns on unload once a node has been added", () => {
    renderPage();
    act(() => {
      (capturedPaletteProps.current?.onAddActivity as (t: string) => void)(
        "data.transform",
      );
    });
    expect(fireBeforeUnload()).toBe(true);
  });

  it("undoing every edit makes the editor clean again", () => {
    // Same reference compare backs both the guard and §4.4, so undoing back to
    // the baseline object is genuinely clean — not merely equal-looking.
    renderPage();
    act(() => {
      (capturedPaletteProps.current?.onAddActivity as (t: string) => void)(
        "data.transform",
      );
    });
    expect(fireBeforeUnload()).toBe(true);
    fireEvent.click(screen.getByTestId("undo-button"));
    expect(fireBeforeUnload()).toBe(false);
  });

  it("does not challenge the navigation that follows a successful create-save", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    renderPage();
    act(() => {
      (capturedPaletteProps.current?.onAddActivity as (t: string) => void)(
        "data.transform",
      );
    });
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(capturedCreateDto.current).not.toBeNull());
    await waitFor(() => expect(fireBeforeUnload()).toBe(false));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G-010 — clicking a validation problem must take you to it.
//   Three stacked failures this covers:
//     1. the drawer was handed the plain `setSelectedNodeId`, whose selection
//        xyflow immediately clobbers — it must get `selectNodeSticky`;
//     2. nothing panned the canvas, so a successful selection could be
//        off-screen;
//     3. only `nodes.<id>.inputs.<port>` deep-linked — every other anchor
//        shape that names a concrete target degraded to "workflow-level".
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — G-010 validation navigation", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedSettingsPanelProps.current = null;
    capturedValidationDrawerProps.current = null;
    fitViewMock.mockClear();
    setCenterMock.mockClear();
    setNodesMock.mockClear();
    setEdgesMock.mockClear();
  });

  function navigate(target: unknown) {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    const onNavigate = capturedValidationDrawerProps.current?.onNavigate as
      | ((t: unknown) => void)
      | undefined;
    if (!onNavigate) throw new Error("drawer stub did not capture onNavigate");
    act(() => {
      onNavigate(target);
    });
  }

  it("selects the node a validation entry names, and it sticks", () => {
    navigate({ kind: "node", nodeId: "b" });
    expect(capturedCanvasProps.current?.selectedNodeId).toBe("b");
    // Stickiness: the page must go through xyflow's own selection store,
    // not just React state — a plain setState is clobbered on the next
    // xyflow selection event.
    expect(setNodesMock).toHaveBeenCalled();
  });

  it("brings the selected node into view", () => {
    navigate({ kind: "node", nodeId: "c" });
    expect(setCenterMock).toHaveBeenCalled();
  });

  it("deep-links an input-anchored entry to the port's source picker and reveals it", () => {
    navigate({ kind: "nodeInput", nodeId: "b", port: "fileData" });
    expect(capturedSettingsPanelProps.current?.focusInput).toEqual({
      nodeId: "b",
      port: "fileData",
    });
    expect(setNodesMock).toHaveBeenCalled();
    expect(setCenterMock).toHaveBeenCalled();
  });

  it("deep-links an edge-anchored entry by selecting the connection and framing both ends", () => {
    navigate({ kind: "edge", edgeId: "e1" });
    expect(setEdgesMock).toHaveBeenCalled();
    // Two endpoint nodes → fitView scoped to them, not a single-node pan.
    expect(fitViewMock).toHaveBeenCalled();
    const calls = fitViewMock.mock.calls;
    const call = calls[calls.length - 1]?.[0] as
      | { nodes?: { id: string }[] }
      | undefined;
    expect(call?.nodes?.map((n) => n.id)).toEqual(["a", "b"]);
    expect(capturedCanvasProps.current?.selectedNodeId).toBeNull();
  });

  it("deep-links a group-anchored entry to the group panel", () => {
    renderPage(makeTemplate(buildTemplateConfig({ positions: "all" })));
    // Give the config a group to navigate to.
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as
      | ((c: GraphWorkflowConfig) => void)
      | undefined;
    const base = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange?.({
        ...base,
        nodeGroups: { g1: { label: "G1", nodeIds: ["a", "b"] } },
      });
    });
    const onNavigate = capturedValidationDrawerProps.current?.onNavigate as
      | ((t: unknown) => void)
      | undefined;
    act(() => {
      onNavigate?.({ kind: "group", groupId: "g1" });
    });
    expect(capturedSettingsPanelProps.current?.activeGroupId).toBe("g1");
    expect(fitViewMock).toHaveBeenCalled();
  });

  it("deep-links a ctx / entry / library-port entry to the workflow-settings drawer", () => {
    navigate({ kind: "workflowSettings", focus: "ctx" });
    expect(
      screen.getByTestId("workflow-settings-drawer-stub"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// G-004 — replay must show the graph that ran.
//   Statuses used to be matched to nodes BY ID and painted onto whatever
//   config was on screen: edit the workflow, look at yesterday's run, and you
//   were reading old results on today's diagram. Replay now loads the run's
//   own version — and, being a view, must not put unsaved edits at risk.
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — G-004 replay renders the version that ran", () => {
  /** The graph as it is TODAY: a, b, c. */
  const headConfig = () => buildTemplateConfig({ positions: "all" });

  /** The graph as it was WHEN THE RUN HAPPENED: a, b — no `c`, plus `old`. */
  function historicalConfig(): GraphWorkflowConfig {
    const base = buildTemplateConfig({ positions: "all" });
    const { c: _dropped, ...kept } = base.nodes;
    return {
      ...base,
      nodes: {
        ...kept,
        old: {
          ...(base.nodes.a as ActivityNode),
          id: "old",
          label: "Removed since",
        },
      },
      edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
    };
  }

  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedRunHistoryProps.current = null;
    capturedVersionQueryArgs.current = null;
    versionQueryRef.current = {
      data: undefined,
      isLoading: false,
      isError: false,
    };
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "WF",
      description: "",
      slug: "wf",
      version: 3,
      workflowVersionId: "v-head",
      config: headConfig(),
    };
  });

  async function openHistoryAndReplay() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("topbar-more-button"));
    });
    await act(async () => {
      fireEvent.click(await screen.findByTestId("topbar-menu-run-history"));
    });
    await screen.findByTestId("run-history-drawer");
    const onReplay = capturedRunHistoryProps.current?.onReplay as
      | ((runId: string, v: { id: string; versionNumber: number }) => void)
      | undefined;
    if (!onReplay) throw new Error("run-history stub captured no onReplay");
    act(() => {
      onReplay("run-42", { id: "v-old", versionNumber: 2 });
    });
  }

  it("loads the run's own version when replaying", async () => {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    // Before replay: today's graph.
    expect(
      Object.keys(
        (capturedCanvasProps.current?.config as GraphWorkflowConfig).nodes,
      ).sort(),
    ).toEqual(["a", "b", "c"]);

    await openHistoryAndReplay();

    // The version fetch was asked for the RUN's version, not head.
    expect(capturedVersionQueryArgs.current).toEqual(["wf-1", "v-old"]);
    // And the canvas now renders that version's graph.
    expect(
      Object.keys(
        (capturedCanvasProps.current?.config as GraphWorkflowConfig).nodes,
      ).sort(),
    ).toEqual(["a", "b", "old"]);
  });

  it("does not paint statuses for nodes absent from the replayed version", async () => {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    await openHistoryAndReplay();
    const rendered = (
      capturedCanvasProps.current?.config as GraphWorkflowConfig
    ).nodes;
    // `c` was added after the run — it is not on the replayed graph at all,
    // so it cannot be shown wearing a status it never had.
    expect(rendered.c).toBeUndefined();
    // `old` existed at the time and IS shown, so its result is not lost.
    expect(rendered.old).toBeDefined();
  });

  it("shows the live config again when leaving replay", async () => {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    await openHistoryAndReplay();
    expect(screen.getByTestId("replay-mode-indicator")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("replay-mode-clear"));

    expect(screen.queryByTestId("replay-mode-indicator")).toBeNull();
    expect(
      Object.keys(
        (capturedCanvasProps.current?.config as GraphWorkflowConfig).nodes,
      ).sort(),
    ).toEqual(["a", "b", "c"]);
  });

  it("names the version on the replay chip so the graph on screen is identifiable", async () => {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    await openHistoryAndReplay();
    const chip = screen.getByTestId("replay-mode-indicator");
    expect(chip).toHaveTextContent("v2");
    expect(chip).toHaveTextContent(/read-only/i);
  });

  it("says so when the run's version cannot be loaded, instead of silently using head", async () => {
    versionQueryRef.current = {
      data: undefined,
      isLoading: false,
      isError: true,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    await openHistoryAndReplay();
    expect(screen.getByTestId("replay-mode-indicator")).toHaveTextContent(
      /unavailable/i,
    );
  });

  it("entering and leaving replay cannot lose unsaved work", async () => {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });

    // Author makes an unsaved edit: rename node `b`.
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as
      | ((c: GraphWorkflowConfig) => void)
      | undefined;
    const live = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange?.({
        ...live,
        nodes: {
          ...live.nodes,
          b: { ...(live.nodes.b as ActivityNode), label: "EDITED" },
        },
      });
    });
    expect(
      (capturedCanvasProps.current?.config as GraphWorkflowConfig).nodes.b
        ?.label,
    ).toBe("EDITED");

    await openHistoryAndReplay();

    // While replaying, an edit attempt must NOT reach the editing config.
    const replayOnChange = capturedCanvasProps.current?.onConfigChange as
      | ((c: GraphWorkflowConfig) => void)
      | undefined;
    const replayed = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      replayOnChange?.({
        ...replayed,
        nodes: {
          ...replayed.nodes,
          a: { ...(replayed.nodes.a as ActivityNode), label: "CLOBBERED" },
        },
      });
    });

    fireEvent.click(screen.getByTestId("replay-mode-clear"));

    // The unsaved edit survived the round trip, and the replayed version's
    // content did not leak into it.
    const after = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    expect(after.nodes.b?.label).toBe("EDITED");
    expect(after.nodes.a?.label).not.toBe("CLOBBERED");
    expect(Object.keys(after.nodes).sort()).toEqual(["a", "b", "c"]);
  });

  /**
   * Found while walking MANUAL_TEST_PLAN 9.9b. `onConfigChange` was guarded,
   * but undo/redo were not — and they are the worse path, because they rewind
   * the EDITING config while the canvas is showing the historical graph. The
   * screen does not move, so an author has no way to notice their unsaved work
   * being wound back; they only find out after leaving replay. Two Undo presses
   * during replay silently discarded two renames in the live app.
   */
  async function editAndReplay() {
    versionQueryRef.current = {
      data: { config: historicalConfig() },
      isLoading: false,
      isError: false,
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as
      | ((c: GraphWorkflowConfig) => void)
      | undefined;
    const live = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange?.({
        ...live,
        nodes: {
          ...live.nodes,
          b: { ...(live.nodes.b as ActivityNode), label: "EDITED" },
        },
      });
    });
    await openHistoryAndReplay();
  }

  it("undo triggered while replaying does not rewind the hidden editing config", async () => {
    await editAndReplay();

    // Every undo entry point — the top-bar button, the Ctrl+Z hotkey and the
    // canvas's own onUndo — funnels through the same callback, so exercising
    // the canvas prop covers all three.
    const onUndo = capturedCanvasProps.current?.onUndo as
      | (() => void)
      | undefined;
    expect(onUndo).toBeDefined();
    act(() => {
      onUndo?.();
      onUndo?.();
    });

    fireEvent.click(screen.getByTestId("replay-mode-clear"));

    const after = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    expect(after.nodes.b?.label).toBe("EDITED");
  });

  it("disables the undo and redo buttons while replaying", async () => {
    await editAndReplay();
    expect(screen.getByTestId("undo-button")).toBeDisabled();
    expect(screen.getByTestId("redo-button")).toBeDisabled();

    // …and they come back once replay is left, so this is a mode, not a
    // one-way door.
    fireEvent.click(screen.getByTestId("replay-mode-clear"));
    expect(screen.getByTestId("undo-button")).toBeEnabled();
  });
});

/**
 * G-091 — `deleteGroup` writes `nodeGroups` and nothing else, so the right rail
 * stayed mounted on a group that no longer existed and fell through to its
 * "Group not found" placeholder — a dead end reached by the panel's own Delete
 * button.
 */
describe("WorkflowEditorV2Page — G-091 active group cleared on removal", () => {
  function configWithGroup() {
    const cfg = buildTemplateConfig({ positions: "all" });
    cfg.nodeGroups = {
      g_42: { label: "Stage one", nodeIds: Object.keys(cfg.nodes).slice(0, 1) },
    };
    return cfg;
  }

  it("drops the active group when its entry disappears from the config", () => {
    renderPage(makeTemplate(configWithGroup()));
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

    // The group panel's own Delete writes a config without the group.
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as (
      next: GraphWorkflowConfig,
    ) => void;
    const current = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange({ ...current, nodeGroups: {} });
    });

    // The stub renders the cleared state as an empty attribute.
    expect(
      screen
        .getByTestId("node-settings-stub")
        .getAttribute("data-active-group-id"),
    ).toBe("");
  });

  it("keeps the active group while its entry is still there", () => {
    renderPage(makeTemplate(configWithGroup()));
    const onGroupChipClick = capturedCanvasProps.current?.onGroupChipClick as (
      groupId: string,
    ) => void;
    act(() => {
      onGroupChipClick("g_42");
    });
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as (
      next: GraphWorkflowConfig,
    ) => void;
    const current = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    // An unrelated edit must not close the panel.
    act(() => {
      onConfigChange({ ...current, metadata: { ...current.metadata } });
    });
    expect(
      screen
        .getByTestId("node-settings-stub")
        .getAttribute("data-active-group-id"),
    ).toBe("g_42");
  });
});

/**
 * Found walking MANUAL_TEST_PLAN 14.8: publishing from the palette's "New
 * custom node" modal never dropped the node on the canvas.
 *
 * `DynamicNodeEditor.handlePublish` awaits `mutateAsync` and then calls
 * `onAfterPublish` synchronously. The publish mutation's `onSuccess` fires
 * `invalidateQueries` for the activity catalog WITHOUT returning the promise,
 * so `mutateAsync` resolves a full network round-trip before the catalog holds
 * the entry that was just published — and `addDynamicNode` bails on
 * `if (!entry) return`, silently. The modal closes, a green "Published v1"
 * toast appears, and the canvas is unchanged.
 *
 * Awaiting the invalidation is necessary but not sufficient: the modal's
 * `onAfterPublish` closure holds the `onAddDynamicNode` identity from the
 * render BEFORE the refetch, so the callback must read the catalog through a
 * ref rather than a captured array. This test pins the second half — it calls
 * the STALE callback after the catalog has moved on.
 */
describe("WorkflowEditorV2Page — 14.8 dynamic node drops after a publish", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedPaletteProps.current = null;
    catalogEntriesRef.current = [];
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "WF",
      description: "",
      slug: "wf",
      version: 1,
      workflowVersionId: "v-head",
      config: buildTemplateConfig({ positions: "all" }),
    };
  });

  afterEach(() => {
    catalogEntriesRef.current = [];
    existingWorkflowRef.current = null;
  });

  it("drops the node even when the catalog entry arrives after the callback was captured", async () => {
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedPaletteProps.current?.onAddDynamicNode).toBeDefined();
    });

    // Captured while the catalog still knows nothing about the new lineage —
    // exactly what the modal holds when it calls back after publishing.
    const staleOnAddDynamicNode = capturedPaletteProps.current
      ?.onAddDynamicNode as (slug: string) => void;

    // The publish lands and the catalog refetch resolves.
    catalogEntriesRef.current = [
      {
        activityType: "dyn.walk-14-8-node",
        displayName: "walk-14-8-node",
        category: "Custom",
        inputs: [],
        outputs: [],
        paramsSchema: {},
        dynamicNodeSlug: "walk-14-8-node",
        dynamicNodeVersion: 1,
        colorHint: "dyn",
      },
    ];
    // Any state change re-renders the page, which is what makes it observe the
    // refreshed catalog in production too.
    const onConfigChange = capturedCanvasProps.current?.onConfigChange as (
      c: GraphWorkflowConfig,
    ) => void;
    const current = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange({ ...current });
    });

    act(() => {
      staleOnAddDynamicNode("walk-14-8-node");
    });

    const config = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    const added = Object.values(config.nodes).find(
      (n) => (n as ActivityNode).activityType === "dyn.walk-14-8-node",
    );
    expect(added).toBeDefined();
  });
});

/**
 * D-11 + D-16 — Try and Run must refuse a graph the run would not honour.
 *
 * Both were found walking the plan and are the same bug wearing two hats: the
 * canvas asserted one thing and the run did another.
 *
 *   D-11 (14.8) — a workflow whose `dyn.*` lineage is deleted is diagnosed
 *   correctly (red Deleted badge, "not registered" error) and Try stayed
 *   enabled. The run then failed at `dynamicNode.resolveLineage` — knowable at
 *   author time, which is what "fail before the run" asks for.
 *
 *   D-16 (9.12) — with unsaved edits, Try ran the PREVIOUSLY SAVED graph.
 *   Measured live: the rename landed on the canvas, the editor reported dirty,
 *   and after Try no version existed and the server still held the old label.
 *   The author watched badges light up for a graph they were not looking at.
 */
describe("WorkflowEditorV2Page — D-11/D-16 Try and Run refuse an unrunnable graph", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedPaletteProps.current = null;
    validationRef.current = {
      errorCount: 0,
      warningCount: 0,
      isPending: false,
      errorsByNode: new Map(),
      errors: [],
    };
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "WF",
      description: "",
      slug: "wf",
      version: 1,
      workflowVersionId: "v-head",
      config: buildTemplateConfig({ positions: "all" }),
    };
  });

  afterEach(() => {
    validationRef.current = {
      errorCount: 0,
      warningCount: 0,
      isPending: false,
      errorsByNode: new Map(),
      errors: [],
    };
    existingWorkflowRef.current = null;
  });

  it("enables Try and Run on a clean, saved, valid graph", async () => {
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    expect(screen.getByTestId("try-button")).toBeEnabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeEnabled();
  });

  it("D-11 — disables Try and Run while the graph has validation errors", async () => {
    validationRef.current = {
      errorCount: 1,
      warningCount: 0,
      isPending: false,
      errorsByNode: new Map(),
      errors: [
        {
          path: "nodes.a.activityType",
          message: 'Activity type "dyn.gone" is not registered',
          severity: "error",
        },
      ],
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    expect(screen.getByTestId("try-button")).toBeDisabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeDisabled();
  });

  it("D-11 — a warning alone does NOT disable them", async () => {
    validationRef.current = {
      errorCount: 0,
      warningCount: 3,
      isPending: false,
      errorsByNode: new Map(),
      errors: [],
    };
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    expect(screen.getByTestId("try-button")).toBeEnabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeEnabled();
  });

  it("D-16 — disables Try and Run once there are unsaved edits", async () => {
    renderEditPage("wf-1");
    await waitFor(() => {
      expect(capturedCanvasProps.current?.config).toBeDefined();
    });
    expect(screen.getByTestId("try-button")).toBeEnabled();

    const onConfigChange = capturedCanvasProps.current?.onConfigChange as (
      c: GraphWorkflowConfig,
    ) => void;
    const live = capturedCanvasProps.current?.config as GraphWorkflowConfig;
    act(() => {
      onConfigChange({
        ...live,
        nodes: {
          ...live.nodes,
          b: { ...(live.nodes.b as ActivityNode), label: "EDITED-NOT-SAVED" },
        },
      });
    });

    expect(screen.getByTestId("try-button")).toBeDisabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// R-2 (P-3, 2026-08-03) — the description left the top bar for the Workflow
// settings drawer, and stopped being page state on the way: it lives in
// `config.metadata.description`, which is what the drawer already edits
// through its `config` / `onConfigChange` pair (as version and tags do).
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — description moves to Workflow settings (R-2)", () => {
  beforeEach(() => {
    capturedCanvasProps.current = null;
    capturedCreateDto.current = null;
    existingWorkflowRef.current = null;
    saveValidationRef.current = { valid: true, errors: [] };
    vi.mocked(notifications.show).mockClear();
  });

  function liveConfig(): GraphWorkflowConfig {
    const config = capturedCanvasProps.current?.config as
      | GraphWorkflowConfig
      | undefined;
    if (!config) throw new Error("Canvas stub did not capture config");
    return config;
  }

  it("saves the description out of config.metadata, with no top-bar field feeding it", async () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    cfg.metadata = {
      ...cfg.metadata,
      description: "Reads the mail-room scans",
    };
    renderPage(makeTemplate(cfg));
    expect(screen.queryByLabelText("Description")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    });
    expect(capturedCreateDto.current?.description).toBe(
      "Reads the mail-room scans",
    );
  });

  it("seeds metadata.description from the lineage column when the config carries none", () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "Test",
      // What the workflows list renders. A config written by the agent or a
      // direct API create need not carry the mirror, and opening + re-saving
      // must not blank it.
      description: "Set from the list",
      config: cfg,
      workflowVersionId: "wf-1-v1",
    };
    renderEditPage("wf-1");
    expect(liveConfig().metadata.description).toBe("Set from the list");
  });

  it("leaves a description the config already carries alone", () => {
    const cfg = buildTemplateConfig({ positions: "all" });
    cfg.metadata = { ...cfg.metadata, description: "From the config" };
    existingWorkflowRef.current = {
      id: "wf-1",
      name: "Test",
      description: "Stale column",
      config: cfg,
      workflowVersionId: "wf-1-v1",
    };
    renderEditPage("wf-1");
    expect(liveConfig().metadata.description).toBe("From the config");
  });
});
