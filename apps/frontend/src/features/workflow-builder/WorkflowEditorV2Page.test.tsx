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
import { act, fireEvent, render, screen } from "@testing-library/react";
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
const { capturedCanvasProps, capturedCreateDto, fitViewMock } = vi.hoisted(
  () => {
    return {
      capturedCanvasProps: { current: null as null | Record<string, unknown> },
      capturedCreateDto: { current: null as null | Record<string, unknown> },
      fitViewMock: vi.fn(),
    };
  },
);

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
  ActivityPalette: () => <div data-testid="palette-stub" />,
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

vi.mock("./validation/useGraphValidation", () => ({
  useGraphValidation: () => ({
    errorCount: 0,
    warningCount: 0,
    isPending: false,
    errorsByNode: new Map(),
    errors: [],
  }),
}));

vi.mock("../../data/hooks/useWorkflows", () => ({
  useWorkflow: () => ({ data: undefined, isLoading: false }),
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
