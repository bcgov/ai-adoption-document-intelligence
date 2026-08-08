/**
 * Tests for `WorkflowEditorCanvas` per-type rendering (US-012).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-012-canvas-per-type-shapes.md.
 *
 * `@xyflow/react` is mocked so the test invokes each node-type's
 * renderer directly via `nodeTypes` — this lets us assert the rendered
 * shape + icon without booting a full browser layout engine.
 */

import "@testing-library/jest-dom";

import { resolveBindings, resolveInputPort } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Connection, Edge, Node as FlowNode } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SwitchNode,
} from "../../../types/workflow";
import { ORPHANED_DELETE_TOAST_ID } from "../delete-orphan-toast";
import { layoutGraphWithMapBodies } from "./auto-layout";
import { projectGroupedConfig } from "./group-projection";
import { mergeNodeGroups, synthesizeMapBodyGroups } from "./map-body-groups";
import type { WorkflowEdgeData } from "./WorkflowEdge";
import {
  DETACH_FULLY_TOAST_ID,
  releaseAnchorFromEvent,
  WorkflowEditorCanvas,
} from "./WorkflowEditorCanvas";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

// Item 6 — the group-chip unit delete asks before it removes real pipeline
// steps. Stub the modal system so tests can read the question it asked and
// drive either answer, rather than rendering a portal.
vi.mock("@mantine/modals", () => ({
  modals: { openConfirmModal: vi.fn(), closeAll: vi.fn() },
}));

// `useActivityCatalog` depends on `GroupProvider` (via `useGroup`). The
// integration tests here don't exercise auth state, so stub the hook with an
// empty catalog so the canvas renderers proceed past their dynamic-node
// branch unchanged. Mirrors the shim used in
// `WorkflowEditorCanvas.type-pill.test.tsx` and `WorkflowEditorV2Page.test.tsx`.
vi.mock("../dynamic-nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../dynamic-nodes")>();
  return {
    ...actual,
    useActivityCatalog: () => ({
      isLoading: false,
      entries: [],
      error: null,
    }),
  };
});

/**
 * Item 7 (2026-08-06) — the failure chip beside a node's title reads the live
 * run-state context, which in the app is provided by `RunStateProvider` (a
 * react-query consumer). Swap the context READER for a settable value so a
 * test can put one node into `failed` without booting the query layer. The
 * default is `null`, which is exactly what the real hook returns outside a
 * provider, so every other test in this file is unaffected.
 */
const { mockRunState } = vi.hoisted(() => ({
  mockRunState: {
    current: null as {
      activeRunId: string | null;
      nodeStatuses: Record<string, { status: string; errorMessage?: string }>;
    } | null,
  },
}));

vi.mock("../run/RunStateContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../run/RunStateContext")>();
  return {
    ...actual,
    useOptionalRunState: () => mockRunState.current,
  };
});

interface MockNodeProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
  selected?: boolean;
}

// `mockFitView` is hoisted so the vi.mock factory below can reference it
// AND test cases can spy on / reset it across runs. `mockReactFlowApi`
// is also stable — returning a fresh object from `useReactFlow` on every
// render would invalidate the canvas's fitView effect deps and cancel
// its in-flight setTimeout. `latestReactFlowProps` lets tests reach the
// most recently passed ReactFlow props (including `onConnect`, `edges`,
// `edgeTypes`) so US-025 scenarios can dispatch a connection without
// booting xyflow's runtime.
const {
  mockFitView,
  mockScreenToFlowPosition,
  mockGetNodes,
  mockSetNodes,
  mockReactFlowApi,
  latestReactFlowProps,
  mockUpdateNodeInternals,
} = vi.hoisted(() => {
  const fitView = vi.fn();
  // P-4 — the pane menu resolves the right-clicked point into graph space.
  // Identity translation here: the tests care that the click point travels to
  // the new node, not about viewport maths xyflow owns.
  const screenToFlowPosition = vi.fn((p: { x: number; y: number }) => ({
    x: p.x,
    y: p.y,
  }));
  // Auto-arrange reads measured card widths off the live instance; with no
  // rendered widths in jsdom the layout falls back to its default width.
  const getNodes = vi.fn(() => [] as Array<{ id: string; width?: number }>);
  // W-3 — right-clicking outside the current selection resets xyflow's own
  // selection through `setNodes`, the same way the editor page's grouping
  // handler does.
  const setNodes = vi.fn();
  return {
    mockFitView: fitView,
    mockScreenToFlowPosition: screenToFlowPosition,
    mockGetNodes: getNodes,
    mockSetNodes: setNodes,
    mockReactFlowApi: { fitView, screenToFlowPosition, getNodes, setNodes },
    latestReactFlowProps: {
      current: null as null | Record<string, unknown>,
    },
    // Stable function identity — a fresh fn per render would retrigger the
    // activity renderer's updateNodeInternals effect on every commit.
    mockUpdateNodeInternals: vi.fn(),
  };
});

vi.mock("@xyflow/react", () => {
  const useNodesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    const onChange = (_changes: unknown) => {
      // No-op for tests — we don't simulate xyflow's internal node changes.
    };
    return [state, setState, onChange] as const;
  };
  const useEdgesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    const onChange = (_changes: unknown) => {
      // No-op for tests — we don't simulate xyflow's internal edge changes.
    };
    return [state, setState, onChange] as const;
  };
  return {
    ReactFlow: (props: Record<string, unknown>) => {
      // Capture the most recent props so tests can invoke `onConnect`
      // and assert the projected `edges` / `edgeTypes` shape.
      latestReactFlowProps.current = props;
      const nodes: MockNodeProps[] = (props.nodes as MockNodeProps[]) ?? [];
      const nodeTypes = props.nodeTypes as
        | Record<string, React.ComponentType<MockNodeProps>>
        | undefined;
      interface MockEdgeProps {
        id: string;
        source: string;
        target: string;
        sourceHandle?: string | null;
        targetHandle?: string | null;
        data?: { wire?: { variant?: string } };
      }
      const edges: MockEdgeProps[] = (props.edges as MockEdgeProps[]) ?? [];
      return (
        <div data-testid="react-flow">
          {nodes.map((node) => {
            const Renderer = nodeTypes?.[node.type];
            return Renderer ? (
              <div key={node.id} data-testid={`rf-node-${node.id}`}>
                <Renderer
                  id={node.id}
                  type={node.type}
                  data={node.data}
                  selected={node.selected ?? false}
                />
              </div>
            ) : null;
          })}
          {/* Flattened edge projection — exposes the wire variant + the
              resolved handle ids as data attributes so projection tests
              can assert anchoring without booting xyflow's runtime. */}
          {edges.map((edge) => (
            <div
              key={edge.id}
              data-testid={`rf-edge-${edge.id}`}
              data-wire-variant={edge.data?.wire?.variant}
              data-source={edge.source}
              data-target={edge.target}
              data-source-handle={edge.sourceHandle ?? undefined}
              data-target-handle={edge.targetHandle ?? undefined}
            />
          ))}
        </div>
      );
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Handle: ({
      type,
      position,
      id,
      onMouseEnter,
      onMouseLeave,
    }: {
      type: string;
      position: string;
      id?: string;
      onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
      onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    useReactFlow: () => mockReactFlowApi,
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
  };
});

beforeEach(() => {
  mockRunState.current = null;
  mockFitView.mockClear();
  mockScreenToFlowPosition.mockClear();
  mockGetNodes.mockClear();
  latestReactFlowProps.current = null;
  vi.mocked(notifications.show).mockClear();
  vi.mocked(notifications.hide).mockClear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAllNodeTypesConfig(): GraphWorkflowConfig {
  const activity: ActivityNode = {
    id: "activity_1",
    type: "activity",
    label: "Activity",
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 0, y: 0 } },
  };
  const switchNode: SwitchNode = {
    id: "switch_1",
    type: "switch",
    label: "Switch",
    cases: [],
    metadata: { position: { x: 200, y: 0 } },
  };
  const mapNode: MapNode = {
    id: "map_1",
    type: "map",
    label: "Map",
    collectionCtxKey: "items",
    itemCtxKey: "item",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
    metadata: { position: { x: 400, y: 0 } },
  };
  const joinNode: JoinNode = {
    id: "join_1",
    type: "join",
    label: "Join",
    sourceMapNodeId: "map_1",
    strategy: "all",
    resultsCtxKey: "results",
    metadata: { position: { x: 600, y: 0 } },
  };
  const childWorkflow: ChildWorkflowNode = {
    id: "child_1",
    type: "childWorkflow",
    label: "Child",
    workflowRef: { type: "library", workflowId: "" },
    metadata: { position: { x: 800, y: 0 } },
  };
  const pollUntil: PollUntilNode = {
    id: "poll_1",
    type: "pollUntil",
    label: "Poll",
    activityType: "data.transform",
    condition: {
      operator: "equals",
      left: { ref: "ctx.x" },
      right: { literal: "" },
    },
    interval: "30s",
    metadata: { position: { x: 1000, y: 0 } },
  };
  const humanGate: HumanGateNode = {
    id: "human_1",
    type: "humanGate",
    label: "Human",
    signal: { name: "approval" },
    timeout: "1h",
    onTimeout: "fail",
    metadata: { position: { x: 1200, y: 0 } },
  };
  const nodes: Record<string, GraphNode> = {
    [activity.id]: activity,
    [switchNode.id]: switchNode,
    [mapNode.id]: mapNode,
    [joinNode.id]: joinNode,
    [childWorkflow.id]: childWorkflow,
    [pollUntil.id]: pollUntil,
    [humanGate.id]: humanGate,
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "Test", version: "1.0.0" },
    ctx: {},
    nodes,
    edges: [],
    entryNodeId: activity.id,
  };
}

function renderCanvas(
  config: GraphWorkflowConfig,
  options: {
    errorsByNode?: Map<string, GraphValidationError[]>;
    onNodeBadgeClick?: (nodeId: string) => void;
    selectedNodeId?: string | null;
    simplifiedView?: boolean;
    onGroupChipClick?: (groupId: string) => void;
    onSelectMapBodyNode?: (nodeId: string) => void;
    onFixNodeInput?: (nodeId: string, port: string) => void;
    layoutNonce?: number;
  } = {},
) {
  const onConfigChange = vi.fn();
  const onSelectNode = vi.fn();
  // G-003 — the host's undo, offered as the toast action on a delete that
  // orphans ctx variables. Always supplied so the delete paths behave here
  // exactly as they do in the page.
  const onUndo = vi.fn();
  let currentConfig = config;
  let currentSelected = options.selectedNodeId ?? null;
  let currentSimplified = options.simplifiedView ?? false;
  let currentLayoutNonce = options.layoutNonce ?? 0;
  const utils = render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={currentConfig}
        selectedNodeId={currentSelected}
        onConfigChange={onConfigChange}
        onSelectNode={onSelectNode}
        errorsByNode={options.errorsByNode}
        onNodeBadgeClick={options.onNodeBadgeClick}
        simplifiedView={currentSimplified}
        onGroupChipClick={options.onGroupChipClick}
        onSelectMapBodyNode={options.onSelectMapBodyNode}
        onFixNodeInput={options.onFixNodeInput}
        layoutNonce={currentLayoutNonce}
        onUndo={onUndo}
      />
    </MantineProvider>,
  );
  /**
   * Re-renders the canvas with a new config (and optionally a new
   * selectedNodeId), mirroring how the page component pushes
   * `setConfig(next)` after `addActivity` / `addControlFlowNode`. Tests
   * use this to simulate a palette add.
   *
   * `nextLayoutNonce` mirrors the host bumping `layoutNonce` in the SAME
   * commit as the config change — which is what undo/redo do, and what tells
   * the canvas a restored node set is not an authored add (B-2).
   */
  const rerenderWithConfig = (
    nextConfig: GraphWorkflowConfig,
    nextSelected?: string | null,
    nextLayoutNonce?: number,
  ) => {
    currentConfig = nextConfig;
    if (nextSelected !== undefined) {
      currentSelected = nextSelected;
    }
    if (nextLayoutNonce !== undefined) {
      currentLayoutNonce = nextLayoutNonce;
    }
    utils.rerender(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={currentConfig}
          selectedNodeId={currentSelected}
          onConfigChange={onConfigChange}
          onSelectNode={onSelectNode}
          errorsByNode={options.errorsByNode}
          onNodeBadgeClick={options.onNodeBadgeClick}
          simplifiedView={currentSimplified}
          onGroupChipClick={options.onGroupChipClick}
          onFixNodeInput={options.onFixNodeInput}
          layoutNonce={currentLayoutNonce}
          onUndo={onUndo}
        />
      </MantineProvider>,
    );
  };
  /**
   * Re-renders with a new `simplifiedView` flag (mirrors the top-bar
   * Mantine switch in `WorkflowEditorV2Page` flipping state).
   */
  const rerenderWithSimplified = (next: boolean) => {
    currentSimplified = next;
    utils.rerender(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={currentConfig}
          selectedNodeId={currentSelected}
          onConfigChange={onConfigChange}
          onSelectNode={onSelectNode}
          errorsByNode={options.errorsByNode}
          onNodeBadgeClick={options.onNodeBadgeClick}
          simplifiedView={currentSimplified}
          onGroupChipClick={options.onGroupChipClick}
          onFixNodeInput={options.onFixNodeInput}
          layoutNonce={currentLayoutNonce}
          onUndo={onUndo}
        />
      </MantineProvider>,
    );
  };
  return {
    ...utils,
    onConfigChange,
    onSelectNode,
    onUndo,
    rerenderWithConfig,
    rerenderWithSimplified,
  };
}

/**
 * Drains the 0ms setTimeout my US-014 fitView call uses. Wrapping in
 * `act` flushes React's pending commits + lets the macrotask fire.
 */
async function flushAnimationFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: Switch renders as a diamond
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — Scenario 1: switch renders as a diamond", () => {
  it("renders the switch node with data-shape='diamond' and a rotated visual layer", () => {
    renderCanvas(makeAllNodeTypesConfig());
    const switchEl = screen.getByTestId("canvas-node-switch_1");
    expect(switchEl).toHaveAttribute("data-shape", "diamond");
    expect(switchEl).toHaveAttribute("data-node-type", "switch");
    // The visual diamond layer is the rotated child; confirm it exists
    // and is rotated 45deg — same geometry the read-only
    // GraphVisualization.tsx renderer uses for switch nodes.
    const visualLayer = screen.getByTestId("switch-diamond-visual-switch_1");
    expect(visualLayer).toBeInTheDocument();
    expect(visualLayer.style.transform).toContain("rotate(45deg)");
  });

  it("draws a strong diamond-shaped halo when the switch is selected", () => {
    renderCanvas(makeAllNodeTypesConfig(), { selectedNodeId: "switch_1" });
    const visualLayer = screen.getByTestId("switch-diamond-visual-switch_1");
    // The halo must be large enough to survive the 0.7071 scale — a 5px
    // accent ring + glow, plus a 3px border. A faint 2px ring here would
    // shrink to ~1.4px and read as unselected (the reported bug).
    expect(visualLayer.style.boxShadow).toContain("5px");
    expect(visualLayer.style.border).toContain("3px");
  });

  it("draws only a resting drop-shadow (no halo) when unselected", () => {
    renderCanvas(makeAllNodeTypesConfig(), { selectedNodeId: null });
    const visualLayer = screen.getByTestId("switch-diamond-visual-switch_1");
    expect(visualLayer.style.boxShadow).not.toContain("5px");
    expect(visualLayer.style.border).toContain("2px");
  });
});

describe("WorkflowEditorCanvas — switch diamond polish (Task 1)", () => {
  it("does not render the duplicated dimmed displayName subtitle", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <MantineProvider>
        <ReactFlowProvider>
          <WorkflowEditorCanvas
            config={config}
            selectedNodeId={null}
            onConfigChange={vi.fn()}
            onSelectNode={vi.fn()}
            onSelectionChangeMany={vi.fn()}
          />
        </ReactFlowProvider>
      </MantineProvider>,
    );
    const node = screen.getByTestId("canvas-node-switch_1");
    const matches = within(node).getAllByText("Branch by condition");
    expect(matches).toHaveLength(1);
  });

  it("uses a 180x180 diamond bounding box", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <MantineProvider>
        <ReactFlowProvider>
          <WorkflowEditorCanvas
            config={config}
            selectedNodeId={null}
            onConfigChange={vi.fn()}
            onSelectNode={vi.fn()}
            onSelectionChangeMany={vi.fn()}
          />
        </ReactFlowProvider>
      </MantineProvider>,
    );
    const node = screen.getByTestId("canvas-node-switch_1");
    expect(node).toHaveStyle({ width: "180px", height: "180px" });
  });

  it("wraps a long label inside the inscribed square", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <MantineProvider>
        <ReactFlowProvider>
          <WorkflowEditorCanvas
            config={config}
            selectedNodeId={null}
            onConfigChange={vi.fn()}
            onSelectNode={vi.fn()}
            onSelectionChangeMany={vi.fn()}
          />
        </ReactFlowProvider>
      </MantineProvider>,
    );
    const labelEl = screen.getByTestId("switch-label-switch_1");
    const style = window.getComputedStyle(labelEl);
    expect(style.wordBreak).toBe("break-word");
    // Bounded so the text stays inside the inscribed square (180 / sqrt(2) ≈ 127).
    expect(labelEl).toHaveStyle({ maxWidth: "127px" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Map and Join render with fan-out / fan-in icon overlays
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — Scenario 2: map / join fan overlays", () => {
  it("renders the map node as a rectangle with the fan-out overlay", () => {
    renderCanvas(makeAllNodeTypesConfig());
    const mapEl = screen.getByTestId("canvas-node-map_1");
    expect(mapEl).toHaveAttribute("data-shape", "rectangle");
    expect(mapEl).toHaveAttribute("data-node-type", "map");
    expect(screen.getByTestId("fan-indicator-map")).toBeInTheDocument();
  });

  it("renders the join node as a rectangle with the fan-in overlay", () => {
    renderCanvas(makeAllNodeTypesConfig());
    const joinEl = screen.getByTestId("canvas-node-join_1");
    expect(joinEl).toHaveAttribute("data-shape", "rectangle");
    expect(joinEl).toHaveAttribute("data-node-type", "join");
    expect(screen.getByTestId("fan-indicator-join")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Map-body container: clicking the box selects the owning map node (mirrors
// the host, which merges the synthetic map-body groups into config.nodeGroups
// via displayConfig before handing the config to the canvas).
// ---------------------------------------------------------------------------

function makeMapWithBodyDisplayConfig(): GraphWorkflowConfig {
  const mapNode: MapNode = {
    id: "m",
    type: "map",
    label: "Run for each",
    collectionCtxKey: "items",
    itemCtxKey: "item",
    bodyEntryNodeId: "b1",
    bodyExitNodeId: "b2",
    metadata: { position: { x: 0, y: 0 } },
  };
  const b1: ActivityNode = {
    id: "b1",
    type: "activity",
    label: "B1",
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 200, y: 0 } },
  };
  const b2: ActivityNode = {
    id: "b2",
    type: "activity",
    label: "B2",
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 400, y: 0 } },
  };
  const base: GraphWorkflowConfig = {
    schemaVersion: "1.0",
    metadata: { name: "map-body", version: "1.0.0" },
    ctx: {},
    nodes: { m: mapNode, b1, b2 } as Record<string, GraphNode>,
    edges: [{ id: "e1", source: "b1", target: "b2", type: "normal" }],
    entryNodeId: "m",
  };
  const synthetic = synthesizeMapBodyGroups(base);
  return {
    ...base,
    nodeGroups: mergeNodeGroups(base.nodeGroups ?? {}, synthetic),
  };
}

describe("WorkflowEditorCanvas — map-body container selects its map node", () => {
  it("clicking the body box's header calls onSelectMapBodyNode with the owning map node id", () => {
    const onSelectMapBodyNode = vi.fn();
    renderCanvas(makeMapWithBodyDisplayConfig(), { onSelectMapBodyNode });
    // Only the header strip is interactive (the box body is
    // pointer-events:none so member clicks and pans fall through).
    screen.getByTestId("group-container-header-__map_body_m").click();
    expect(onSelectMapBodyNode).toHaveBeenCalledWith("m");
  });

  it("renders the map body's box as non-draggable — a derived group is not arranged as a unit", async () => {
    renderCanvas(makeMapWithBodyDisplayConfig());
    await flushAnimationFrame();
    const nodes =
      (latestReactFlowProps.current?.nodes as
        | Array<{ id: string; draggable?: boolean; dragHandle?: string }>
        | undefined) ?? [];
    const box = nodes.find((n) => n.id === "container-__map_body_m");
    expect(box?.draggable).toBe(false);
    expect(box?.dragHandle).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: PollUntil / HumanGate / ChildWorkflow as rectangles with icons
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — Scenario 3: simple rectangles with type icon", () => {
  it.each([
    ["pollUntil", "poll_1"],
    ["humanGate", "human_1"],
    ["childWorkflow", "child_1"],
  ] as const)("renders %s as a rectangle with a Tabler icon in the header", (type, nodeId) => {
    renderCanvas(makeAllNodeTypesConfig());
    const nodeEl = screen.getByTestId(`canvas-node-${nodeId}`);
    expect(nodeEl).toHaveAttribute("data-shape", "rectangle");
    expect(nodeEl).toHaveAttribute("data-node-type", type);
    // The header has an SVG icon (Tabler icons render as <svg
    // class="tabler-icon ..." />).
    const svg = nodeEl.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").toMatch(/tabler-icon/);
  });

  it("does NOT render a fan-indicator overlay on pollUntil / humanGate / childWorkflow", () => {
    renderCanvas(makeAllNodeTypesConfig());
    expect(screen.queryByTestId("fan-indicator-pollUntil")).toBeNull();
    expect(screen.queryByTestId("fan-indicator-humanGate")).toBeNull();
    expect(screen.queryByTestId("fan-indicator-childWorkflow")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G-016: pollUntil keeps the activity affordances it wraps
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — G-016: pollUntil activity affordances", () => {
  function configWithPollUntil(activityType: string): GraphWorkflowConfig {
    const poll: PollUntilNode = {
      id: "poll_1",
      type: "pollUntil",
      label: "Poll",
      activityType,
      condition: {
        operator: "equals",
        left: { ref: "ctx.x" },
        right: { literal: "" },
      },
      interval: "30s",
      metadata: { position: { x: 0, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Test", version: "1.0.0" },
      ctx: {},
      nodes: { [poll.id]: poll },
      edges: [],
      entryNodeId: poll.id,
    };
  }

  it("renders per-port handles for a pollUntil node", () => {
    renderCanvas(configWithPollUntil("azureOcr.submit"));
    const nodeEl = screen.getByTestId("canvas-node-poll_1");
    // The card keeps the control-flow rectangle chrome…
    expect(nodeEl).toHaveAttribute("data-shape", "rectangle");
    expect(nodeEl).toHaveAttribute("data-node-type", "pollUntil");
    // …but now mounts the wrapped activity's catalog port rows, each with
    // its own draggable handle — the settings panel and the problems badge
    // have always listed these inputs.
    expect(screen.getByTestId("port-rows-poll_1")).not.toBeNull();
    expect(
      nodeEl.querySelector('[data-testid="port-row-poll_1-in-fileData"]'),
    ).not.toBeNull();
    expect(
      nodeEl.querySelector('[data-testid="port-row-poll_1-out-apimRequestId"]'),
    ).not.toBeNull();
  });

  it("degrades legibly when a pollUntil's wrapped activity is unregistered", () => {
    renderCanvas(configWithPollUntil("azureOcr.gone"));
    const nodeEl = screen.getByTestId("canvas-node-poll_1");
    // Same treatment an `activity` node gets: the unknown-activity icon, the
    // "Unregistered activity." note, and the raw type string. The icon is a
    // Tabler component now (P-7), so it is asserted on the rendered SVG —
    // an icon that no longer contributes to `textContent` is exactly the
    // point of moving off emoji.
    expect(nodeEl.querySelector("svg.tabler-icon-help-circle")).not.toBeNull();
    expect(nodeEl.textContent).toContain("Unregistered activity.");
    expect(nodeEl.textContent).toContain("azureOcr.gone");
    // No catalog entry → no port rows to drag to.
    expect(screen.queryByTestId("port-rows-poll_1")).toBeNull();
  });

  it("does not show the unregistered fallback for a registered wrapped activity", () => {
    renderCanvas(configWithPollUntil("azureOcr.submit"));
    const nodeEl = screen.getByTestId("canvas-node-poll_1");
    expect(nodeEl.textContent).not.toContain("Unregistered activity.");
  });

  it("still renders switch/map/join as control-flow rectangles with no port rows", () => {
    renderCanvas(makeAllNodeTypesConfig());
    expect(screen.getByTestId("canvas-node-switch_1")).toHaveAttribute(
      "data-shape",
      "diamond",
    );
    for (const id of ["map_1", "join_1", "child_1", "human_1"]) {
      expect(screen.getByTestId(`canvas-node-${id}`)).toHaveAttribute(
        "data-shape",
        "rectangle",
      );
      expect(screen.queryByTestId(`port-rows-${id}`)).toBeNull();
    }
    expect(screen.queryByTestId("port-rows-switch_1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: all control-flow nodes are selectable / draggable / connectable
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — Scenario 4: behaviour parity with activity", () => {
  it("renders both target + source handles on every control-flow node", () => {
    renderCanvas(makeAllNodeTypesConfig());
    const expected = [
      "switch_1",
      "map_1",
      "join_1",
      "child_1",
      "poll_1",
      "human_1",
    ];
    for (const id of expected) {
      const nodeEl = screen.getByTestId(`canvas-node-${id}`);
      // Each renderer mounts a target handle on the left and a source
      // handle on the right — matches the activity-node shape so
      // xyflow's onConnect can wire edges identically.
      expect(
        nodeEl.querySelector('[data-testid="handle-target-left"]'),
      ).not.toBeNull();
      expect(
        nodeEl.querySelector('[data-testid="handle-source-right"]'),
      ).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: validation badges surface on control-flow nodes
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — Scenario 5: validation badges on control-flow nodes", () => {
  it("renders a red badge with the error count on a control-flow node when errorsByNode reports issues", () => {
    const config = makeAllNodeTypesConfig();
    const errorsByNode = new Map<string, GraphValidationError[]>([
      [
        "switch_1",
        [
          {
            path: "nodes.switch_1.cases",
            message: "Switch must have at least one case",
            severity: "error",
          },
          {
            path: "nodes.switch_1.cases",
            message: "Another switch error",
            severity: "error",
          },
        ],
      ],
    ]);
    renderCanvas(config, { errorsByNode });
    const badge = screen.getByTestId("node-badge-switch_1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2");
  });

  it("renders an amber badge for warning-only buckets", () => {
    const config = makeAllNodeTypesConfig();
    const errorsByNode = new Map<string, GraphValidationError[]>([
      [
        "join_1",
        [
          {
            path: "nodes.join_1",
            message: "Join target is unusual",
            severity: "warning",
          },
        ],
      ],
    ]);
    renderCanvas(config, { errorsByNode });
    const badge = screen.getByTestId("node-badge-join_1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  it("invokes onNodeBadgeClick with the node id when the badge is clicked", () => {
    const config = makeAllNodeTypesConfig();
    const errorsByNode = new Map<string, GraphValidationError[]>([
      [
        "map_1",
        [
          {
            path: "nodes.map_1.collectionCtxKey",
            message: "collectionCtxKey is required",
            severity: "error",
          },
        ],
      ],
    ]);
    const onNodeBadgeClick = vi.fn();
    renderCanvas(config, { errorsByNode, onNodeBadgeClick });
    const badge = screen.getByTestId("node-badge-map_1");
    badge.click();
    expect(onNodeBadgeClick).toHaveBeenCalledTimes(1);
    expect(onNodeBadgeClick).toHaveBeenCalledWith("map_1");
  });

  it("uses the same badge component on activity nodes too", () => {
    const config = makeAllNodeTypesConfig();
    const errorsByNode = new Map<string, GraphValidationError[]>([
      [
        "activity_1",
        [
          {
            path: "nodes.activity_1.parameters.foo",
            message: "Activity error",
            severity: "error",
          },
        ],
      ],
    ]);
    const onNodeBadgeClick = vi.fn();
    renderCanvas(config, { errorsByNode, onNodeBadgeClick });
    const activityBadge = screen.getByTestId("node-badge-activity_1");
    activityBadge.click();
    expect(onNodeBadgeClick).toHaveBeenCalledWith("activity_1");
  });

  it("keeps the fan-indicator in the top-left corner when the node has no validation badge", () => {
    renderCanvas(makeAllNodeTypesConfig());
    // No issues → no badge; the fan glyph sits in its home corner.
    expect(screen.queryByTestId("node-badge-map_1")).toBeNull();
    expect(screen.getByTestId("fan-indicator-map")).toHaveStyle({
      left: "-7px",
    });
  });

  it("shifts the fan-indicator aside when a validation badge occupies the top-left corner (no overlap)", () => {
    const config = makeAllNodeTypesConfig();
    const errorsByNode = new Map<string, GraphValidationError[]>([
      [
        "map_1",
        [
          {
            path: "nodes.map_1.collectionCtxKey",
            message: "collectionCtxKey is required",
            severity: "error",
          },
        ],
      ],
    ]);
    renderCanvas(config, { errorsByNode });
    // Both render, and the fan glyph is shifted right so it no longer sits on
    // top of the badge (which owns left:-7).
    expect(screen.getByTestId("node-badge-map_1")).toBeInTheDocument();
    expect(screen.getByTestId("fan-indicator-map")).toHaveStyle({
      left: "18px",
    });
  });
});

// ---------------------------------------------------------------------------
// US-024: Error source handle on nodes whose errorPolicy.onError === "fallback"
//   feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/user_stories/US-024-error-source-handle.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-024: error source handle", () => {
  /**
   * Helper: collect every Handle the renderer mounts under a given node
   * id, returning [type, handleId] tuples. The xyflow mock above renders
   * each Handle as `<div data-testid="handle-<type>-<position>"
   * data-handleid="<id|null>" />`, so we can read the handleId attribute
   * directly. `data-handleid` is also xyflow's own runtime attribute
   * (set by the real Handle component) — the assertion strategy works on
   * the real DOM too.
   */
  function collectHandles(
    nodeId: string,
  ): Array<{ type: string; handleId: string | null; perPort: boolean }> {
    const nodeEl = screen.getByTestId(`canvas-node-${nodeId}`);
    const handles = Array.from(
      nodeEl.querySelectorAll<HTMLElement>("[data-testid^='handle-']"),
    );
    return handles.map((el) => {
      const testid = el.getAttribute("data-testid") ?? "";
      const type = testid.startsWith("handle-target-") ? "target" : "source";
      const handleId = el.getAttribute("data-handleid");
      return {
        type,
        handleId: handleId === "null" ? null : handleId,
        // Activity nodes additionally mount render-only per-port handles
        // inside PortRows rows — the US-024 scenarios below assert the
        // NODE-LEVEL flow handles, so tag per-port ones for filtering.
        perPort: el.closest("[data-testid^='port-row-']") !== null,
      };
    });
  }

  function configWithErrorPolicyActivity(
    onError: "fail" | "fallback" | "skip",
  ): GraphWorkflowConfig {
    const activity: ActivityNode = {
      id: "activity_1",
      type: "activity",
      label: "Activity",
      activityType: "data.transform",
      parameters: {},
      errorPolicy: { retryable: false, onError },
      metadata: { position: { x: 0, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Test", version: "1.0.0" },
      ctx: {},
      nodes: { [activity.id]: activity },
      edges: [],
      entryNodeId: activity.id,
    };
  }

  it("Scenario 1: activity node without fallback policy renders exactly one source handle", () => {
    // No errorPolicy at all.
    renderCanvas(makeAllNodeTypesConfig());
    const handles = collectHandles("activity_1");
    const sources = handles.filter((h) => h.type === "source" && !h.perPort);
    expect(sources).toHaveLength(1);
    // Without a fallback policy the renderer still names the normal
    // source handle `out` so xyflow can disambiguate consistently —
    // there must not be a second source handle with id `error`.
    expect(sources.some((h) => h.handleId === "error")).toBe(false);
  });

  it("Scenario 1b: activity node with errorPolicy.onError='fail' renders exactly one source handle", () => {
    renderCanvas(configWithErrorPolicyActivity("fail"));
    const handles = collectHandles("activity_1");
    const sources = handles.filter((h) => h.type === "source" && !h.perPort);
    expect(sources).toHaveLength(1);
    expect(sources.some((h) => h.handleId === "error")).toBe(false);
  });

  it("Scenario 2: activity node with errorPolicy.onError='fallback' renders two source handles (out + error)", () => {
    renderCanvas(configWithErrorPolicyActivity("fallback"));
    const handles = collectHandles("activity_1");
    const sources = handles.filter((h) => h.type === "source" && !h.perPort);
    expect(sources).toHaveLength(2);
    const sourceIds = sources.map((h) => h.handleId).sort();
    expect(sourceIds).toEqual(["error", "out"]);
  });

  it.each([
    ["map", "map_1"],
    ["join", "join_1"],
    ["childWorkflow", "child_1"],
    ["pollUntil", "poll_1"],
    ["humanGate", "human_1"],
  ] as const)("Scenario 3: control-flow rectangle %s with errorPolicy.onError='fallback' renders both out + error source handles", (_type, nodeId) => {
    const base = makeAllNodeTypesConfig();
    const target = base.nodes[nodeId];
    if (!target) {
      throw new Error(`fixture missing node ${nodeId}`);
    }
    const withPolicy: GraphNode = {
      ...target,
      errorPolicy: { retryable: false, onError: "fallback" },
    };
    const next: GraphWorkflowConfig = {
      ...base,
      nodes: { ...base.nodes, [nodeId]: withPolicy },
    };
    renderCanvas(next);
    const handles = collectHandles(nodeId);
    // NODE-LEVEL handles only — `pollUntil` now also mounts per-port row
    // handles for the activity it wraps (G-016), exactly as an activity
    // node does, and the Scenario 1/2 activity cases filter those out too.
    const sources = handles.filter((h) => h.type === "source" && !h.perPort);
    expect(sources).toHaveLength(2);
    const sourceIds = sources.map((h) => h.handleId).sort();
    expect(sourceIds).toEqual(["error", "out"]);
  });

  it("Scenario 4: switch node never gets an error handle even with errorPolicy.onError='fallback'", () => {
    const base = makeAllNodeTypesConfig();
    const switchNode = base.nodes.switch_1;
    if (!switchNode || switchNode.type !== "switch") {
      throw new Error("fixture missing switch_1");
    }
    const withPolicy: SwitchNode = {
      ...switchNode,
      errorPolicy: { retryable: false, onError: "fallback" },
    };
    const next: GraphWorkflowConfig = {
      ...base,
      nodes: { ...base.nodes, switch_1: withPolicy },
    };
    renderCanvas(next);
    const handles = collectHandles("switch_1");
    const sources = handles.filter((h) => h.type === "source");
    expect(sources).toHaveLength(1);
    expect(sources.some((h) => h.handleId === "error")).toBe(false);
  });

  it("Scenario 5: existing edges with no explicit sourcePort still render (no regression)", () => {
    // Old-shape edges: stored with just id/source/target/type and no
    // sourcePort/handle info. The canvas must still project them into
    // xyflow form — the projected count must equal the config edge
    // count.
    const base = makeAllNodeTypesConfig();
    const oldShapeEdges: GraphWorkflowConfig["edges"] = [
      {
        id: "edge_legacy_1",
        source: "activity_1",
        target: "switch_1",
        type: "normal",
      },
      {
        id: "edge_legacy_2",
        source: "switch_1",
        target: "map_1",
        type: "normal",
      },
    ];
    const next: GraphWorkflowConfig = { ...base, edges: oldShapeEdges };
    renderCanvas(next);
    // Both legacy edges still render — they're sourced at the (renamed)
    // `out` handle by default since xyflow falls back to the first
    // available source handle when no sourceHandle is provided.
    for (const edge of oldShapeEdges) {
      const sourceNode = screen.getByTestId(`canvas-node-${edge.source}`);
      const targetNode = screen.getByTestId(`canvas-node-${edge.target}`);
      expect(sourceNode).toBeInTheDocument();
      expect(targetNode).toBeInTheDocument();
    }
    // NODE-LEVEL source handle on activity_1 must carry id="out" so
    // xyflow's default-handle resolution can still match it (the
    // render-only per-port handles are excluded).
    const handles = collectHandles("activity_1");
    const source = handles.find((h) => h.type === "source" && !h.perPort);
    expect(source).toBeDefined();
    expect(source?.handleId).toBe("out");
  });
});

// ---------------------------------------------------------------------------
// US-014: auto-fit-on-add
//   feature-docs/20260522-workflow-builder-phase1a-closeout/user_stories/US-014-canvas-auto-fit-on-node-add.md
// ---------------------------------------------------------------------------

function addExtraActivity(
  config: GraphWorkflowConfig,
  id: string,
): GraphWorkflowConfig {
  const extra: ActivityNode = {
    id,
    type: "activity",
    label: id,
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 1400, y: 0 } },
  };
  return {
    ...config,
    nodes: { ...config.nodes, [id]: extra },
  };
}

describe("WorkflowEditorCanvas — US-014: auto-fit-on-add", () => {
  it("fits the new node into view when the node set grows by one (Scenario 1)", async () => {
    const initial = makeAllNodeTypesConfig();
    const { rerenderWithConfig } = renderCanvas(initial);
    // The first useEffect run captures the initial id-set without
    // calling fitView; flush a frame so any spurious early call would
    // have shown up before we assert.
    await flushAnimationFrame();
    expect(mockFitView).not.toHaveBeenCalled();

    const next = addExtraActivity(initial, "activity_added_1");
    rerenderWithConfig(next);
    await flushAnimationFrame();

    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith(
      expect.objectContaining({
        padding: 0.15,
        duration: 300,
        nodes: [{ id: "activity_added_1" }],
      }),
    );
  });

  it("does NOT call fitView when a node's position changes (Scenario 2)", async () => {
    const initial = makeAllNodeTypesConfig();
    const { rerenderWithConfig } = renderCanvas(initial);
    await flushAnimationFrame();
    mockFitView.mockClear();

    // Move activity_1 to a new position — same node-id set, only the
    // position metadata changed. The existing onNodeDragStop path
    // mirrors this kind of mutation.
    const moved: GraphWorkflowConfig = {
      ...initial,
      nodes: {
        ...initial.nodes,
        activity_1: {
          ...(initial.nodes.activity_1 as ActivityNode),
          metadata: { position: { x: 999, y: 999 } },
        } satisfies ActivityNode,
      },
    };
    rerenderWithConfig(moved);
    await flushAnimationFrame();

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("does NOT call fitView on initial mount (Scenario 3)", async () => {
    const initial = makeAllNodeTypesConfig();
    renderCanvas(initial);
    await flushAnimationFrame();
    // ReactFlow's own `fitView` prop handles the initial layout via the
    // ReactFlow component itself; our hook must not duplicate that on
    // the very first effect run.
    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("does NOT call fitView when only selection changes (Scenario 4 - selection)", async () => {
    const initial = makeAllNodeTypesConfig();
    const { rerenderWithConfig } = renderCanvas(initial);
    await flushAnimationFrame();
    mockFitView.mockClear();

    // Selecting a different node — same config.nodes, only
    // selectedNodeId changes.
    rerenderWithConfig(initial, "switch_1");
    await flushAnimationFrame();

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("does NOT call fitView when only edges change (Scenario 4 - edges)", async () => {
    const initial = makeAllNodeTypesConfig();
    const { rerenderWithConfig } = renderCanvas(initial);
    await flushAnimationFrame();
    mockFitView.mockClear();

    const withEdge: GraphWorkflowConfig = {
      ...initial,
      edges: [
        ...initial.edges,
        {
          id: "edge_added",
          source: "activity_1",
          target: "switch_1",
          type: "normal",
        },
      ],
    };
    rerenderWithConfig(withEdge);
    await flushAnimationFrame();

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("falls back to whole-graph fit when multiple nodes are added in one update (e.g. template load)", async () => {
    // Start with a tiny config (1 node), then re-render with the full
    // 7-node config — mirrors the template-picker hydration path where
    // many nodes appear in a single state update.
    const single: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Seed", version: "1.0.0" },
      ctx: {},
      nodes: {
        seed: {
          id: "seed",
          type: "activity",
          label: "Seed",
          activityType: "data.transform",
          parameters: {},
          metadata: { position: { x: 0, y: 0 } },
        } satisfies ActivityNode,
      },
      edges: [],
      entryNodeId: "seed",
    };
    const { rerenderWithConfig } = renderCanvas(single);
    await flushAnimationFrame();
    mockFitView.mockClear();

    rerenderWithConfig(makeAllNodeTypesConfig());
    await flushAnimationFrame();

    expect(mockFitView).toHaveBeenCalledTimes(1);
    // Multi-add path: no `nodes:` filter, so the whole graph is fit.
    const callArg = mockFitView.mock.calls[0][0];
    expect(callArg).toEqual(
      expect.objectContaining({ padding: 0.15, duration: 300 }),
    );
    expect(callArg.nodes).toBeUndefined();
  });
});

/**
 * B-2 (2026-08-03) — undoing a delete re-adds the removed ids, which the
 * auto-fit effect above could not tell from an authored add: it zoomed onto the
 * restored card, so Ctrl+Z moved the canvas out from under the author. The
 * host bumps `layoutNonce` on every history step (and on its own Auto-arrange,
 * which never changes the node set), so a bump arriving WITH a changed id-set
 * means "restored", not "added".
 */
describe("WorkflowEditorCanvas — B-2: undo does not re-fit the viewport", () => {
  it("does NOT fit when a deleted node is restored by undo", async () => {
    const initial = makeAllNodeTypesConfig();
    const withExtra = addExtraActivity(initial, "activity_added_1");
    const { rerenderWithConfig } = renderCanvas(withExtra);
    await flushAnimationFrame();
    mockFitView.mockClear();

    // The delete itself: the id leaves, no nonce bump (deleting is an edit).
    rerenderWithConfig(initial);
    await flushAnimationFrame();
    expect(mockFitView).not.toHaveBeenCalled();

    // The undo: the host restores the config AND bumps the nonce in the same
    // commit, so the canvas sees both at once.
    rerenderWithConfig(withExtra, undefined, 1);
    await flushAnimationFrame();
    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("still fits a node added after a history step", async () => {
    // The suppression is per-step, not sticky: once a nonce bump has been
    // consumed, the next authored add fits as it always did.
    const initial = makeAllNodeTypesConfig();
    const { rerenderWithConfig } = renderCanvas(initial);
    await flushAnimationFrame();
    mockFitView.mockClear();

    // A position-only undo — same ids, nonce bumped.
    rerenderWithConfig(initial, undefined, 1);
    await flushAnimationFrame();
    expect(mockFitView).not.toHaveBeenCalled();

    rerenderWithConfig(addExtraActivity(initial, "activity_added_2"));
    await flushAnimationFrame();
    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [{ id: "activity_added_2" }] }),
    );
  });

  it("does NOT fit when redo re-applies a multi-node restore", async () => {
    const initial = makeAllNodeTypesConfig();
    const single: GraphWorkflowConfig = {
      ...initial,
      nodes: { activity_1: initial.nodes.activity_1 },
      entryNodeId: "activity_1",
    };
    const { rerenderWithConfig } = renderCanvas(single);
    await flushAnimationFrame();
    mockFitView.mockClear();

    // Six ids reappear at once — the whole-graph fit branch, still a restore.
    rerenderWithConfig(initial, undefined, 1);
    await flushAnimationFrame();
    expect(mockFitView).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// US-025: handleConnect stamps `conditional` / `error` / `normal` per source
//   feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/user_stories/US-025-handle-connect-edge-type.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-025: handleConnect edge-type stamping", () => {
  /** Resolves the `onConnect` callback the canvas hands to ReactFlow. */
  function getOnConnect(): (connection: Connection) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnect !== "function") {
      throw new Error("ReactFlow mock did not capture onConnect");
    }
    return props.onConnect as (connection: Connection) => void;
  }

  /**
   * Extracts the edges array from the most recent `onConfigChange` call.
   * Used to assert the edge `type` the canvas wrote into the outer config.
   */
  function lastEmittedEdges(
    onConfigChange: ReturnType<typeof vi.fn>,
  ): GraphWorkflowConfig["edges"] {
    expect(onConfigChange).toHaveBeenCalled();
    const calls = onConfigChange.mock.calls;
    const lastArg = calls[calls.length - 1][0] as GraphWorkflowConfig;
    return lastArg.edges;
  }

  it("Scenario 1: edge drawn from a switch source defaults to `conditional`", () => {
    const config = makeAllNodeTypesConfig();
    const { onConfigChange } = renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "switch_1",
        target: "activity_1",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    const edges = lastEmittedEdges(onConfigChange);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "switch_1",
      target: "activity_1",
      type: "conditional",
    });
  });

  it("Scenario 2: edge drawn from any node's error handle defaults to `error`", () => {
    // Activity carrying errorPolicy.onError = "fallback" — drawing from
    // its `error` source handle should stamp the edge as `error`.
    const activity: ActivityNode = {
      id: "a1",
      type: "activity",
      label: "Activity",
      activityType: "data.transform",
      parameters: {},
      errorPolicy: { retryable: false, onError: "fallback" },
      metadata: { position: { x: 0, y: 0 } },
    };
    const target: ActivityNode = {
      id: "n2",
      type: "activity",
      label: "Target",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 200, y: 0 } },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "T", version: "1.0.0" },
      ctx: {},
      nodes: { [activity.id]: activity, [target.id]: target },
      edges: [],
      entryNodeId: activity.id,
    };
    const { onConfigChange } = renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "a1",
        target: "n2",
        sourceHandle: "error",
        targetHandle: null,
      });
    });
    const edges = lastEmittedEdges(onConfigChange);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a1",
      target: "n2",
      type: "error",
    });
  });

  it("Scenario 3: edge from a non-switch node's `out` handle defaults to `normal`", () => {
    const activity: ActivityNode = {
      id: "a1",
      type: "activity",
      label: "Activity",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const target: ActivityNode = {
      id: "n2",
      type: "activity",
      label: "Target",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 200, y: 0 } },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "T", version: "1.0.0" },
      ctx: {},
      nodes: { [activity.id]: activity, [target.id]: target },
      edges: [],
      entryNodeId: activity.id,
    };
    const { onConfigChange } = renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "a1",
        target: "n2",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    const edges = lastEmittedEdges(onConfigChange);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a1",
      target: "n2",
      type: "normal",
    });
  });

  it("Scenario 4: switch source + error handle still produces `error` (explicit handle wins)", () => {
    const config = makeAllNodeTypesConfig();
    const { onConfigChange } = renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "switch_1",
        target: "activity_1",
        sourceHandle: "error",
        targetHandle: null,
      });
    });
    const edges = lastEmittedEdges(onConfigChange);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "switch_1",
      target: "activity_1",
      type: "error",
    });
  });

  it("Scenario 5: existing duplicate / self-loop guards remain in place", () => {
    // Pre-existing edge so the duplicate guard has something to match.
    const baseConfig = makeAllNodeTypesConfig();
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      edges: [
        {
          id: "edge_existing",
          source: "activity_1",
          target: "switch_1",
          type: "normal",
        },
      ],
    };
    const { onConfigChange } = renderCanvas(config);
    const onConnect = getOnConnect();

    // Self-loop should be ignored.
    act(() => {
      onConnect({
        source: "activity_1",
        target: "activity_1",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    expect(onConfigChange).not.toHaveBeenCalled();

    // Duplicate (matching source+target on an existing edge) is ignored.
    act(() => {
      onConnect({
        source: "activity_1",
        target: "switch_1",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    expect(onConfigChange).not.toHaveBeenCalled();

    // Sanity: a genuinely new connection still emits — confirms the
    // guards aren't over-broadly blocking everything.
    act(() => {
      onConnect({
        source: "activity_1",
        target: "map_1",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// §6.3/§7 "connect again = wire again": drawing a fresh node-level execution
// edge into a node clears any `locked-unbound` ("Disconnected by you") lock on
// the target's port(s) that the new upstream edge now makes auto-bindable — so
// a re-drawn edge auto-wires just like the first connect. An incompatible
// source leaves the lock in place.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — reconnect clears reconnectable locks (§6.3/§7)", () => {
  function getOnConnect(): (connection: Connection) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnect !== "function") {
      throw new Error("ReactFlow mock did not capture onConnect");
    }
    return props.onConnect as (connection: Connection) => void;
  }

  /**
   * Target `azureOcr.submit` with `fileData` (Document) left locked-UNBOUND by
   * a prior delete, no edges. The `source` node is the producer under test.
   */
  function makeLockedUnboundTarget(source: ActivityNode): GraphWorkflowConfig {
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 }, lockedInputPorts: ["fileData"] },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Reconnect", version: "1.0.0" },
      ctx: {},
      nodes: { [source.id]: source, submit },
      edges: [],
      entryNodeId: source.id,
    };
  }

  it("clears the lock when a compatible source is connected into the port", () => {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const { onConfigChange } = renderCanvas(makeLockedUnboundTarget(prep));
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    // The lock list emptied → the metadata field is dropped entirely.
    expect(submit.metadata?.lockedInputPorts).toBeUndefined();
    // And the new edge was still added.
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ source: "prep", target: "submit" });
  });

  it("leaves the lock in place when an incompatible source is connected", () => {
    // `data.transform` outputs `output` (Artifact) — not assignable to the
    // Document `fileData` port, so the resolver cannot auto-bind it.
    const xform: ActivityNode = {
      id: "xform",
      type: "activity",
      label: "Transform",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const { onConfigChange } = renderCanvas(makeLockedUnboundTarget(xform));
    act(() => {
      getOnConnect()({
        source: "xform",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.metadata?.lockedInputPorts).toEqual(["fileData"]);
  });
});

// ---------------------------------------------------------------------------
// US-025 wiring: WorkflowEdge registered as the custom xyflow edge type
//   The canvas projects every edge with `type: "workflow-edge"` + a
//   `data` payload carrying the `GraphEdge` (and source `SwitchNode`
//   when the source is a switch) so the WorkflowEdge renderer can
//   compute its own stroke + label without re-walking the graph.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-025 wiring: WorkflowEdge edge-type registration", () => {
  function getCapturedEdges(): Edge[] {
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    return (props.edges as Edge[]) ?? [];
  }

  function getCapturedEdgeTypes(): Record<string, unknown> {
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    return (props.edgeTypes as Record<string, unknown>) ?? {};
  }

  it("registers `workflow-edge` in `edgeTypes` and projects every edge with that type", async () => {
    const base = makeAllNodeTypesConfig();
    const config: GraphWorkflowConfig = {
      ...base,
      edges: [
        {
          id: "edge_normal",
          source: "activity_1",
          target: "switch_1",
          type: "normal",
        },
        {
          id: "edge_conditional",
          source: "switch_1",
          target: "map_1",
          type: "conditional",
        },
      ],
    };
    renderCanvas(config);
    await flushAnimationFrame();

    const edgeTypes = getCapturedEdgeTypes();
    expect(edgeTypes).toHaveProperty("workflow-edge");
    // `WorkflowEdge` is wrapped in `React.memo`, which returns a special
    // object (not a plain function). Asserting truthy is enough — what we
    // care about is that the canvas wired the renderer in by name.
    expect(edgeTypes["workflow-edge"]).toBeDefined();
    expect(edgeTypes["workflow-edge"]).not.toBeNull();

    const projected = getCapturedEdges();
    expect(projected).toHaveLength(2);
    for (const edge of projected) {
      expect(edge.type).toBe("workflow-edge");
    }
  });

  it("attaches `data.graphEdge` and (for switch sources) `data.sourceSwitch` to each projected edge", async () => {
    const base = makeAllNodeTypesConfig();
    const switchNode = base.nodes.switch_1 as SwitchNode;
    const switchWithCases: SwitchNode = {
      ...switchNode,
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: 1 },
          },
          edgeId: "edge_conditional",
        },
      ],
    };
    const config: GraphWorkflowConfig = {
      ...base,
      nodes: { ...base.nodes, switch_1: switchWithCases },
      edges: [
        {
          id: "edge_normal",
          source: "activity_1",
          target: "switch_1",
          type: "normal",
        },
        {
          id: "edge_conditional",
          source: "switch_1",
          target: "map_1",
          type: "conditional",
        },
      ],
    };
    renderCanvas(config);
    await flushAnimationFrame();

    const projected = getCapturedEdges();
    const normalEdge = projected.find((e) => e.id === "edge_normal");
    const conditionalEdge = projected.find((e) => e.id === "edge_conditional");

    // Both edges must carry the underlying GraphEdge.
    expect(normalEdge?.data).toMatchObject({
      graphEdge: { id: "edge_normal", type: "normal" },
    });
    // Activity source ≠ switch → no sourceSwitch attached.
    expect(
      (normalEdge?.data as WorkflowEdgeData | undefined)?.sourceSwitch,
    ).toBe(undefined);

    // Switch source → sourceSwitch is the source SwitchNode so the
    // WorkflowEdge renderer can resolve `if <predicate>` labels.
    expect(conditionalEdge?.data).toMatchObject({
      graphEdge: { id: "edge_conditional", type: "conditional" },
      sourceSwitch: { id: "switch_1", type: "switch" },
    });
  });

  it("colours each edge's arrowhead marker by its wire variant", async () => {
    const base = makeAllNodeTypesConfig();
    const config: GraphWorkflowConfig = {
      ...base,
      edges: [
        {
          id: "edge_normal",
          source: "activity_1",
          target: "switch_1",
          type: "normal",
        },
        {
          id: "edge_conditional",
          source: "switch_1",
          target: "map_1",
          type: "conditional",
        },
        {
          id: "edge_error",
          source: "activity_1",
          target: "join_1",
          type: "error",
        },
      ],
    };
    renderCanvas(config);
    await flushAnimationFrame();

    const projected = getCapturedEdges();
    const byId = new Map(projected.map((e) => [e.id, e]));

    const normalEdge = byId.get("edge_normal");
    const conditionalEdge = byId.get("edge_conditional");
    const errorEdge = byId.get("edge_error");

    // The stroke itself is rendered by WorkflowEdge from the wire data
    // (covered by WorkflowEdge.test.tsx) — the projection only owns the
    // arrowhead marker colour, which must use the SAME palette so the
    // arrowhead never mismatches the stroke users see.

    // Normal (bindings-free → sequence wire): grey marker.
    expect(normalEdge?.markerEnd).toMatchObject({ color: "#9ca3af" });

    // Conditional: switch accent marker.
    expect(conditionalEdge?.markerEnd).toMatchObject({ color: "#facc15" });

    // Error: red marker (matches the WorkflowEdge renderer's
    // ERROR_STROKE colour).
    expect(errorEdge?.markerEnd).toMatchObject({
      color: "var(--mantine-color-red-6, #e03131)",
    });
  });
});

// ---------------------------------------------------------------------------
// Wire projection (PORT_WIRING_DESIGN.md §5): data bindings render as
// port-to-port wires; bindings-free normal edges render as dashed
// sequence wires; error edges anchor at the bottom `error` handle.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — wire projection (port-to-port wires)", () => {
  /**
   * prep (`file.prepare`) → submit (`azureOcr.submit`) bound through
   * prep's auto-synthesised `preparedData` ctx key + a normal edge;
   * plus a bindings-free pair (poll → human) and an error-policy edge
   * (prep → join) so one config exercises all three variants.
   */
  function makeWireProjectionConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      parameters: {},
      outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }],
      errorPolicy: { retryable: false, onError: "fallback" },
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 300, y: 0 } },
    };
    const bare1: ActivityNode = {
      id: "bare1",
      type: "activity",
      label: "Bare A",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 200 } },
    };
    const bare2: ActivityNode = {
      id: "bare2",
      type: "activity",
      label: "Bare B",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 300, y: 200 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Wire projection", version: "1.0.0" },
      ctx: {},
      nodes: {
        prep,
        submit,
        bare1,
        bare2,
      },
      edges: [
        { id: "e_bound", source: "prep", target: "submit", type: "normal" },
        { id: "e_bare", source: "bare1", target: "bare2", type: "normal" },
        { id: "e_error", source: "prep", target: "bare1", type: "error" },
      ],
      entryNodeId: "prep",
    };
  }

  function getCapturedEdges(): Edge[] {
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    return (props.edges as Edge[]) ?? [];
  }

  it("renders a bound pair as a per-port data wire and drops the grey edge between the pair", async () => {
    renderCanvas(makeWireProjectionConfig());
    await flushAnimationFrame();

    const dataWire = screen.getByTestId("rf-edge-wire:submit:fileData");
    expect(dataWire).toHaveAttribute("data-wire-variant", "data");
    expect(dataWire).toHaveAttribute("data-source", "prep");
    expect(dataWire).toHaveAttribute("data-target", "submit");
    // Activity endpoints anchor at the per-port handles minted by
    // `outputHandleId` / `inputHandleId` — the same ids `<PortRows>`
    // mounts.
    expect(dataWire).toHaveAttribute("data-source-handle", "out-preparedData");
    expect(dataWire).toHaveAttribute("data-target-handle", "in-fileData");
    // The normal edge between the pair is absorbed into the data wire —
    // no separate grey sequence edge renders for it.
    expect(screen.queryByTestId("rf-edge-e_bound")).not.toBeInTheDocument();

    // §6.3: data wires are deletable + selectable — deletion routes through
    // `disconnectDataWire` (pinned unbound), not edge removal. They also
    // stay HOVERABLE — the `wb-data-wire` class pairs with the canvas
    // stylesheet rule that re-enables pointer events (xyflow marks
    // unselectable, handler-less edges `.inactive` → pointer-events:none,
    // which would kill the provenance tooltip). The ariaLabel mirrors the
    // hover tooltip for assistive tech.
    const projected = getCapturedEdges().find(
      (e) => e.id === "wire:submit:fileData",
    );
    expect(projected?.deletable).toBe(true);
    expect(projected?.selectable).toBe(true);
    expect(projected?.className).toBe("wb-data-wire");
    expect(projected?.ariaLabel).toBe(
      "Connected automatically — nearest PreparedFile producer",
    );
  });

  it("renders a bindings-free pair as a sequence wire with a grey marker", async () => {
    renderCanvas(makeWireProjectionConfig());
    await flushAnimationFrame();

    const sequence = screen.getByTestId("rf-edge-e_bare");
    expect(sequence).toHaveAttribute("data-wire-variant", "sequence");

    // The dashed grey stroke itself is rendered by WorkflowEdge from the
    // wire data (WorkflowEdge.test.tsx covers it); the projection only
    // supplies the matching grey arrowhead marker.
    const projected = getCapturedEdges().find((e) => e.id === "e_bare");
    expect(projected?.markerEnd).toMatchObject({ color: "#9ca3af" });
  });

  it("anchors error edges at the bottom `error` source handle", async () => {
    renderCanvas(makeWireProjectionConfig());
    await flushAnimationFrame();

    const errorEdge = screen.getByTestId("rf-edge-e_error");
    expect(errorEdge).toHaveAttribute("data-wire-variant", "error");
    expect(errorEdge).toHaveAttribute("data-source-handle", "error");
  });

  it("falls back to `out` for a stray error edge whose source has no fallback policy", async () => {
    // Hand-authored/API configs can carry an error edge WITHOUT the
    // source's `errorPolicy.onError === "fallback"` (the validator checks
    // fallback => edge, not the converse). The `error` handle only mounts
    // under that policy, so stamping it would make xyflow drop the edge
    // (error008) — the stray edge must render anchored at `out` instead.
    const config = makeWireProjectionConfig();
    const prep = config.nodes.prep as ActivityNode;
    const { errorPolicy: _dropped, ...prepWithoutPolicy } = prep;
    renderCanvas({
      ...config,
      nodes: { ...config.nodes, prep: prepWithoutPolicy as ActivityNode },
    });
    await flushAnimationFrame();

    const errorEdge = screen.getByTestId("rf-edge-e_error");
    expect(errorEdge).toHaveAttribute("data-wire-variant", "error");
    expect(errorEdge).toHaveAttribute("data-source-handle", "out");
  });

  it("re-projects wires when a binding edit changes the config (fingerprint covers bindings)", async () => {
    const config = makeWireProjectionConfig();
    const { rerenderWithConfig } = renderCanvas(config);
    await flushAnimationFrame();
    expect(
      screen.getByTestId("rf-edge-wire:submit:fileData"),
    ).toBeInTheDocument();

    // Settings-rail-style edit: clear submit's input binding. Node ids,
    // labels, types and edges all stay identical — only the binding
    // changes, which the pre-fix fingerprint ignored.
    const submit = config.nodes.submit as ActivityNode;
    const next: GraphWorkflowConfig = {
      ...config,
      nodes: {
        ...config.nodes,
        submit: { ...submit, inputs: [] },
      },
    };
    rerenderWithConfig(next);
    await flushAnimationFrame();

    // The data wire is gone and the underlying normal edge resurfaces as
    // a sequence wire.
    expect(
      screen.queryByTestId("rf-edge-wire:submit:fileData"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("rf-edge-e_bound")).toHaveAttribute(
      "data-wire-variant",
      "sequence",
    );
  });

  it("anchors wires touching catalog-less (dyn.*) activity nodes at node level — and still renders them", async () => {
    // prep (static catalog) → dyn1 (no static entry → no port rows) →
    // submit (static catalog). Both wires must render; the dyn.* ends
    // fall back to the node-level handles because `in-<port>`/
    // `out-<port>` never mount for catalog-less nodes (targeting them
    // would make xyflow drop the edge → pair looks disconnected).
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      parameters: {},
      outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 0, y: 0 } },
    };
    const dyn1: ActivityNode = {
      id: "dyn1",
      type: "activity",
      label: "Custom Script",
      activityType: "dyn.custom-script",
      parameters: {},
      inputs: [{ port: "payload", ctxKey: "__auto.prep.preparedData" }],
      outputs: [{ port: "result", ctxKey: "__auto.dyn1.result" }],
      metadata: { position: { x: 300, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      inputs: [{ port: "fileData", ctxKey: "__auto.dyn1.result" }],
      metadata: { position: { x: 600, y: 0 } },
    };
    renderCanvas({
      schemaVersion: "1.0",
      metadata: { name: "Dyn wires", version: "1.0.0" },
      ctx: {},
      nodes: { prep, dyn1, submit },
      edges: [
        { id: "e1", source: "prep", target: "dyn1", type: "normal" },
        { id: "e2", source: "dyn1", target: "submit", type: "normal" },
      ],
      entryNodeId: "prep",
    });
    await flushAnimationFrame();

    // Wire INTO the dyn node: per-port at the static-catalog source,
    // node-level (no target handle attr → xyflow default) at the dyn end.
    const intoDyn = screen.getByTestId("rf-edge-wire:dyn1:payload");
    expect(intoDyn).toHaveAttribute("data-wire-variant", "data");
    expect(intoDyn).toHaveAttribute("data-source-handle", "out-preparedData");
    expect(intoDyn).not.toHaveAttribute("data-target-handle");

    // Wire OUT OF the dyn node: node-level "out" at the dyn end,
    // per-port at the static-catalog consumer.
    const outOfDyn = screen.getByTestId("rf-edge-wire:submit:fileData");
    expect(outOfDyn).toHaveAttribute("data-source-handle", "out");
    expect(outOfDyn).toHaveAttribute("data-target-handle", "in-fileData");
  });

  it("anchors a stale binding (port the swapped-to entry lacks) at node level instead of a never-mounted handle", async () => {
    // `azureOcr.submit` declares `fileData`, not `legacyPort` — e.g. a
    // binding left behind by an activity-type swap. The wire must still
    // render, anchored at the node-level target handle.
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      parameters: {},
      outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      inputs: [{ port: "legacyPort", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 300, y: 0 } },
    };
    renderCanvas({
      schemaVersion: "1.0",
      metadata: { name: "Stale binding", version: "1.0.0" },
      ctx: {},
      nodes: { prep, submit },
      edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
      entryNodeId: "prep",
    });
    await flushAnimationFrame();

    const wire = screen.getByTestId("rf-edge-wire:submit:legacyPort");
    expect(wire).toHaveAttribute("data-wire-variant", "data");
    expect(wire).toHaveAttribute("data-source-handle", "out-preparedData");
    expect(wire).not.toHaveAttribute("data-target-handle");
  });

  it("simplified view: error edges anchor at the error handle for real sources but not for chip sources", async () => {
    const inGroup: ActivityNode = {
      id: "inGroup",
      type: "activity",
      label: "Grouped",
      activityType: "file.prepare",
      parameters: {},
      errorPolicy: { retryable: false, onError: "fallback" },
      metadata: { position: { x: 0, y: 0 } },
    };
    const loose: ActivityNode = {
      id: "loose",
      type: "activity",
      label: "Loose",
      activityType: "azureOcr.submit",
      parameters: {},
      errorPolicy: { retryable: false, onError: "fallback" },
      metadata: { position: { x: 300, y: 0 } },
    };
    renderCanvas(
      {
        schemaVersion: "1.0",
        metadata: { name: "Simplified error", version: "1.0.0" },
        ctx: {},
        nodes: { inGroup, loose },
        edges: [
          // Real-node source → gets the explicit error source handle.
          { id: "e_real", source: "loose", target: "inGroup", type: "error" },
          // Group-chip source (rewritten to `group-chip-g1`) → chips have
          // anonymous handles, so no sourceHandle may be stamped.
          { id: "e_chip", source: "inGroup", target: "loose", type: "error" },
        ],
        entryNodeId: "loose",
        nodeGroups: {
          g1: { label: "Group 1", nodeIds: ["inGroup"] },
        },
      },
      { simplifiedView: true },
    );
    await flushAnimationFrame();

    const real = screen.getByTestId("rf-edge-e_real");
    expect(real).toHaveAttribute("data-source-handle", "error");
    const chip = screen.getByTestId("rf-edge-e_chip");
    expect(chip).toHaveAttribute("data-source", "group-chip-g1");
    expect(chip).not.toHaveAttribute("data-source-handle");
  });
});

// ---------------------------------------------------------------------------
// Shared fixtures/helpers for the data-wire tests below (Task 4 §6.3 and
// Task 5 §7 both operate on the same "prep --(e1)--> submit" pair, so these
// are hoisted to module scope rather than duplicated per describe block).
// ---------------------------------------------------------------------------

/**
 * prep --(edge e1, normal)--> submit, with ONE data wire (prep.outA →
 * submit.inA via ctxKey "k1"). The edge survives the wire — `edgeId` gets
 * stamped onto it by `deriveStructuralWires` — so this is the "last data
 * wire on the pair, its edge remains" fixture.
 */
function makeSingleWireConfig(): GraphWorkflowConfig {
  const prep: ActivityNode = {
    id: "prep",
    type: "activity",
    label: "Prep",
    activityType: "data.transform",
    parameters: {},
    outputs: [{ port: "outA", ctxKey: "k1" }],
    metadata: { position: { x: 0, y: 0 } },
  };
  const submit: ActivityNode = {
    id: "submit",
    type: "activity",
    label: "Submit",
    activityType: "data.transform",
    parameters: {},
    inputs: [{ port: "inA", ctxKey: "k1" }],
    metadata: { position: { x: 300, y: 0 } },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "Single wire", version: "1.0.0" },
    ctx: {},
    nodes: { prep, submit },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
    entryNodeId: "prep",
  };
}

/** Same pair, but `submit.inA` is already locked (pinned) to prep.outA. */
function makePinnedSingleWireConfig(): GraphWorkflowConfig {
  const config = makeSingleWireConfig();
  const submit = config.nodes.submit as ActivityNode;
  return {
    ...config,
    nodes: {
      ...config.nodes,
      submit: {
        ...submit,
        metadata: { ...submit.metadata, lockedInputPorts: ["inA"] },
      },
    },
  };
}

/** A bindings-free pair — renders purely as a structural sequence wire. */
function makeSequenceOnlyConfig(): GraphWorkflowConfig {
  const bare1: ActivityNode = {
    id: "bare1",
    type: "activity",
    label: "Bare A",
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 0, y: 200 } },
  };
  const bare2: ActivityNode = {
    id: "bare2",
    type: "activity",
    label: "Bare B",
    activityType: "data.transform",
    parameters: {},
    metadata: { position: { x: 300, y: 200 } },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "Sequence only", version: "1.0.0" },
    ctx: {},
    nodes: { bare1, bare2 },
    edges: [{ id: "e_bare", source: "bare1", target: "bare2", type: "normal" }],
    entryNodeId: "bare1",
  };
}

function getCapturedEdges(): Edge[] {
  const props = latestReactFlowProps.current;
  if (!props) throw new Error("ReactFlow mock did not capture props");
  return (props.edges as Edge[]) ?? [];
}

/** Minimal xyflow Node payload — the delete path only reads `id`. */
function flowNode(id: string): FlowNode {
  return { id, data: {}, position: { x: 0, y: 0 } };
}

function lastEmittedConfig(
  onConfigChange: ReturnType<typeof vi.fn>,
): GraphWorkflowConfig {
  expect(onConfigChange).toHaveBeenCalled();
  const calls = onConfigChange.mock.calls;
  return calls[calls.length - 1][0] as GraphWorkflowConfig;
}

// ---------------------------------------------------------------------------
// Task 4 (§6.3): data wire deletion — disconnect the binding + pin the port
// unbound; `config.edges` is untouched by a data-wire delete. When the LAST
// data wire between a pair is deleted and a normal edge still connects the
// pair, that edge re-renders as a dashed sequence wire — a one-shot
// notification explains it.
//   PORT_WIRING_DESIGN.md §6.3
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — data wire deletion (§6.3)", () => {
  /**
   * Same pair, TWO data wires (prep.outA → submit.inA via "k1", prep.outB →
   * submit.inB via "k2") over the one normal edge — `deriveStructuralWires`
   * stamps the edge id onto BOTH wires, so deleting either one alone still
   * leaves a data wire on the pair.
   */
  function makeTwoWiresConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "data.transform",
      parameters: {},
      outputs: [
        { port: "outA", ctxKey: "k1" },
        { port: "outB", ctxKey: "k2" },
      ],
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit",
      activityType: "data.transform",
      parameters: {},
      inputs: [
        { port: "inA", ctxKey: "k1" },
        { port: "inB", ctxKey: "k2" },
      ],
      metadata: { position: { x: 300, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Two wires", version: "1.0.0" },
      ctx: {},
      nodes: { prep, submit },
      edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
      entryNodeId: "prep",
    };
  }

  /** Same single wire, but no edge connects the pair at all. */
  function makeWireWithoutEdgeConfig(): GraphWorkflowConfig {
    const config = makeSingleWireConfig();
    return { ...config, edges: [] };
  }

  /** `makeSingleWireConfig` + `makeSequenceOnlyConfig` merged into one graph. */
  function makeMixedConfig(): GraphWorkflowConfig {
    const wireConfig = makeSingleWireConfig();
    const sequenceConfig = makeSequenceOnlyConfig();
    return {
      ...wireConfig,
      nodes: { ...wireConfig.nodes, ...sequenceConfig.nodes },
      edges: [...wireConfig.edges, ...sequenceConfig.edges],
    };
  }

  /** Resolves the unified `onDelete` callback the canvas hands to ReactFlow. */
  function getOnDelete(): (params: {
    nodes: FlowNode[];
    edges: Edge[];
  }) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onDelete !== "function") {
      throw new Error("ReactFlow mock did not capture onDelete");
    }
    return props.onDelete as (params: {
      nodes: FlowNode[];
      edges: Edge[];
    }) => void;
  }

  it("projects data wires as selectable and deletable", async () => {
    renderCanvas(makeSingleWireConfig());
    await flushAnimationFrame();

    const projected = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    expect(projected?.deletable).toBe(true);
    expect(projected?.selectable).toBe(true);
  });

  it("deleting a data wire removes the input binding and locks the port, leaving config.edges untouched", async () => {
    const config = makeSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toEqual([]);
    expect(submit.metadata?.lockedInputPorts).toEqual(["inA"]);
    expect(next.edges).toEqual(config.edges);
  });

  it("deleting a structural sequence wire still removes the edge", async () => {
    const config = makeSequenceOnlyConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const sequenceEdge = getCapturedEdges().find((e) => e.id === "e_bare");
    if (!sequenceEdge) throw new Error("sequence wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [sequenceEdge] });
    });

    const next = lastEmittedConfig(onConfigChange);
    expect(next.edges).toEqual([]);
    const bare1 = next.nodes.bare1 as ActivityNode;
    const bare2 = next.nodes.bare2 as ActivityNode;
    expect(bare1.metadata?.lockedInputPorts).toBeUndefined();
    expect(bare2.metadata?.lockedInputPorts).toBeUndefined();
  });

  it("mixed deletion handles both in one onConfigChange", async () => {
    const config = makeMixedConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const edges = getCapturedEdges();
    const dataWireEdge = edges.find((e) => e.id === "wire:submit:inA");
    const sequenceEdge = edges.find((e) => e.id === "e_bare");
    if (!dataWireEdge || !sequenceEdge) {
      throw new Error("expected both a data wire and a sequence wire");
    }

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge, sequenceEdge] });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toEqual([]);
    expect(submit.metadata?.lockedInputPorts).toEqual(["inA"]);
    expect(next.edges).toEqual([
      { id: "e1", source: "prep", target: "submit", type: "normal" },
    ]);
  });

  it("shows the 'Execution order kept' hint when the last data wire between a pair is deleted and a normal edge remains", async () => {
    const config = makeSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    expect(onConfigChange).toHaveBeenCalled();
    // The hint is now JSX (text + inline "Detach fully" action) rather than
    // a plain string, so render the captured `message` and assert the
    // explanatory text is still present.
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    const toastCall = showMock.mock.calls.find(
      (c) => (c[0] as { id?: string }).id === DETACH_FULLY_TOAST_ID,
    );
    if (!toastCall) throw new Error("detach-fully toast not shown");
    const { message } = toastCall[0] as { message: React.ReactNode };
    render(<MantineProvider>{message}</MantineProvider>);
    expect(
      screen.getByText(
        /Execution order kept — delete the dashed wire to fully detach\./,
      ),
    ).toBeInTheDocument();
  });

  it("auto-selects the surviving execution edge after the last data wire on a pair is deleted", async () => {
    const config = makeSingleWireConfig();
    const { onConfigChange, rerenderWithConfig } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    // The disconnect emits a new config where the normal edge `e1` re-renders
    // as a dashed sequence remainder. Mirror the host's `setConfig(next)` so
    // the projection re-runs and applies the pending auto-selection.
    const next = lastEmittedConfig(onConfigChange);
    act(() => {
      rerenderWithConfig(next);
    });
    await flushAnimationFrame();

    const survivor = getCapturedEdges().find((e) => e.id === "e1");
    if (!survivor) throw new Error("surviving execution edge not projected");
    expect(survivor.selected).toBe(true);
    // Every other edge is deselected so the next Delete targets only e1.
    for (const e of getCapturedEdges()) {
      if (e.id !== "e1") expect(e.selected ?? false).toBe(false);
    }
  });

  it("offers a 'Detach fully' action whose handler drops the surviving edge from the latest config", async () => {
    const config = makeSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    const toastCall = showMock.mock.calls.find(
      (c) => (c[0] as { id?: string }).id === DETACH_FULLY_TOAST_ID,
    );
    if (!toastCall) throw new Error("detach-fully toast not shown");
    const { message } = toastCall[0] as { message: React.ReactNode };
    render(<MantineProvider>{message}</MantineProvider>);

    const detachBtn = screen.getByRole("button", { name: /Detach fully/ });
    act(() => {
      fireEvent.click(detachBtn);
    });

    // The handler drops the surviving execution edge from the CURRENT config.
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ edges: [] }),
    );
    // And dismisses its own toast.
    expect(notifications.hide).toHaveBeenCalledWith(DETACH_FULLY_TOAST_ID);
  });

  it("does not auto-select or offer detach when another data wire still binds the pair", async () => {
    const config = makeTwoWiresConfig();
    const { onConfigChange, rerenderWithConfig } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    expect(notifications.show).not.toHaveBeenCalled();

    const next = lastEmittedConfig(onConfigChange);
    act(() => {
      rerenderWithConfig(next);
    });
    await flushAnimationFrame();

    // The remaining data wire keeps `e1` stamped, so no structural remainder
    // edge is emitted and nothing is auto-selected.
    for (const e of getCapturedEdges()) {
      expect(e.selected ?? false).toBe(false);
    }
  });

  it("does not show the hint when other data wires between the pair remain", async () => {
    const config = makeTwoWiresConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    expect(onConfigChange).toHaveBeenCalled();
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does not show the hint when no edge connects the pair", async () => {
    const config = makeWireWithoutEdgeConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataWireEdge] });
    });

    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toEqual([]);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("deleting a node with attached data wires does not disconnect surviving ports or show the hint", async () => {
    // xyflow's delete pipeline sweeps every deletable edge connected to a
    // deleted node into the same gesture — the swept data wire arrives in
    // `onDelete`'s edges alongside the node. Because the wire's SOURCE is
    // the dying node, the surviving consumer (`submit`) must NOT be
    // pinned unbound, and the "Execution order kept" hint must not show
    // (node + edge + wire all vanish together — nothing survives to
    // explain).
    const config = makeSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [flowNode("prep")], edges: [dataWireEdge] });
    });

    const next = lastEmittedConfig(onConfigChange);
    expect(next.nodes.prep).toBeUndefined();
    // e1 touched the deleted node → removed with it.
    expect(next.edges).toEqual([]);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.metadata?.lockedInputPorts).toBeUndefined();
    // No "Execution order kept" hint. (The delete DOES raise the G-002
    // orphaned-variable toast — prep was the sole writer of a key submit
    // reads — so this asserts against that toast's id, not against every
    // notification.)
    const shown = (
      notifications.show as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(shown.some((arg) => arg?.id === DETACH_FULLY_TOAST_ID)).toBe(false);
  });

  it("co-deleting a node and an unrelated data wire applies both in one onConfigChange", async () => {
    // Regression for the lost-update bug: node removal and wire
    // disconnect used to run through two separate callbacks each calling
    // `onConfigChange(fullConfig)` — the second call clobbered the first.
    // The unified `onDelete` path must fold both into ONE emission.
    const config = makeMixedConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnDelete()({ nodes: [flowNode("bare1")], edges: [dataWireEdge] });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    // Node side: bare1 gone, its e_bare edge gone.
    expect(next.nodes.bare1).toBeUndefined();
    expect(next.edges).toEqual([
      { id: "e1", source: "prep", target: "submit", type: "normal" },
    ]);
    // Wire side: the unrelated wire's disconnect survived the node delete.
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toEqual([]);
    expect(submit.metadata?.lockedInputPorts).toEqual(["inA"]);
  });
});

// ---------------------------------------------------------------------------
// Task 5 (§7): right-click context menu on data wires — "Disconnect" (always)
// and "Revert to automatic" (pinned wires only). Structural wires keep the
// browser's native context menu (no preventDefault, nothing opens).
//   PORT_WIRING_DESIGN.md §7
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — wire context menu (§7)", () => {
  /** Resolves the `onEdgeContextMenu` callback the canvas hands to ReactFlow. */
  function getOnEdgeContextMenu(): (
    event: React.MouseEvent,
    edge: Edge,
  ) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onEdgeContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onEdgeContextMenu");
    }
    return props.onEdgeContextMenu as (
      event: React.MouseEvent,
      edge: Edge,
    ) => void;
  }

  function makeContextMenuEvent(clientX = 111, clientY = 222) {
    return {
      preventDefault: vi.fn(),
      clientX,
      clientY,
    } as unknown as React.MouseEvent & {
      preventDefault: ReturnType<typeof vi.fn>;
    };
  }

  it("opens the menu on data-wire context menu with preventDefault", async () => {
    renderCanvas(makeSingleWireConfig());
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    const event = makeContextMenuEvent();
    act(() => {
      getOnEdgeContextMenu()(event, dataWireEdge);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("wire-context-menu")).toBeInTheDocument();
    });
  });

  it("does not open for structural wires", async () => {
    renderCanvas(makeSequenceOnlyConfig());
    await flushAnimationFrame();

    const sequenceEdge = getCapturedEdges().find((e) => e.id === "e_bare");
    if (!sequenceEdge) throw new Error("sequence wire not projected");

    const event = makeContextMenuEvent();
    act(() => {
      getOnEdgeContextMenu()(event, sequenceEdge);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wire-context-menu")).not.toBeInTheDocument();
  });

  it("Disconnect applies §6.3 semantics", async () => {
    const config = makeSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnEdgeContextMenu()(makeContextMenuEvent(), dataWireEdge);
    });
    await waitFor(() => {
      expect(screen.getByTestId("wire-menu-disconnect")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wire-menu-disconnect"));

    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toEqual([]);
    expect(submit.metadata?.lockedInputPorts).toEqual(["inA"]);
    expect(next.edges).toEqual(config.edges);
  });

  it("Revert to automatic removes the lock", async () => {
    const config = makePinnedSingleWireConfig();
    const { onConfigChange } = renderCanvas(config);
    await flushAnimationFrame();

    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");

    act(() => {
      getOnEdgeContextMenu()(makeContextMenuEvent(), dataWireEdge);
    });
    await waitFor(() => {
      expect(screen.getByTestId("wire-menu-revert")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("wire-menu-revert"));

    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    expect(submit.metadata?.lockedInputPorts).toBeUndefined();
    expect(submit.inputs).toEqual([{ port: "inA", ctxKey: "k1" }]);
  });
});

// ---------------------------------------------------------------------------
// Task 6 (§6.1): drag port → port pins a binding
//   A connect gesture where BOTH endpoints are per-port handles
//   (`out-<port>` / `in-<port>`) writes the consumer's input binding, locks
//   the port, and ensures a normal edge connects the pair — one gesture,
//   data + order + pin. Mixed gestures (port → node-body, node → port)
//   fall through unchanged to the existing node-level edge path.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — drag-to-bind (§6.1)", () => {
  /** Resolves the `onConnect` callback the canvas hands to ReactFlow. */
  function getOnConnect(): (connection: Connection) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnect !== "function") {
      throw new Error("ReactFlow mock did not capture onConnect");
    }
    return props.onConnect as (connection: Connection) => void;
  }

  /**
   * Two activity nodes, no edges, no bindings — nothing wires them yet.
   * Uses a REAL catalog pair (not invented port names): `file.prepare`'s
   * `preparedData` output (Document) → `azureOcr.submit`'s `fileData`
   * input (Document) — the same pair `port-kinds.test.ts` exercises.
   */
  function makeUnwiredPairConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Unwired pair", version: "1.0.0" },
      ctx: {},
      nodes: { prep, submit },
      edges: [],
      entryNodeId: "prep",
    };
  }

  it("a port-to-port connection pins the binding, locks the port, and ensures a normal edge", () => {
    const config = makeUnwiredPairConfig();
    const { onConfigChange } = renderCanvas(config);

    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out-preparedData",
        targetHandle: "in-fileData",
      });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    const submit = next.nodes.submit as ActivityNode;
    const prep = next.nodes.prep as ActivityNode;

    expect(submit.inputs).toHaveLength(1);
    expect(submit.inputs?.[0].port).toBe("fileData");
    const ctxKey = submit.inputs?.[0].ctxKey;
    expect(prep.outputs).toEqual([{ port: "preparedData", ctxKey }]);
    expect(submit.metadata?.lockedInputPorts).toEqual(["fileData"]);

    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "prep",
      target: "submit",
      type: "normal",
    });
  });

  it("skips the edge when one already connects the pair but still pins the binding", () => {
    const base = makeUnwiredPairConfig();
    const config: GraphWorkflowConfig = {
      ...base,
      edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
    };
    const { onConfigChange } = renderCanvas(config);

    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out-preparedData",
        targetHandle: "in-fileData",
      });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    expect(next.edges).toEqual(config.edges);

    const submit = next.nodes.submit as ActivityNode;
    expect(submit.inputs).toHaveLength(1);
    expect(submit.inputs?.[0].port).toBe("fileData");
    expect(submit.metadata?.lockedInputPorts).toEqual(["fileData"]);
  });

  it("port-source dropped on a node-level target falls through to plain edge creation", () => {
    const config = makeUnwiredPairConfig();
    const { onConfigChange } = renderCanvas(config);

    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out-preparedData",
        targetHandle: null,
      });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "prep",
      target: "submit",
      type: "normal",
    });

    const submit = next.nodes.submit as ActivityNode;
    expect(submit.metadata?.lockedInputPorts).toBeUndefined();
    expect(submit.inputs).toBeUndefined();
  });

  it("node-level source dropped on a port target also falls through", () => {
    const config = makeUnwiredPairConfig();
    const { onConfigChange } = renderCanvas(config);

    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: "in-fileData",
      });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = lastEmittedConfig(onConfigChange);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "prep",
      target: "submit",
      type: "normal",
    });

    const submit = next.nodes.submit as ActivityNode;
    expect(submit.metadata?.lockedInputPorts).toBeUndefined();
    expect(submit.inputs).toBeUndefined();
  });

  // Node-level connections (both endpoints anonymous/`out`/`error` handles)
  // keep today's behavior — covered by the existing
  // "US-025: handleConnect edge-type stamping" suite above; not duplicated
  // here.
});

// ---------------------------------------------------------------------------
// Task 7 (§6.2): connect-time kind validation — `isValidConnection` +
// rejection notice. Real catalog activities/ports throughout (no invented
// port names) so the kind lookups exercise the actual registry:
//   - file.prepare.preparedData: Document  →  azureOcr.submit.fileData: Document
//     (assignable — identity match)
//   - document.split.segments: Segment[]   →  azureOcr.submit.fileData: Document
//     (incompatible — cardinality mismatch)
//   - document.split.segments: Segment[]   →  file.prepare.documentId: Artifact
//     (wildcard target — always accepted)
//   - document.split.segments: Segment[]   →  ocr.cleanup.ocrResult: OcrResult
//     (incompatible with a vowel-initial target kind — pins the
//     article-free notice copy)
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — connect-time validation (§6.2)", () => {
  function makeTypedPortsConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const ocr: ActivityNode = {
      id: "ocr",
      type: "activity",
      label: "OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    const split: ActivityNode = {
      id: "split",
      type: "activity",
      label: "Split",
      activityType: "document.split",
      parameters: {},
      metadata: { position: { x: 600, y: 0 } },
    };
    const cleanup: ActivityNode = {
      id: "cleanup",
      type: "activity",
      label: "Cleanup",
      activityType: "ocr.cleanup",
      parameters: {},
      metadata: { position: { x: 900, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Typed ports" },
      ctx: {},
      nodes: { prep, ocr, split, cleanup },
      edges: [],
      entryNodeId: "prep",
    };
  }

  /** Resolves the `isValidConnection` callback the canvas hands to ReactFlow. */
  function getIsValidConnection(): (connection: Connection) => boolean {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.isValidConnection !== "function") {
      throw new Error("ReactFlow mock did not capture isValidConnection");
    }
    return props.isValidConnection as (connection: Connection) => boolean;
  }

  /** Resolves the `onConnectEnd` callback the canvas hands to ReactFlow. */
  function getOnConnectEnd(): (
    event: unknown,
    connectionState: unknown,
  ) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnectEnd !== "function") {
      throw new Error("ReactFlow mock did not capture onConnectEnd");
    }
    return props.onConnectEnd as (
      event: unknown,
      connectionState: unknown,
    ) => void;
  }

  it("rejects an incompatible port-to-port pair", () => {
    renderCanvas(makeTypedPortsConfig());
    const result = getIsValidConnection()({
      source: "split",
      target: "ocr",
      sourceHandle: "out-segments",
      targetHandle: "in-fileData",
    });
    expect(result).toBe(false);
  });

  it("accepts an assignable pair", () => {
    renderCanvas(makeTypedPortsConfig());
    const result = getIsValidConnection()({
      source: "prep",
      target: "ocr",
      sourceHandle: "out-preparedData",
      targetHandle: "in-fileData",
    });
    expect(result).toBe(true);
  });

  it("accepts any drop onto a base-Artifact input port", () => {
    renderCanvas(makeTypedPortsConfig());
    // document.split's `segments` (Segment[]) output is a poor structural
    // match for anything, but `file.prepare`'s `fileName` input declares
    // the wildcard `Artifact` kind — a manual drag onto it is always
    // accepted per §6.2. (`documentId` no longer qualifies: it carries the
    // typed `DocumentId` kind since the 2026-08-02 identifier retag.)
    const result = getIsValidConnection()({
      source: "split",
      target: "prep",
      sourceHandle: "out-segments",
      targetHandle: "in-fileName",
    });
    expect(result).toBe(true);
  });

  it("rejects a non-identifier drop onto a typed identifier port (2026-08-02 retag)", () => {
    renderCanvas(makeTypedPortsConfig());
    // Segment[] is not assignable to DocumentId — ids stopped being
    // accept-anything wildcards.
    const result = getIsValidConnection()({
      source: "split",
      target: "prep",
      sourceHandle: "out-segments",
      targetHandle: "in-documentId",
    });
    expect(result).toBe(false);
  });

  it("always accepts node-level connections", () => {
    renderCanvas(makeTypedPortsConfig());
    const result = getIsValidConnection()({
      source: "split",
      target: "ocr",
      sourceHandle: "out",
      targetHandle: null,
    });
    expect(result).toBe(true);
  });

  it("rejects self-connections", () => {
    renderCanvas(makeTypedPortsConfig());
    const result = getIsValidConnection()({
      source: "prep",
      target: "prep",
      sourceHandle: "out",
      targetHandle: null,
    });
    expect(result).toBe(false);
  });

  it("shows a plain-language rejection notice on an invalid port drop", () => {
    renderCanvas(makeTypedPortsConfig());
    const onConnectEnd = getOnConnectEnd();
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;

    showMock.mockClear();
    act(() => {
      onConnectEnd(new MouseEvent("mouseup"), {
        isValid: false,
        fromNode: { id: "split" },
        fromHandle: { id: "out-segments" },
        toNode: { id: "ocr" },
        toHandle: { id: "in-fileData" },
      });
    });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      message:
        "This input needs PreparedFile — DocumentSegment (list) can't be used here",
    });

    showMock.mockClear();
    act(() => {
      onConnectEnd(new MouseEvent("mouseup"), {
        isValid: true,
        fromNode: { id: "split" },
        fromHandle: { id: "out-segments" },
        toNode: { id: "ocr" },
        toHandle: { id: "in-fileData" },
      });
    });
    expect(showMock).not.toHaveBeenCalled();

    showMock.mockClear();
    act(() => {
      onConnectEnd(new MouseEvent("mouseup"), {
        isValid: false,
        fromNode: { id: "split" },
        // Node-level source handle — not a port-to-port drag.
        fromHandle: { id: "out" },
        toNode: { id: "ocr" },
        toHandle: { id: "in-fileData" },
      });
    });
    expect(showMock).not.toHaveBeenCalled();

    showMock.mockClear();
    act(() => {
      onConnectEnd(new MouseEvent("mouseup"), {
        isValid: false,
        fromNode: { id: "split" },
        fromHandle: { id: "out-segments" },
        toNode: { id: "ocr" },
        // Dropped off any handle entirely.
        toHandle: null,
      });
    });
    expect(showMock).not.toHaveBeenCalled();
  });

  it("keeps the notice article-free for vowel-initial target kinds", () => {
    // "…as a OcrResult" is the trap the fixed copy avoids — the message
    // names the kinds without an indefinite article.
    renderCanvas(makeTypedPortsConfig());
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    showMock.mockClear();

    act(() => {
      getOnConnectEnd()(new MouseEvent("mouseup"), {
        isValid: false,
        fromNode: { id: "split" },
        fromHandle: { id: "out-segments" },
        toNode: { id: "cleanup" },
        toHandle: { id: "in-ocrResult" },
      });
    });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      message:
        "This input needs OcrResult — DocumentSegment (list) can't be used here",
    });
  });

  it("shows a distinct self-feed notice (not the kind message) for a port drop on the same node", () => {
    // isValidConnection rejects self-connections FIRST, so isValid is
    // false even when the kinds match — the kind-mismatch copy would be
    // self-contradictory ("Document can't be used as Document").
    renderCanvas(makeTypedPortsConfig());
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    showMock.mockClear();

    act(() => {
      getOnConnectEnd()(new MouseEvent("mouseup"), {
        isValid: false,
        fromNode: { id: "prep" },
        fromHandle: { id: "out-preparedData" },
        toNode: { id: "prep" },
        toHandle: { id: "in-blobKey" },
      });
    });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      message: "A step can't feed itself",
    });
    expect(showMock.mock.calls[0][0].message).not.toContain("can't be used");
  });
});

// ---------------------------------------------------------------------------
// US-046: Right-click context menu on canvas nodes
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-046-canvas-context-menu.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-046: node right-click context menu", () => {
  /**
   * Simulates a right-click on a node by invoking the captured
   * `onNodeContextMenu` callback the canvas hands to ReactFlow. The
   * xyflow mock above passes through the prop verbatim, so we can drive
   * the menu state machine without rendering the real ReactFlow widget.
   */
  function triggerContextMenu(nodeId: string, clientX = 100, clientY = 120) {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onNodeContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onNodeContextMenu");
    }
    const handler = props.onNodeContextMenu as (
      event: React.MouseEvent,
      node: FlowNode,
    ) => void;
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      clientX,
      clientY,
    } as unknown as React.MouseEvent;
    const node = {
      id: nodeId,
      data: {},
      position: { x: 0, y: 0 },
    } as unknown as FlowNode;
    act(() => {
      handler(event, node);
    });
    return { preventDefault };
  }

  /**
   * W-3 (2026-08-03) — right-clicking one node of a multi-selection showed the
   * single-node menu, and its Delete removed exactly that one node while the
   * other selected nodes stayed. The menu now acts on the selection.
   */
  function selectNodes(ids: string[]) {
    const props = latestReactFlowProps.current;
    const handler = props?.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;
    act(() => {
      handler({ nodes: ids.map((id) => ({ id })), edges: [] });
    });
  }

  it("W-3: deletes the whole selection in ONE config write", async () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());
    selectNodes(["activity_1", "switch_1"]);
    triggerContextMenu("activity_1");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-selection"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("context-menu-delete-selection"),
    ).toHaveTextContent("Delete 2 steps");

    onConfigChange.mockClear();
    fireEvent.click(screen.getByTestId("context-menu-delete-selection"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    // One write, so one Ctrl+Z brings all of them back.
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes).not.toHaveProperty("activity_1");
    expect(next.nodes).not.toHaveProperty("switch_1");
  });

  it("W-3: right-clicking OUTSIDE the selection falls back to the single-node menu", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    selectNodes(["activity_1", "switch_1"]);
    triggerContextMenu("map_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("context-menu-delete-selection"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("context-menu-delete-node")).toBeInTheDocument();
    // ...and the stale selection was cleared on the canvas, so what is
    // highlighted matches what the menu is about to act on.
    expect(mockSetNodes).toHaveBeenCalled();
  });

  it("Scenario 1: right-click on an activity node opens the menu with both entries enabled", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    const { preventDefault } = triggerContextMenu("activity_1");
    // xyflow's default + browser-native context menu must be suppressed
    // so the workflow menu can render in its place.
    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    const changeType = screen.getByTestId("context-menu-change-activity-type");
    const deleteNode = screen.getByTestId("context-menu-delete-node");
    expect(changeType).toBeInTheDocument();
    expect(deleteNode).toBeInTheDocument();
    expect(changeType).not.toHaveAttribute("data-disabled", "true");
    expect(deleteNode).not.toHaveAttribute("data-disabled", "true");
  });

  it("Scenario 2: right-click on a switch node disables 'Change activity type'", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    triggerContextMenu("switch_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    const changeType = screen.getByTestId("context-menu-change-activity-type");
    expect(changeType).toHaveAttribute("data-disabled", "true");
    // Delete remains available for control-flow nodes.
    expect(screen.getByTestId("context-menu-delete-node")).not.toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("Scenario 3: clicking outside closes the menu (no action runs)", async () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());
    triggerContextMenu("activity_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    // Mantine's `useClickOutside` listens for `mousedown` / `touchstart`
    // by default — fire `mousedown` on the document body to dismiss.
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
    });
    // No mutation flowed through to onConfigChange — the menu just
    // closed without firing any of its entry callbacks.
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("Scenario 4: 'Delete node' triggers the existing handleNodesDelete path", async () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());
    triggerContextMenu("map_1");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-delete-node"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const calls = onConfigChange.mock.calls;
    const lastConfig = calls[calls.length - 1][0] as GraphWorkflowConfig;
    // Confirms the same removal path as keyboard-delete: the target node
    // is gone from config.nodes (and any adjacent edges are dropped — no
    // edges exist in this fixture, but the deletion still propagates).
    expect(lastConfig.nodes).not.toHaveProperty("map_1");
    expect(Object.keys(lastConfig.nodes)).toHaveLength(
      Object.keys(makeAllNodeTypesConfig().nodes).length - 1,
    );
  });
});

// ---------------------------------------------------------------------------
// US-047: "Change activity type" preserves overlapping config
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-047-node-type-swap.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-047: change activity type via context menu", () => {
  /**
   * Same right-click helper the US-046 block uses — invoke the captured
   * `onNodeContextMenu` directly because the xyflow mock passes it
   * through verbatim.
   */
  function triggerContextMenu(nodeId: string, clientX = 100, clientY = 120) {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onNodeContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onNodeContextMenu");
    }
    const handler = props.onNodeContextMenu as (
      event: React.MouseEvent,
      node: FlowNode,
    ) => void;
    const event = {
      preventDefault: vi.fn(),
      clientX,
      clientY,
    } as unknown as React.MouseEvent;
    const node = {
      id: nodeId,
      data: {},
      position: { x: 0, y: 0 },
    } as unknown as FlowNode;
    act(() => {
      handler(event, node);
    });
  }

  /**
   * Config fixture with one activity node that carries a meaningful
   * parameters map + edges in and out of it. The activity type is
   * `data.transform` which declares `inputFormat` + `outputFormat` +
   * `fieldMapping` in its schema — picking `file.prepare` afterwards
   * drops all of these (file.prepare has a completely different shape).
   */
  function makeSwapFixture(): GraphWorkflowConfig {
    const upstream: ActivityNode = {
      id: "upstream",
      type: "activity",
      label: "Upstream",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const target: ActivityNode = {
      id: "target",
      type: "activity",
      label: "My transform",
      activityType: "data.transform",
      parameters: {
        inputFormat: "json",
        outputFormat: "xml",
        fieldMapping: '{"foo":"{{ctx.bar}}"}',
      },
      inputs: [{ port: "in", ctxKey: "ctx.in" }],
      outputs: [{ port: "out", ctxKey: "ctx.out" }],
      errorPolicy: { retryable: true, onError: "fail" },
      retry: { maximumAttempts: 3 },
      timeout: { startToClose: "30s" },
      metadata: { position: { x: 200, y: 0 } },
    };
    const downstream: ActivityNode = {
      id: "downstream",
      type: "activity",
      label: "Downstream",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 400, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Swap fixture", version: "1.0.0" },
      ctx: {},
      nodes: {
        [upstream.id]: upstream,
        [target.id]: target,
        [downstream.id]: downstream,
      },
      edges: [
        {
          id: "edge_up",
          source: upstream.id,
          target: target.id,
          type: "normal",
        },
        {
          id: "edge_down",
          source: target.id,
          target: downstream.id,
          type: "normal",
        },
      ],
      entryNodeId: upstream.id,
    };
  }

  it("Scenario 1: clicking 'Change activity type' opens the swap modal with the right current type", async () => {
    renderCanvas(makeSwapFixture());
    triggerContextMenu("target");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    await waitFor(() => {
      expect(screen.getByTestId("node-type-swap-modal")).toBeInTheDocument();
    });
    // The current activity-type's row is marked with `data-current="true"`
    // so the user can see which row they're already on.
    const currentEntry = await screen.findByTestId(
      "node-type-swap-entry-data.transform",
    );
    expect(currentEntry).toHaveAttribute("data-current", "true");
  });

  it("Scenario 2: picking a new type fires onConfigChange with the swapped node", async () => {
    const fixture = makeSwapFixture();
    const { onConfigChange } = renderCanvas(fixture);
    triggerContextMenu("target");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    await waitFor(() => {
      expect(screen.getByTestId("node-type-swap-modal")).toBeInTheDocument();
    });
    // Pick `file.prepare` — completely different parameter shape from
    // data.transform, so the swap drops every key on the old node.
    const newTypeEntry = await screen.findByTestId(
      "node-type-swap-entry-file.prepare",
    );
    fireEvent.click(newTypeEntry);
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const calls = onConfigChange.mock.calls;
    const lastConfig = calls[calls.length - 1]?.[0] as
      | GraphWorkflowConfig
      | undefined;
    expect(lastConfig).toBeDefined();
    const updatedNode = lastConfig?.nodes.target;
    if (!updatedNode || updatedNode.type !== "activity") {
      throw new Error(
        "expected `target` to remain an activity node after swap",
      );
    }
    expect(updatedNode.activityType).toBe("file.prepare");
    // Carried-over fields stay untouched.
    expect(updatedNode.label).toBe("My transform");
    // G-032 — `file.prepare` declares neither `in` nor `out`, so those
    // bindings CANNOT carry over: the engine would write `undefined` through
    // the stale output row and overwrite `ctx.out` for every downstream
    // reader, while the canvas kept drawing the wire.
    expect(updatedNode.inputs).toEqual([]);
    expect(updatedNode.outputs).toEqual([]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "yellow",
        message: expect.stringContaining("could not carry over"),
      }),
    );
    expect(updatedNode.errorPolicy).toEqual({
      retryable: true,
      onError: "fail",
    });
    expect(updatedNode.retry).toEqual({ maximumAttempts: 3 });
    expect(updatedNode.timeout).toEqual({ startToClose: "30s" });
    expect(updatedNode.metadata).toEqual({ position: { x: 200, y: 0 } });
  });

  it("Scenario 3: existing edges remain after the swap", async () => {
    const fixture = makeSwapFixture();
    const originalEdges = fixture.edges;
    const { onConfigChange } = renderCanvas(fixture);
    triggerContextMenu("target");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    const newTypeEntry = await screen.findByTestId(
      "node-type-swap-entry-file.prepare",
    );
    fireEvent.click(newTypeEntry);
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const calls = onConfigChange.mock.calls;
    const lastConfig = calls[calls.length - 1]?.[0] as
      | GraphWorkflowConfig
      | undefined;
    // Edges array is unchanged — both edges still reference the same
    // source/target ids and types.
    expect(lastConfig?.edges).toEqual(originalEdges);
  });

  it("Scenario 4: swap that produces a Zod-invalid result is still applied to the config", async () => {
    // Going from `data.transform` (no required `documentId`) to a target
    // that requires a non-defaulted field (or where the defaulted value
    // would fail .min(1)) lands an invalid config — the editor's
    // validation drawer will surface the error, but the swap goes through.
    // We simulate this by picking `file.prepare`; if any required fields
    // are undefaulted, `onConfigChange` is still called with the swapped
    // node and the canvas-side validator will flag the missing field.
    const fixture = makeSwapFixture();
    const { onConfigChange } = renderCanvas(fixture);
    triggerContextMenu("target");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-change-activity-type"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-change-activity-type"));
    const newTypeEntry = await screen.findByTestId(
      "node-type-swap-entry-file.prepare",
    );
    fireEvent.click(newTypeEntry);
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    // The swap MUST go through to onConfigChange regardless of whether
    // the result Zod-validates — the canvas doesn't gate on validity,
    // the validation drawer surfaces the issue.
    const calls = onConfigChange.mock.calls;
    const lastConfig = calls[calls.length - 1]?.[0] as
      | GraphWorkflowConfig
      | undefined;
    expect(lastConfig?.nodes.target).toBeDefined();
    const updatedNode = lastConfig?.nodes.target;
    if (!updatedNode || updatedNode.type !== "activity") {
      throw new Error(
        "expected `target` to remain an activity node after swap",
      );
    }
    expect(updatedNode.activityType).toBe("file.prepare");
  });

  it("Scenario 5: the menu entry is disabled on control-flow nodes (covered by US-046)", async () => {
    // This is a reference test — US-046 already locks down the disabled
    // state for all six control-flow types. Here we just confirm the
    // canvas wiring carries that contract through: opening the menu on a
    // switch node shows the entry as disabled, and clicking it does NOT
    // open the swap modal.
    renderCanvas(makeAllNodeTypesConfig());
    triggerContextMenu("switch_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    const changeType = screen.getByTestId("context-menu-change-activity-type");
    expect(changeType).toHaveAttribute("data-disabled", "true");
    fireEvent.click(changeType);
    // Mantine swallows the click on a disabled item — the swap modal
    // never mounts.
    expect(
      screen.queryByTestId("node-type-swap-modal"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-045: Hovering an outgoing handle pops a node picker; click adds + connects
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-045-hover-to-extend.md
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-045: hover-to-extend popover", () => {
  /**
   * Locates the source-right handle for the given node and fires
   * `mouseenter` on it. Used to drive the 200ms-debounced popover
   * open path.
   */
  // The hover-to-extend bridge lives on the NODE-LEVEL `out` handle only —
  // per-port row handles (PortRows) also render as `handle-source-right`
  // but are render-only, so target by data-handleid explicitly.
  function hoverSourceHandle(nodeId: string) {
    const nodeEl = screen.getByTestId(`canvas-node-${nodeId}`);
    const handle = nodeEl.querySelector<HTMLElement>(
      '[data-testid="handle-source-right"][data-handleid="out"]',
    );
    if (!handle) throw new Error(`source handle missing on ${nodeId}`);
    fireEvent.mouseEnter(handle);
  }

  function leaveSourceHandle(nodeId: string) {
    const nodeEl = screen.getByTestId(`canvas-node-${nodeId}`);
    const handle = nodeEl.querySelector<HTMLElement>(
      '[data-testid="handle-source-right"][data-handleid="out"]',
    );
    if (!handle) throw new Error(`source handle missing on ${nodeId}`);
    fireEvent.mouseLeave(handle);
  }

  it("Scenario 1: hovering the source handle for ≥200ms opens the popover", async () => {
    vi.useFakeTimers();
    try {
      renderCanvas(makeAllNodeTypesConfig());
      hoverSourceHandle("activity_1");
      // Before the 200ms debounce elapses the popover must not be shown.
      expect(
        screen.queryByTestId("hover-extend-popover"),
      ).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(210);
      });
      // Flush microtasks under fake timers so Mantine's state-driven
      // mount fires synchronously.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Scenario 2: leaving the handle closes the popover after a 200ms grace", async () => {
    vi.useFakeTimers();
    try {
      renderCanvas(makeAllNodeTypesConfig());
      hoverSourceHandle("activity_1");
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      leaveSourceHandle("activity_1");
      // Still open during the 200ms grace period.
      act(() => {
        vi.advanceTimersByTime(50);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      // Closes after the grace expires.
      act(() => {
        vi.advanceTimersByTime(250);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        screen.queryByTestId("hover-extend-popover"),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Scenario 3: clicking an activity row adds the node + connects it to the source", async () => {
    vi.useFakeTimers();
    try {
      // Single-activity-only fixture so we can predict the source id, and
      // — importantly — the new activity row's data-testid (which is
      // built from the activityType).
      const seed: ActivityNode = {
        id: "seed",
        type: "activity",
        label: "Seed",
        activityType: "data.transform",
        parameters: {},
        metadata: { position: { x: 100, y: 50 } },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "T", version: "1.0.0" },
        ctx: {},
        nodes: { [seed.id]: seed },
        edges: [],
        entryNodeId: seed.id,
      };
      const { onConfigChange } = renderCanvas(config);
      hoverSourceHandle("seed");
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      // Pick `file.prepare` — distinct from `data.transform` so the new
      // node is identifiable in the emitted config.
      const row = screen.getByTestId("hover-extend-activity-file.prepare");
      // Switch back to real timers so React's click + commit work.
      vi.useRealTimers();
      fireEvent.click(row);
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const lastCall =
        onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1];
      const next = lastCall[0] as GraphWorkflowConfig;
      // Exactly one new node was added.
      const newIds = Object.keys(next.nodes).filter((id) => id !== "seed");
      expect(newIds).toHaveLength(1);
      const newId = newIds[0];
      const newNode = next.nodes[newId];
      if (!newNode || newNode.type !== "activity") {
        throw new Error("expected new node to be an activity node");
      }
      expect(newNode.activityType).toBe("file.prepare");
      // Position lands to the right of the source (+280px) at same y.
      const newPos = (
        newNode.metadata as { position?: { x: number; y: number } }
      )?.position;
      expect(newPos).toEqual({ x: 380, y: 50 });
      // A single edge connects seed.out → newNode (type "normal" because
      // the source is an activity, not a switch).
      expect(next.edges).toHaveLength(1);
      expect(next.edges[0]).toMatchObject({
        source: "seed",
        target: newId,
        type: "normal",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("Scenario 4: picking a node auto-selects it and fits it into view", async () => {
    vi.useFakeTimers();
    try {
      const seed: ActivityNode = {
        id: "seed",
        type: "activity",
        label: "Seed",
        activityType: "data.transform",
        parameters: {},
        metadata: { position: { x: 100, y: 50 } },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "T", version: "1.0.0" },
        ctx: {},
        nodes: { [seed.id]: seed },
        edges: [],
        entryNodeId: seed.id,
      };
      const { onConfigChange, onSelectNode, rerenderWithConfig } =
        renderCanvas(config);
      hoverSourceHandle("seed");
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      const row = screen.getByTestId("hover-extend-activity-file.prepare");
      vi.useRealTimers();
      fireEvent.click(row);
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const next = onConfigChange.mock.calls[
        onConfigChange.mock.calls.length - 1
      ][0] as GraphWorkflowConfig;
      const newId = Object.keys(next.nodes).filter((id) => id !== "seed")[0];
      // Canvas raises onSelectNode with the new id so the right-rail
      // switches to it.
      await waitFor(() => {
        expect(onSelectNode).toHaveBeenCalledWith(newId);
      });
      // The host typically pushes the updated config straight back —
      // mirror that and confirm the canvas's US-014 auto-fit kicks in
      // for the new node.
      mockFitView.mockClear();
      rerenderWithConfig(next, newId);
      await flushAnimationFrame();
      expect(mockFitView).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: [{ id: newId }] }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * W-2 — extending UPSTREAM from `azureClassify.poll`'s `resultId` and
   * picking "Read Blob" used to pin `blob.read.base64 → resultId`. `resultId`
   * is typed with the root `Artifact` kind, which every output satisfies, so
   * the kind check proved nothing and the sole output won by default.
   *
   * The flow edge is still correct and still lands; only the data binding is
   * withheld.
   */
  it("draws the flow edge but does NOT pin when the port kind proves nothing", async () => {
    vi.useFakeTimers();
    try {
      const poll: ActivityNode = {
        id: "poll",
        type: "activity",
        label: "Poll Classify",
        activityType: "azureClassify.poll",
        parameters: {},
        metadata: { position: { x: 400, y: 50 } },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "T", version: "1.0.0" },
        ctx: {},
        nodes: { [poll.id]: poll },
        edges: [],
        entryNodeId: poll.id,
      };
      const { onConfigChange } = renderCanvas(config);

      const row = screen.getByTestId("port-row-poll-in-resultId");
      const handle = row.querySelector<HTMLElement>(
        '[data-testid="handle-target-left"]',
      );
      if (!handle) throw new Error("resultId input handle missing");
      fireEvent.mouseEnter(handle);
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();

      vi.useRealTimers();
      fireEvent.click(screen.getByTestId("hover-extend-activity-blob.read"));
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const next = onConfigChange.mock.calls[
        onConfigChange.mock.calls.length - 1
      ][0] as GraphWorkflowConfig;

      // The producer landed, wired into the consumer — execution order is
      // exactly what the gesture asked for.
      const newId = Object.keys(next.nodes).filter((id) => id !== "poll")[0];
      expect(next.nodes[newId]).toMatchObject({ activityType: "blob.read" });
      expect(next.edges).toHaveLength(1);
      expect(next.edges[0]).toMatchObject({ source: newId, target: "poll" });

      // ...and `resultId` was left alone rather than bound to `base64`.
      expect(
        next.nodes.poll.inputs?.find((b) => b.port === "resultId"),
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// US-041: multi-select bridge for the "Group selected" top-bar action
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-041-group-from-selection.md
//
// xyflow's `onSelectionChange` callback fires with the full list of
// selected nodes whenever the marquee or shift-click selection changes.
// The canvas exposes that list to the host via the new
// `onSelectionChangeMany` prop without dropping the single-select
// callback used by the right-rail.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-041: multi-select callback", () => {
  /** Resolves the `onSelectionChange` callback the canvas hands to ReactFlow. */
  function getOnSelectionChange(): (params: {
    nodes: Array<{ id: string }>;
    edges: Array<{ id: string }>;
  }) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onSelectionChange !== "function") {
      throw new Error("ReactFlow mock did not capture onSelectionChange");
    }
    return props.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;
  }

  it("fires onSelectionChangeMany with every selected node id (and still fires onSelectNode for the first)", () => {
    const onSelectionChangeMany = vi.fn();
    const config = makeAllNodeTypesConfig();
    const onConfigChange = vi.fn();
    const onSelectNode = vi.fn();
    render(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={onConfigChange}
          onSelectNode={onSelectNode}
          onSelectionChangeMany={onSelectionChangeMany}
        />
      </MantineProvider>,
    );
    act(() => {
      getOnSelectionChange()({
        nodes: [{ id: "activity_1" }, { id: "switch_1" }],
        edges: [],
      });
    });
    // Both ids surfaced upward via the new callback.
    expect(onSelectionChangeMany).toHaveBeenCalledTimes(1);
    expect(onSelectionChangeMany).toHaveBeenCalledWith([
      "activity_1",
      "switch_1",
    ]);
    // Single-select callback still fires with the first selected id so
    // the right-rail keeps working unchanged.
    expect(onSelectNode).toHaveBeenCalledWith("activity_1");
  });

  it("fires onSelectionChangeMany with an empty array when selection is cleared", () => {
    const onSelectionChangeMany = vi.fn();
    const onSelectNode = vi.fn();
    const config = makeAllNodeTypesConfig();
    render(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={"activity_1"}
          onConfigChange={vi.fn()}
          onSelectNode={onSelectNode}
          onSelectionChangeMany={onSelectionChangeMany}
        />
      </MantineProvider>,
    );
    act(() => {
      getOnSelectionChange()({ nodes: [], edges: [] });
    });
    expect(onSelectionChangeMany).toHaveBeenCalledWith([]);
    // First id is null when no nodes are selected.
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("omitting onSelectionChangeMany does not throw — backwards-callable canvas", () => {
    const config = makeAllNodeTypesConfig();
    render(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={vi.fn()}
          onSelectNode={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(() =>
      act(() => {
        getOnSelectionChange()({
          nodes: [{ id: "activity_1" }, { id: "switch_1" }],
          edges: [],
        });
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// US-043: simplified-view toggle collapses groups into chips
//   feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-043-simplified-view-toggle.md
//
// The canvas accepts a `simplifiedView` prop. When ON, it projects the
// config through `projectGroupedConfig` and renders one chip pseudo-node
// per group + every un-grouped node. Edges remap to chip ids; intra-group
// edges are hidden. Chip selection routes through `onGroupChipClick`.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-043: simplified-view projection", () => {
  /**
   * Fixture: g1 = [n1, n2], g2 = [n3], plus one un-grouped node n4 and
   * edges crossing into / out of the groups. Mirrors the story's
   * Scenario 2 example.
   */
  function makeGroupedFixture(): GraphWorkflowConfig {
    const n1: ActivityNode = {
      id: "n1",
      type: "activity",
      label: "n1",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const n2: ActivityNode = {
      id: "n2",
      type: "activity",
      label: "n2",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 100, y: 0 } },
    };
    const n3: ActivityNode = {
      id: "n3",
      type: "activity",
      label: "n3",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 200, y: 0 } },
    };
    const n4: ActivityNode = {
      id: "n4",
      type: "activity",
      label: "n4",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 400, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "grouped fixture", version: "1.0.0" },
      ctx: {},
      nodes: { n1, n2, n3, n4 },
      edges: [
        { id: "e_intra", source: "n1", target: "n2", type: "normal" },
        { id: "e_cross", source: "n2", target: "n3", type: "normal" },
        { id: "e_out", source: "n3", target: "n4", type: "normal" },
      ],
      entryNodeId: "n1",
      nodeGroups: {
        g1: { label: "Group 1", icon: "cleanup", nodeIds: ["n1", "n2"] },
        g2: { label: "Group 2", icon: "process", nodeIds: ["n3"] },
      },
    };
  }

  it("Scenario 2: simplified ON renders 2 chips + 1 normal node (n4)", () => {
    renderCanvas(makeGroupedFixture(), { simplifiedView: true });
    // Chips: deterministic ids `group-chip-${groupId}`.
    expect(screen.getByTestId("canvas-group-chip-g1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-group-chip-g2")).toBeInTheDocument();
    // Underlying grouped nodes are hidden.
    expect(screen.queryByTestId("canvas-node-n1")).toBeNull();
    expect(screen.queryByTestId("canvas-node-n2")).toBeNull();
    expect(screen.queryByTestId("canvas-node-n3")).toBeNull();
    // The un-grouped node still renders as a normal activity rectangle.
    expect(screen.getByTestId("canvas-node-n4")).toBeInTheDocument();
  });

  /**
   * 2026-08-03 — chips are draggable now. They could not be while a chip's
   * position was re-derived from its members' centroid on every projection:
   * a drop had nowhere to land. `nodeGroups[<id>].position` (W-1) is that
   * somewhere, and it is the field a simplified Auto-arrange already writes.
   */
  it("chips are draggable, and a drop lands on the group", () => {
    const config = makeGroupedFixture();
    const { onConfigChange } = renderCanvas(config, { simplifiedView: true });

    const chip = (
      latestReactFlowProps.current?.nodes as
        | Array<{ id: string; draggable?: boolean }>
        | undefined
    )?.find((n) => n.id === "group-chip-g1");
    expect(chip?.draggable).toBe(true);

    const handler = latestReactFlowProps.current?.onNodeDragStop as (
      e: unknown,
      n: unknown,
      nodes?: unknown,
    ) => void;
    act(() => {
      handler({}, { id: "group-chip-g1", position: { x: 900, y: 250 } });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.position).toEqual({ x: 900, y: 250 });
    // The members stayed exactly where the EXPANDED view has them — the two
    // arrangements are independent, which is the whole point of the field.
    for (const id of ["n1", "n2"]) {
      expect(next.nodes[id].metadata?.position).toEqual(
        config.nodes[id].metadata?.position,
      );
    }
    // ...and no member picked up a simplified position from the gesture either.
    expect(
      (next.nodes.n1.metadata as { simplifiedPosition?: unknown })
        .simplifiedPosition,
    ).toBeUndefined();
  });

  it("a chip dropped where it already sits writes nothing", () => {
    const config = makeGroupedFixture();
    const { onConfigChange, rerenderWithConfig } = renderCanvas(config, {
      simplifiedView: true,
    });
    const dropChip = (at: { x: number; y: number }) => {
      const handler = latestReactFlowProps.current?.onNodeDragStop as (
        e: unknown,
        n: unknown,
      ) => void;
      act(() => {
        handler({}, { id: "group-chip-g1", position: at });
      });
    };

    dropChip({ x: 640, y: 120 });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.position).toEqual({ x: 640, y: 120 });

    // Push the commit back the way the host does, then drop it on the spot it
    // already occupies: no write, so no empty undo step.
    rerenderWithConfig(next, null);
    onConfigChange.mockClear();
    dropChip({ x: 640, y: 120 });
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("Scenario 2: cross-group edge endpoints attach at the chip ids", () => {
    renderCanvas(makeGroupedFixture(), { simplifiedView: true });
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    const projected = (props.edges as Edge[]) ?? [];
    // Three original edges: e_intra is intra-group (dropped); e_cross
    // crosses g1 → g2 (both endpoints rewritten); e_out leaves g2 (source
    // rewritten, target stays).
    const byId = new Map(projected.map((e) => [e.id, e]));
    expect(byId.get("e_intra")).toBeUndefined();
    expect(byId.get("e_cross")).toMatchObject({
      source: "group-chip-g1",
      target: "group-chip-g2",
    });
    expect(byId.get("e_out")).toMatchObject({
      source: "group-chip-g2",
      target: "n4",
    });
  });

  it("Scenario 3: toggling OFF restores the original view (chips removed, node positions unchanged)", () => {
    const fixture = makeGroupedFixture();
    const { rerenderWithSimplified } = renderCanvas(fixture, {
      simplifiedView: true,
    });
    // Chips visible while ON.
    expect(screen.getByTestId("canvas-group-chip-g1")).toBeInTheDocument();
    // Toggle the simplified-view flag back to false.
    rerenderWithSimplified(false);
    // All original nodes return, no chips remain.
    expect(screen.queryByTestId("canvas-group-chip-g1")).toBeNull();
    expect(screen.queryByTestId("canvas-group-chip-g2")).toBeNull();
    expect(screen.getByTestId("canvas-node-n1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-n2")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-n3")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-n4")).toBeInTheDocument();
  });

  it("Scenario 4: chip renders the GROUP_ICONS svg + the label + node-count Badge", () => {
    renderCanvas(makeGroupedFixture(), { simplifiedView: true });
    // The chip carries the icon wrapper from the renderer's icon slot, which
    // hosts the tabler-icon svg sourced from the shared GROUP_ICONS map.
    const chip = screen.getByTestId("canvas-group-chip-g1");
    const iconWrapper = chip.querySelector("[data-testid='group-chip-icon']");
    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper?.querySelector("svg")).not.toBeNull();
    // Label + node-count come from the underlying NodeGroup.
    expect(chip).toHaveTextContent("Group 1");
    const badge = chip.querySelector("[data-testid='group-chip-node-count']");
    expect(badge?.textContent).toBe("2 nodes");
  });

  it("Scenario 5: selecting a chip fires onGroupChipClick with the groupId (not the chip's xyflow id)", () => {
    const onGroupChipClick = vi.fn();
    renderCanvas(makeGroupedFixture(), {
      simplifiedView: true,
      onGroupChipClick,
    });
    // xyflow's `onSelectionChange` carries the xyflow node id; the canvas
    // is responsible for translating it back to the underlying groupId
    // before firing onGroupChipClick.
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onSelectionChange !== "function") {
      throw new Error("ReactFlow mock did not capture onSelectionChange");
    }
    const handler = props.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;
    act(() => {
      handler({ nodes: [{ id: "group-chip-g1" }], edges: [] });
    });
    expect(onGroupChipClick).toHaveBeenCalledTimes(1);
    expect(onGroupChipClick).toHaveBeenCalledWith("g1");
  });

  it("registers `group-chip` in nodeTypes when simplifiedView is ON", () => {
    renderCanvas(makeGroupedFixture(), { simplifiedView: true });
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    const nodeTypes = props.nodeTypes as Record<string, unknown>;
    expect(nodeTypes).toHaveProperty("group-chip");
    expect(nodeTypes["group-chip"]).toBeDefined();
  });

  it("ignores `simplifiedView` when the config has no groups (identity projection)", () => {
    // Same fixture but with nodeGroups stripped — simplifiedView ON should
    // behave identically to OFF in that case.
    const fixture = makeGroupedFixture();
    const { nodeGroups: _unused, ...withoutGroups } = fixture;
    void _unused;
    renderCanvas(
      { ...withoutGroups, nodeGroups: undefined },
      { simplifiedView: true },
    );
    expect(screen.queryByTestId("canvas-group-chip-g1")).toBeNull();
    expect(screen.getByTestId("canvas-node-n1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-n4")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 8 (§6.4): connect-summary popover
//   After a NODE-LEVEL connect (drag node-to-node, hover-extend pick, §6.1
//   fall-throughs), a transient popover on the target narrates what
//   auto-wire did to its input bindings. Port-to-port drags (§6.1
//   both-port branch) get no popover — the pinned wire itself is the
//   feedback.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — connect summary (§6.4)", () => {
  /** Resolves the `onConnect` callback the canvas hands to ReactFlow. */
  function getOnConnect(): (connection: Connection) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnect !== "function") {
      throw new Error("ReactFlow mock did not capture onConnect");
    }
    return props.onConnect as (connection: Connection) => void;
  }

  /**
   * Two activity nodes, no edges, no bindings (mirrors the §6.1 drag-to-
   * bind fixture). `submit`'s `fileData` input has no producer or
   * binding, so it's a wireable ("unsatisfied") row the moment the
   * connect summary opens for it — enough to make the popover non-empty
   * without relying on the (test-harness-only) auto-wire pass the real
   * page runs in `handleCanvasConfigChange`.
   */
  function makeUnwiredPairConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Unwired pair", version: "1.0.0" },
      ctx: {},
      nodes: { prep, submit },
      edges: [],
      entryNodeId: "prep",
    };
  }

  it("opens the summary for the target after a node-level connect", async () => {
    const config = makeUnwiredPairConfig();
    renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    await flushAnimationFrame();
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
    expect(
      screen.getByTestId("connect-summary-row-fileData"),
    ).toBeInTheDocument();
  });

  it("opens after a hover-extend activity pick", async () => {
    vi.useFakeTimers();
    try {
      const seed: ActivityNode = {
        id: "seed",
        type: "activity",
        label: "Seed",
        activityType: "data.transform",
        parameters: {},
        metadata: { position: { x: 100, y: 50 } },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "T", version: "1.0.0" },
        ctx: {},
        nodes: { [seed.id]: seed },
        edges: [],
        entryNodeId: seed.id,
      };
      const { onConfigChange, rerenderWithConfig } = renderCanvas(config);
      const nodeEl = screen.getByTestId("canvas-node-seed");
      const handle = nodeEl.querySelector<HTMLElement>(
        '[data-testid="handle-source-right"][data-handleid="out"]',
      );
      if (!handle) throw new Error("source handle missing on seed");
      fireEvent.mouseEnter(handle);
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      const row = screen.getByTestId("hover-extend-activity-file.prepare");
      // Switch to real timers before the click — React's click + commit
      // needs them (mirrors Scenario 3/4 above).
      vi.useRealTimers();
      fireEvent.click(row);
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const next = onConfigChange.mock.calls[
        onConfigChange.mock.calls.length - 1
      ][0] as GraphWorkflowConfig;
      const newId = Object.keys(next.nodes).filter((id) => id !== "seed")[0];
      // The connect-summary effect re-runs once `config.nodes` actually
      // carries the new node — feed it back in, mirroring Scenario 4's
      // rerender-then-assert dance above. No fixed-delay race here: the
      // popover is driven by an effect keyed on `config.nodes`, not a
      // timer, so it resolves deterministically off this rerender.
      rerenderWithConfig(next, newId);
      await flushAnimationFrame();
      expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT open for a port-to-port drag", async () => {
    const config = makeUnwiredPairConfig();
    renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out-preparedData",
        targetHandle: "in-fileData",
      });
    });
    await flushAnimationFrame();
    expect(
      screen.queryByTestId("connect-summary-popover"),
    ).not.toBeInTheDocument();
  });

  it("Fix routes through onFixNodeInput prop", async () => {
    const config = makeUnwiredPairConfig();
    const onFixNodeInput = vi.fn();
    renderCanvas(config, { onFixNodeInput });
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    await flushAnimationFrame();
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("connect-summary-fix-fileData"));
    expect(onFixNodeInput).toHaveBeenCalledWith("submit", "fileData");
    expect(
      screen.queryByTestId("connect-summary-popover"),
    ).not.toBeInTheDocument();
  });

  it("auto-dismisses after 8 seconds", () => {
    vi.useFakeTimers();
    try {
      const config = makeUnwiredPairConfig();
      renderCanvas(config);
      act(() => {
        getOnConnect()({
          source: "prep",
          target: "submit",
          sourceHandle: "out",
          targetHandle: null,
        });
      });
      // Flush the scheduled state updates/effects under fake timers so the
      // pending-summary effect resolves and the popover commits before we
      // assert on it.
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(
        screen.queryByTestId("connect-summary-popover"),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// PORT_WIRING_DESIGN.md §9 — kind-aware extend popover. A typed output port
// (file.prepare.preparedData: Document) drives a filtered popover that ranks
// activities accepting `Document`; picking a matching entry pins the matched
// input port (azureOcr.submit.fileData: Document). Real catalog activities
// throughout so the kind lookups hit the actual registry.
// ---------------------------------------------------------------------------

describe("releaseAnchorFromEvent (§9)", () => {
  it("reads client coords from a mouse event", () => {
    expect(
      releaseAnchorFromEvent({
        clientX: 42,
        clientY: 24,
      } as unknown as MouseEvent),
    ).toEqual({ x: 42, y: 24 });
  });

  it("reads client coords from the first changed touch", () => {
    expect(
      releaseAnchorFromEvent({
        changedTouches: [{ clientX: 7, clientY: 8 }],
      } as unknown as TouchEvent),
    ).toEqual({ x: 7, y: 8 });
  });

  it("falls back to the origin for a touch event with no changed touches (e.g. touchcancel)", () => {
    expect(
      releaseAnchorFromEvent({
        changedTouches: [],
      } as unknown as TouchEvent),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("WorkflowEditorCanvas — kind-aware extend popover (§9)", () => {
  function makeExtendConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prep",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Extend", version: "1.0.0" },
      ctx: {},
      nodes: { [prep.id]: prep },
      edges: [],
      entryNodeId: prep.id,
    };
  }

  function getOnConnectEnd(): (
    event: unknown,
    connectionState: unknown,
  ) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnectEnd !== "function") {
      throw new Error("ReactFlow mock did not capture onConnectEnd");
    }
    return props.onConnectEnd as (
      event: unknown,
      connectionState: unknown,
    ) => void;
  }

  it("hovering a port-row output handle opens the popover filtered by that port's kind", () => {
    vi.useFakeTimers();
    try {
      renderCanvas(makeExtendConfig());
      const nodeEl = screen.getByTestId("canvas-node-prep");
      const outputHandle = nodeEl.querySelector<HTMLElement>(
        '[data-handleid="out-preparedData"]',
      );
      if (!outputHandle) throw new Error("preparedData output handle missing");
      fireEvent.mouseEnter(outputHandle);
      act(() => {
        vi.advanceTimersByTime(210);
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      // azureOcr.submit.fileData: Document accepts the Document producer.
      expect(
        screen.getByTestId("hover-extend-activity-azureOcr.submit"),
      ).toBeInTheDocument();
      // document.split.blobKey is MultiPageDocument — a plain Document is not
      // assignable to it, so it is filtered out.
      expect(
        screen.queryByTestId("hover-extend-activity-document.split"),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("releasing a port drag on empty canvas opens the filtered popover at the release point", () => {
    renderCanvas(makeExtendConfig());
    act(() => {
      getOnConnectEnd()(
        new MouseEvent("mouseup", { clientX: 250, clientY: 120 }),
        {
          isValid: false,
          fromNode: { id: "prep" },
          fromHandle: { id: "out-preparedData" },
          toNode: null,
          toHandle: null,
        },
      );
    });
    expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    // Filtered by Document (drag source kind).
    expect(
      screen.getByTestId("hover-extend-activity-azureOcr.submit"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("hover-extend-activity-document.split"),
    ).not.toBeInTheDocument();
    // Anchored at the release point.
    const anchor = screen.getByTestId("hover-extend-anchor");
    expect(anchor.style.left).toBe("250px");
    expect(anchor.style.top).toBe("120px");
  });

  it("picking a matching activity places the node, pins the matching input port, and adds the edge", () => {
    const { onConfigChange } = renderCanvas(makeExtendConfig());
    act(() => {
      getOnConnectEnd()(
        new MouseEvent("mouseup", { clientX: 250, clientY: 120 }),
        {
          isValid: false,
          fromNode: { id: "prep" },
          fromHandle: { id: "out-preparedData" },
          toNode: null,
          toHandle: null,
        },
      );
    });
    fireEvent.click(
      screen.getByTestId("hover-extend-activity-azureOcr.submit"),
    );
    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[
      onConfigChange.mock.calls.length - 1
    ][0] as GraphWorkflowConfig;
    const newId = Object.keys(next.nodes).find((id) => id !== "prep");
    if (!newId) throw new Error("new node not added");
    const newNode = next.nodes[newId] as ActivityNode;
    expect(newNode.activityType).toBe("azureOcr.submit");
    // The matched input port is pinned to the PRODUCER's ctx key (not the
    // self-named `fileData`) and locked.
    const fileDataBinding = (newNode.inputs ?? []).find(
      (b) => b.port === "fileData",
    );
    expect(fileDataBinding?.ctxKey).toBe("__auto.prep.preparedData");
    const locks =
      (newNode.metadata as { lockedInputPorts?: string[] } | undefined)
        ?.lockedInputPorts ?? [];
    expect(locks).toContain("fileData");
    // Exactly one edge added, prep → new node.
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ source: "prep", target: newId });
  });

  it("picking a non-matching activity falls back to plain extend + connect summary (no pin)", async () => {
    const { onConfigChange, rerenderWithConfig } = renderCanvas(
      makeExtendConfig(),
    );
    act(() => {
      getOnConnectEnd()(
        new MouseEvent("mouseup", { clientX: 250, clientY: 120 }),
        {
          isValid: false,
          fromNode: { id: "prep" },
          fromHandle: { id: "out-preparedData" },
          toNode: null,
          toHandle: null,
        },
      );
    });
    fireEvent.click(screen.getByTestId("hover-extend-show-all"));
    // document.classify accepts OcrResult/Segment — NOT Document — so no
    // input matches the source kind; the pick falls back to plain extend.
    fireEvent.click(
      screen.getByTestId("hover-extend-activity-document.classify"),
    );
    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[
      onConfigChange.mock.calls.length - 1
    ][0] as GraphWorkflowConfig;
    const newId = Object.keys(next.nodes).find((id) => id !== "prep");
    if (!newId) throw new Error("new node not added");
    const newNode = next.nodes[newId] as ActivityNode;
    expect(newNode.activityType).toBe("document.classify");
    // No pin: no locked input ports.
    const locks =
      (newNode.metadata as { lockedInputPorts?: string[] } | undefined)
        ?.lockedInputPorts ?? [];
    expect(locks).toHaveLength(0);
    // Connect summary still fires (§6.4 fallback narration).
    rerenderWithConfig(next, newId);
    await flushAnimationFrame();
    expect(screen.getByTestId("connect-summary-popover")).toBeInTheDocument();
  });

  it("extending from the node-level out handle stays unfiltered", () => {
    vi.useFakeTimers();
    try {
      renderCanvas(makeExtendConfig());
      const nodeEl = screen.getByTestId("canvas-node-prep");
      const nodeLevelHandle = nodeEl.querySelector<HTMLElement>(
        '[data-testid="handle-source-right"][data-handleid="out"]',
      );
      if (!nodeLevelHandle) throw new Error("node-level out handle missing");
      fireEvent.mouseEnter(nodeLevelHandle);
      act(() => {
        vi.advanceTimersByTime(210);
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      // Unfiltered: document.split (a MultiPageDocument consumer, hidden by a
      // Document filter) is present because no filter is applied.
      expect(
        screen.getByTestId("hover-extend-activity-document.split"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Keyboard-delete of a data wire (§6.3, bug 6b regression)
//   Selecting the blue auto-bound data wire and deleting it must disconnect
//   the consumer input binding and pin the port UNBOUND ("Disconnected by
//   you"), leaving `inputs: []` — never a ctxKey-less stub that would render
//   the wrong "Pinned" state. Exercises the real `handleDelete` the canvas
//   hands to ReactFlow's `onDelete`.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — data-wire delete (§6.3 / bug 6b)", () => {
  function getOnDelete(): (args: { nodes: FlowNode[]; edges: Edge[] }) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onDelete !== "function") {
      throw new Error("ReactFlow mock did not capture onDelete");
    }
    return props.onDelete as (args: {
      nodes: FlowNode[];
      edges: Edge[];
    }) => void;
  }

  function getCapturedEdges(): Edge[] {
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    return (props.edges as Edge[]) ?? [];
  }

  // Real auto-wire chain: file.prepare → azureOcr.submit (`fileData`:
  // Document), matching the "← Prepare · Auto" demo row.
  const autoWiredChain = (): GraphWorkflowConfig =>
    resolveBindings({
      schemaVersion: "1.0",
      metadata: { name: "t" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
        },
        submit: {
          id: "submit",
          type: "activity",
          label: "Submit",
          activityType: "azureOcr.submit",
        },
      },
      edges: [{ id: "e0", source: "prep", target: "submit", type: "normal" }],
    });

  it("disconnects the binding and pins the port unbound — no ctxKey-less stub", () => {
    const config = autoWiredChain();
    // Precondition: the port auto-bound before the delete.
    expect(config.nodes.submit.inputs).toEqual([
      { port: "fileData", ctxKey: "__auto.prep.preparedData" },
    ]);

    const { onConfigChange } = renderCanvas(config);
    const dataEdge = getCapturedEdges().find(
      (e) => (e.data as WorkflowEdgeData | undefined)?.wire?.variant === "data",
    );
    if (!dataEdge) throw new Error("data wire edge not projected");

    act(() => {
      getOnDelete()({ nodes: [], edges: [dataEdge] });
    });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.submit.inputs).toEqual([]);
    expect(
      (next.nodes.submit.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["fileData"]);
    // The disconnected config resolves to locked-unbound, not locked.
    expect(
      resolveInputPort(next, "submit", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked-unbound" });
  });
});

// ---------------------------------------------------------------------------
// Item 6X — hover-highlight emphasis
//   The page passes `highlightedNodeId` (a real producer being hovered in the
//   settings panel); the canvas stamps the `wb-node-highlight` class onto that
//   node's wrapper only, and clears it when the prop resets.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — item 6X: producer highlight emphasis", () => {
  function readNodeClass(id: string): string {
    const nodes =
      (latestReactFlowProps.current?.nodes as
        | Array<{ id: string; className?: string }>
        | undefined) ?? [];
    return nodes.find((n) => n.id === id)?.className ?? "";
  }

  it("applies wb-node-highlight to the highlighted node only, and clears it", () => {
    const config = makeAllNodeTypesConfig();
    const { rerender } = render(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={vi.fn()}
          onSelectNode={vi.fn()}
          highlightedNodeId="switch_1"
        />
      </MantineProvider>,
    );
    expect(readNodeClass("switch_1")).toContain("wb-node-highlight");
    // A non-highlighted node is untouched.
    expect(readNodeClass("activity_1")).not.toContain("wb-node-highlight");

    // Clearing the prop removes the emphasis.
    rerender(
      <MantineProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={vi.fn()}
          onSelectNode={vi.fn()}
          highlightedNodeId={null}
        />
      </MantineProvider>,
    );
    expect(readNodeClass("switch_1")).not.toContain("wb-node-highlight");
  });
});

// ---------------------------------------------------------------------------
// G-1 (2026-08-03) — an authored group renders as a container box.
//   With simplified view OFF, each group projects one `group-container` node
//   sized to the bounding box of its declared members, carrying the group's
//   label/colour/icon in a draggable header strip. This REPLACED the
//   per-member `wb-node-grouped` dashed outline and its `--wb-group-label`
//   hover chip, so the member cards themselves are now undecorated.
//
//   Membership is explicit: the box follows its declared members and never
//   captures a node that merely lands inside it.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — group container box", () => {
  interface ProjectedNode {
    id: string;
    type?: string;
    position: { x: number; y: number };
    className?: string;
    style?: Record<string, unknown>;
    draggable?: boolean;
    dragHandle?: string;
    selectable?: boolean;
    data: { width?: number; height?: number; label?: string; icon?: string };
  }

  function projectedNodes(): ProjectedNode[] {
    return (
      (latestReactFlowProps.current?.nodes as ProjectedNode[] | undefined) ?? []
    );
  }

  function readNode(id: string) {
    return projectedNodes().find((n) => n.id === id);
  }

  function makeGroupedConfig(): GraphWorkflowConfig {
    const a: ActivityNode = {
      id: "a",
      type: "activity",
      label: "Prepare",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const b: ActivityNode = {
      id: "b",
      type: "activity",
      label: "Submit",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    const c: ActivityNode = {
      id: "c",
      type: "activity",
      label: "Loose",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 600, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Grouped cue", version: "1.0.0" },
      ctx: {},
      nodes: { a, b, c },
      edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      entryNodeId: "a",
      nodeGroups: {
        g1: { label: "OCR pair", icon: "scan", nodeIds: ["a", "b"] },
      },
    };
  }

  /**
   * D-1 (2026-08-03) — the box used to be sized from worst-case ESTIMATES:
   * a flat 522px width for every activity card and a base height carrying a
   * 120px preview block most cards never render. Measured in the running
   * editor, that left up to ~210px of empty box to the right of the last card
   * and ~160px below a humanGate, which is why adjacent boxes overlapped.
   */
  it("D-1: sizes the box from MEASURED card sizes, not the estimates", async () => {
    // Both members really render 200x60 here. The estimate for an activity is
    // 522 wide, so an estimate-sized box would be ~322px wider than this one.
    mockGetNodes.mockReturnValue([
      { id: "a", measured: { width: 200, height: 60 } },
      { id: "b", measured: { width: 200, height: 60 } },
    ] as unknown as Array<{ id: string; width?: number }>);
    try {
      renderCanvas(makeGroupedConfig(), { simplifiedView: false });
      await flushAnimationFrame();
      const box = readNode("container-g1");
      // Members span x=0..500 (300 + 200 measured), plus 16px each side.
      expect(box?.data.width).toBe(500 + 16 * 2);
      // One row of 60px-tall cards, plus the header allowance and the bottom pad.
      expect(box?.data.height).toBe(60 + 34 + 16);
      expect(box?.position).toEqual({ x: -16, y: -34 });
    } finally {
      mockGetNodes.mockReturnValue([]);
    }
  });

  it("D-1: falls back to the estimates for a card xyflow has not measured", async () => {
    // No measurements at all — the first paint. The box must still enclose
    // every card rather than clipping it.
    renderCanvas(makeGroupedConfig(), { simplifiedView: false });
    await flushAnimationFrame();
    const box = readNode("container-g1");
    // `b` sits at x=300 and the activity estimate is 522 wide.
    expect(box?.data.width ?? 0).toBeGreaterThanOrEqual(300 + 522);
  });

  it("projects one box per group, wrapping its members' bounding box", async () => {
    renderCanvas(makeGroupedConfig(), { simplifiedView: false });
    await flushAnimationFrame();

    const box = readNode("container-g1");
    expect(box?.type).toBe("group-container");
    expect(box?.data.label).toBe("OCR pair");
    expect(box?.data.icon).toBe("scan");
    // Members sit at x=0 and x=300; the box starts left of both and is wide
    // enough to clear the right-hand card's own width.
    expect(box?.position.x).toBeLessThan(0);
    expect(box?.position.y).toBeLessThan(0);
    expect(box?.data.width ?? 0).toBeGreaterThan(300);
    expect(box?.data.height ?? 0).toBeGreaterThan(0);
    // …and it renders, header and all.
    expect(screen.getByTestId("group-container-g1")).toBeInTheDocument();
    expect(screen.getByTestId("group-container-header-g1")).toHaveTextContent(
      "OCR pair",
    );
  });

  it("leaves the member cards themselves undecorated", async () => {
    renderCanvas(makeGroupedConfig(), { simplifiedView: false });
    await flushAnimationFrame();

    // The retired treatment outlined every member and hid the group's name in
    // a hover-only chip. Nothing on the cards distinguishes them now.
    for (const id of ["a", "b", "c"]) {
      expect(readNode(id)?.className ?? "").not.toContain("wb-node-grouped");
      expect(readNode(id)?.style?.["--wb-group-label"]).toBeUndefined();
    }
  });

  it("makes the box draggable by its header only, and never selectable", async () => {
    renderCanvas(makeGroupedConfig(), { simplifiedView: false });
    await flushAnimationFrame();

    const box = readNode("container-g1");
    expect(box?.draggable).toBe(true);
    // R-1: xyflow starts the drag from the header strip and nowhere else.
    expect(box?.dragHandle).toBe(".wb-group-header");
    // The box is chrome for the group — letting it into the selection would
    // put a projection in front of Delete and the "N selected" actions.
    expect(box?.selectable).toBe(false);
  });

  it("opens the group's settings when the header is clicked", async () => {
    const onGroupChipClick = vi.fn();
    renderCanvas(makeGroupedConfig(), {
      simplifiedView: false,
      onGroupChipClick,
    });
    await flushAnimationFrame();

    screen.getByTestId("group-container-header-g1").click();
    expect(onGroupChipClick).toHaveBeenCalledWith("g1");
  });

  it("does not draw a box in simplified view (members collapse into the chip)", async () => {
    renderCanvas(makeGroupedConfig(), { simplifiedView: true });
    await flushAnimationFrame();

    const nodes = projectedNodes();
    expect(nodes.some((n) => n.type === "group-container")).toBe(false);
    expect(nodes.some((n) => n.id === "group-chip-g1")).toBe(true);
  });

  it("membership stays explicit — dropping an outsider inside the box joins nothing", async () => {
    const { onConfigChange } = renderCanvas(makeGroupedConfig(), {
      simplifiedView: false,
    });
    await flushAnimationFrame();
    const handlers = latestReactFlowProps.current as unknown as {
      onNodeDragStart: (e: unknown, n: unknown) => void;
      onNodeDragStop: (e: unknown, n: unknown, all?: unknown[]) => void;
    };

    // Park the ungrouped node `c` squarely between the two members — inside
    // the box's rectangle by any spatial reading of it.
    act(() => {
      handlers.onNodeDragStart({}, { id: "c", position: { x: 600, y: 0 } });
      handlers.onNodeDragStop({}, { id: "c", position: { x: 150, y: 0 } }, [
        { id: "c", position: { x: 150, y: 0 } },
      ]);
    });

    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.nodeIds).toEqual(["a", "b"]);
    expect(next.nodes.c.metadata?.position).toEqual({ x: 150, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// Auto-wire supersession toast: drawing a node-level execution edge that
// makes the resolver auto-bind the target's input to the source (a blue
// data wire that supersedes the grey sequence edge) shows a one-off toast
// naming the producer. Fires ONLY when a NEW auto data wire source→target
// actually appears — never on no-op connects or port-to-port pins.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — auto-wire supersession toast", () => {
  function getOnConnect(): (connection: Connection) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onConnect !== "function") {
      throw new Error("ReactFlow mock did not capture onConnect");
    }
    return props.onConnect as (connection: Connection) => void;
  }

  /**
   * `file.prepare` (output `preparedData`: Document) + `azureOcr.submit`
   * (input `fileData`: Document) with NO edge and NO bindings yet.
   * Connecting prep→submit makes the resolver auto-bind fileData to prep's
   * preparedData — a data wire that did not exist before the connect.
   */
  function makeAutoWirePairConfig(): GraphWorkflowConfig {
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "Auto-wire pair", version: "1.0.0" },
      ctx: {},
      nodes: { [prep.id]: prep, [submit.id]: submit },
      edges: [],
      entryNodeId: prep.id,
    };
  }

  it("fires once naming the source when the connect creates a NEW auto data wire", () => {
    const { onConfigChange } = renderCanvas(makeAutoWirePairConfig());
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    // Edge still added by the node-level path.
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Auto-wired — data now flows from "Prepare File".',
      }),
    );
  });

  it("does NOT fire when the connect creates no new auto-binding", () => {
    // Two `data.transform` nodes: data.transform declares no input ports,
    // so a prep→submit-style auto-bind can't happen. The edge is added as
    // a plain sequence edge; no data wire → no toast.
    const a: ActivityNode = {
      id: "a1",
      type: "activity",
      label: "A",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 0, y: 0 } },
    };
    const b: ActivityNode = {
      id: "b1",
      type: "activity",
      label: "B",
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x: 300, y: 0 } },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "No auto-bind", version: "1.0.0" },
      ctx: {},
      nodes: { [a.id]: a, [b.id]: b },
      edges: [],
      entryNodeId: a.id,
    };
    const { onConfigChange } = renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "a1",
        target: "b1",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does NOT fire when the target input is already bound to the source", () => {
    // prep→submit already wired (edge + fileData bound). A duplicate
    // connect is dropped by the dedup guard, but even if it weren't, no
    // NEW wire appears, so no toast.
    const prep: ActivityNode = {
      id: "prep",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      parameters: {},
      outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 0, y: 0 } },
    };
    const submit: ActivityNode = {
      id: "submit",
      type: "activity",
      label: "Submit OCR",
      activityType: "azureOcr.submit",
      parameters: {},
      inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }],
      metadata: { position: { x: 300, y: 0 } },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Already bound", version: "1.0.0" },
      ctx: {},
      nodes: { [prep.id]: prep, [submit.id]: submit },
      edges: [{ id: "e", source: "prep", target: "submit", type: "normal" }],
      entryNodeId: prep.id,
    };
    renderCanvas(config);
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out",
        targetHandle: null,
      });
    });
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does NOT fire on the port-to-port pin path (early return before node-level)", () => {
    renderCanvas(makeAutoWirePairConfig());
    act(() => {
      getOnConnect()({
        source: "prep",
        target: "submit",
        sourceHandle: "out-preparedData",
        targetHandle: "in-fileData",
      });
    });
    expect(notifications.show).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G-002/G-003 — every delete path prunes orphaned ctx declarations and then
// SAYS SO, via a non-blocking toast carrying an Undo action. There is no
// dialog and no cancel path any more: since G-003 landed, a delete is
// reversible, so interrupting the author to confirm one is pure friction.
// Covers the two canvas entry points; the settings-panel trash button and the
// end-to-end undo are covered in WorkflowEditorV2Page.test.tsx.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — orphaned ctx keys on delete (G-002)", () => {
  function producerConsumerConfig(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "orphan" },
      ctx: { preparedFile: { type: "object" } },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare File",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
        },
        ocr: {
          id: "ocr",
          type: "activity",
          label: "Submit OCR",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "preparedFile" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [{ id: "e1", source: "prep", target: "ocr", type: "normal" }],
      entryNodeId: "prep",
    } as GraphWorkflowConfig;
  }

  /** Two independent producer→consumer pairs, for the multi-select case. */
  function twoPairsConfig(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "orphan-2" },
      ctx: { k1: { type: "object" }, k2: { type: "object" } },
      nodes: {
        prepA: {
          id: "prepA",
          type: "activity",
          label: "Prepare A",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "k1" }],
        },
        prepB: {
          id: "prepB",
          type: "activity",
          label: "Prepare B",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "k2" }],
        },
        ocrA: {
          id: "ocrA",
          type: "activity",
          label: "OCR A",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "k1" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
        ocrB: {
          id: "ocrB",
          type: "activity",
          label: "OCR B",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "k2" }],
          metadata: { lockedInputPorts: ["fileData"] },
        },
      },
      edges: [],
      entryNodeId: "prepA",
    } as GraphWorkflowConfig;
  }

  function getUnifiedOnDelete(): (args: {
    nodes: FlowNode[];
    edges: Edge[];
  }) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onDelete !== "function") {
      throw new Error("ReactFlow mock did not capture onDelete");
    }
    return props.onDelete as (args: {
      nodes: FlowNode[];
      edges: Edge[];
    }) => void;
  }

  /** Every `notifications.show` call whose id is the orphaned-delete toast. */
  function orphanToastCalls(): Record<string, unknown>[] {
    const showMock = notifications.show as unknown as ReturnType<typeof vi.fn>;
    return showMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((arg) => arg?.id === ORPHANED_DELETE_TOAST_ID);
  }

  /** Renders the toast body so its copy — and its Undo link — are reachable. */
  function renderToastBody(toast: Record<string, unknown>) {
    return render(
      <MantineProvider>{toast.message as React.ReactNode}</MantineProvider>,
    );
  }

  const flowNode = (id: string): FlowNode =>
    ({ id, data: {}, position: { x: 0, y: 0 } }) as unknown as FlowNode;

  function openContextMenuOn(nodeId: string) {
    const props = latestReactFlowProps.current;
    const handler = props?.onNodeContextMenu as (
      event: React.MouseEvent,
      node: FlowNode,
    ) => void;
    act(() => {
      handler(
        {
          preventDefault: vi.fn(),
          clientX: 10,
          clientY: 10,
        } as unknown as React.MouseEvent,
        flowNode(nodeId),
      );
    });
  }

  beforeEach(() => {
    vi.mocked(notifications.show).mockClear();
    vi.mocked(notifications.hide).mockClear();
  });

  it("never vetoes an ordinary node delete", async () => {
    // `onBeforeDelete` is the one hook that can silently swallow a delete, so
    // what matters is not whether it is registered but what it does. G-003
    // retired the old confirm, so a node delete must pass straight through;
    // since item 6 the hook exists only to divert group CHIPS to their own
    // confirm (covered in the group-chip describe).
    renderCanvas(producerConsumerConfig());
    const onBeforeDelete = latestReactFlowProps.current?.onBeforeDelete as
      | ((args: {
          nodes: Array<{ id: string }>;
          edges: Edge[];
        }) => Promise<unknown>)
      | undefined;
    if (!onBeforeDelete) throw new Error("onBeforeDelete was not registered");
    let verdict: unknown;
    await act(async () => {
      verdict = await onBeforeDelete({
        nodes: [{ id: "producer" }],
        edges: [],
      });
    });
    expect(verdict).toBe(true);
  });

  // -- context-menu path ----------------------------------------------------

  it("context menu: deletes with no dialog, prunes, and toasts what broke", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    const { onConfigChange } = renderCanvas(producerConsumerConfig());
    openContextMenuOn("prep");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-delete-node"));
    await waitFor(() => expect(onConfigChange).toHaveBeenCalled());

    expect(confirmSpy).not.toHaveBeenCalled();
    const calls = onConfigChange.mock.calls;
    const next = calls[calls.length - 1][0] as GraphWorkflowConfig;
    expect(next.nodes).not.toHaveProperty("prep");
    expect(next.ctx.preparedFile).toBeUndefined();

    const toasts = orphanToastCalls();
    expect(toasts).toHaveLength(1);
    const body = renderToastBody(toasts[0]);
    expect(body.container.textContent).toContain(
      'Deleted "Prepare File" — 1 variable lost its source; 1 step reads it.',
    );
  });

  it("context menu: stays silent when the deleted node orphans nothing", async () => {
    const { onConfigChange } = renderCanvas(producerConsumerConfig());
    openContextMenuOn("ocr");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-delete-node"));
    await waitFor(() => expect(onConfigChange).toHaveBeenCalled());
    expect(orphanToastCalls()).toHaveLength(0);
  });

  it("the toast's Undo action asks the host to undo, then dismisses itself", async () => {
    const { onUndo } = renderCanvas(producerConsumerConfig());
    openContextMenuOn("prep");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-delete-node"));
    const body = renderToastBody(orphanToastCalls()[0]);
    fireEvent.click(body.getByTestId("orphaned-delete-undo"));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(notifications.hide).toHaveBeenCalledWith(ORPHANED_DELETE_TOAST_ID);
  });

  // -- keyboard / multi-select path -----------------------------------------

  it("keyboard: onDelete prunes and toasts, with no dialog in the way", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    const { onConfigChange } = renderCanvas(producerConsumerConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({ nodes: [flowNode("prep")], edges: [] });
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    const calls = onConfigChange.mock.calls;
    const next = calls[calls.length - 1][0] as GraphWorkflowConfig;
    expect(next.nodes).not.toHaveProperty("prep");
    expect(next.ctx.preparedFile).toBeUndefined();
    expect(orphanToastCalls()).toHaveLength(1);
  });

  it("keyboard: a multi-node delete shows ONE toast, not one per node", async () => {
    renderCanvas(twoPairsConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({
        nodes: [flowNode("prepA"), flowNode("prepB")],
        edges: [],
      });
    });
    const toasts = orphanToastCalls();
    expect(toasts).toHaveLength(1);
    const body = renderToastBody(toasts[0]);
    expect(body.container.textContent).toContain(
      "Deleted 2 steps — 2 variables lost their source; 2 steps read them.",
    );
  });

  it("keyboard: a multi-node delete prunes every orphaned key in one pass", async () => {
    const { onConfigChange } = renderCanvas(twoPairsConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({
        nodes: [flowNode("prepA"), flowNode("prepB")],
        edges: [],
      });
    });
    const calls = onConfigChange.mock.calls;
    const next = calls[calls.length - 1][0] as GraphWorkflowConfig;
    expect(next.ctx.k1).toBeUndefined();
    expect(next.ctx.k2).toBeUndefined();
  });

  it("keyboard: deleting a producer together with its only reader says nothing", async () => {
    // The fixture's entry node is `prep`, and G-039 now reports the promotion
    // that follows deleting it. Keep a surviving `start` node as the entry so
    // this test stays about ORPHANS alone — the promotion notice has its own
    // coverage in delete-orphan-warning.test.ts.
    const cfg = producerConsumerConfig();
    cfg.nodes.start = {
      id: "start",
      type: "activity",
      label: "Start",
      activityType: "file.prepare",
    } as GraphWorkflowConfig["nodes"][string];
    cfg.entryNodeId = "start";
    renderCanvas(cfg);
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({
        nodes: [flowNode("prep"), flowNode("ocr")],
        edges: [],
      });
    });
    expect(orphanToastCalls()).toHaveLength(0);
  });

  it("keyboard: deleting the ENTRY step reports the promotion (G-039)", async () => {
    renderCanvas(producerConsumerConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({
        nodes: [flowNode("prep"), flowNode("ocr")],
        edges: [],
      });
    });
    const calls = orphanToastCalls();
    expect(calls).toHaveLength(1);
  });

  it("keyboard: a mixed node+edge gesture still sees the real readers", async () => {
    // `handleDelete` removes nodes first and strips edges in a LATER pass, so
    // `removeNodesFromConfig` receives the un-stripped config. Consumer
    // detection reads port bindings and conditions — never edges — so it is
    // unaffected either way; this pins both facts.
    const { onConfigChange } = renderCanvas(producerConsumerConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({
        nodes: [flowNode("prep")],
        edges: [{ id: "e1", source: "prep", target: "ocr" } as unknown as Edge],
      });
    });
    const calls = onConfigChange.mock.calls;
    const next = calls[calls.length - 1][0] as GraphWorkflowConfig;
    expect(next.nodes).not.toHaveProperty("prep");
    expect(next.ctx.preparedFile).toBeUndefined();
    expect(next.edges).toHaveLength(0);
    expect(orphanToastCalls()).toHaveLength(1);
  });

  it("keyboard: an edges-only gesture never toasts", async () => {
    renderCanvas(producerConsumerConfig());
    await flushAnimationFrame();
    act(() => {
      getUnifiedOnDelete()({ nodes: [], edges: [] });
    });
    expect(orphanToastCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G-060 — a multi-selection drag persists EVERY node it moved
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — G-060 multi-node drag", () => {
  /** Invoke xyflow's `onNodeDragStop` the way the real library does. */
  function dragStop(
    node: { id: string; position: { x: number; y: number } },
    all?: Array<{ id: string; position: { x: number; y: number } }>,
  ) {
    const handler = latestReactFlowProps.current?.onNodeDragStop as (
      e: unknown,
      n: unknown,
      nodes?: unknown,
    ) => void;
    act(() => {
      handler({} as MouseEvent, node, all);
    });
  }

  // W-1 — a drag writes to whichever arrangement the author is looking at.
  it("writes `simplifiedPosition` when dragging in the simplified view", () => {
    const config = makeAllNodeTypesConfig();
    const { onConfigChange } = renderCanvas(config, { simplifiedView: true });

    dragStop({ id: "activity_1", position: { x: 640, y: 480 } });

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(
      (next.nodes.activity_1.metadata as { simplifiedPosition?: unknown })
        .simplifiedPosition,
    ).toEqual({ x: 640, y: 480 });
    // ...and the expanded arrangement is exactly as it was.
    expect(next.nodes.activity_1.metadata?.position).toEqual(
      config.nodes.activity_1.metadata?.position,
    );
  });

  it("persists every node in the dragged set, not just the one under the cursor", () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());

    dragStop({ id: "activity_1", position: { x: 100, y: 100 } }, [
      { id: "activity_1", position: { x: 100, y: 100 } },
      { id: "switch_1", position: { x: 200, y: 250 } },
    ]);

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.activity_1.metadata?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(next.nodes.switch_1.metadata?.position).toEqual({ x: 200, y: 250 });
  });

  it("still handles a single-node drag (no third argument)", () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());

    dragStop({ id: "activity_1", position: { x: 42, y: 7 } });

    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.activity_1.metadata?.position).toEqual({ x: 42, y: 7 });
  });

  it("writes nothing when the gesture moved nothing", () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());

    // `activity_1` starts at 0,0 — dropping it back there is a no-op.
    dragStop({ id: "activity_1", position: { x: 0, y: 0 } }, [
      { id: "activity_1", position: { x: 0, y: 0 } },
    ]);

    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("ignores ids in the dragged set that are not graph nodes", () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());

    dragStop({ id: "activity_1", position: { x: 5, y: 5 } }, [
      { id: "activity_1", position: { x: 5, y: 5 } },
      { id: "group-chip-abc", position: { x: 900, y: 900 } },
    ]);

    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.activity_1.metadata?.position).toEqual({ x: 5, y: 5 });
    expect(next.nodes["group-chip-abc"]).toBeUndefined();
  });
});

/**
 * Item 6 (UX walkthrough, 2026-08-02) — deleting a collapsed group
 * chip.
 *
 * G-091 previously refused this gesture and pointed at the right-hand panel,
 * because "delete the group" and "delete its members" are different acts and
 * guessing between them loses work. Collapsed, though, the chip IS the object
 * — there is nothing else on screen the gesture could mean — so it now deletes
 * the group as a unit behind a confirm that names the step count.
 *
 * The confirm runs in `onBeforeDelete`, not `onDelete`: xyflow drops elements
 * from its store before `onDelete` fires, so confirming there would show the
 * chip already gone while still asking whether to remove it.
 */
describe("WorkflowEditorCanvas — item 6 deleting a group chip as a unit", () => {
  /** Local copies — the shared helpers are scoped to their own describe. */
  function unifiedOnDelete(): (args: {
    nodes: Array<{ id: string }>;
    edges: Edge[];
  }) => void {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onDelete !== "function") {
      throw new Error("ReactFlow mock did not capture onDelete");
    }
    return props.onDelete as (args: {
      nodes: Array<{ id: string }>;
      edges: Edge[];
    }) => void;
  }

  function beforeDelete(): (args: {
    nodes: Array<{ id: string }>;
    edges: Edge[];
  }) => Promise<boolean | { nodes: Array<{ id: string }>; edges: Edge[] }> {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onBeforeDelete !== "function") {
      throw new Error("ReactFlow mock did not capture onBeforeDelete");
    }
    return props.onBeforeDelete as (args: {
      nodes: Array<{ id: string }>;
      edges: Edge[];
    }) => Promise<boolean | { nodes: Array<{ id: string }>; edges: Edge[] }>;
  }

  /** The confirm-modal payload the canvas opened, for asserting + driving. */
  function lastConfirm(): {
    title: string;
    onConfirm: () => void;
  } {
    const calls = vi.mocked(modals.openConfirmModal).mock.calls;
    if (calls.length === 0) throw new Error("no confirm modal was opened");
    const payload = calls[calls.length - 1][0] as {
      title: string;
      onConfirm: () => void;
    };
    return payload;
  }

  function chipConfig(memberIds: string[] = ["a"]): GraphWorkflowConfig {
    const nodes: GraphWorkflowConfig["nodes"] = {};
    for (const id of memberIds) {
      nodes[id] = {
        id,
        type: "activity",
        label: id.toUpperCase(),
        activityType: "file.prepare",
      } as GraphWorkflowConfig["nodes"][string];
    }
    return {
      schemaVersion: "1.0",
      metadata: { name: "chips" },
      ctx: {},
      entryNodeId: memberIds[0],
      nodes,
      edges: [],
      nodeGroups: { g1: { label: "Stage one", nodeIds: memberIds } },
    } as GraphWorkflowConfig;
  }

  it("vetoes the store removal and asks first, naming the step count", async () => {
    const { onConfigChange } = renderCanvas(chipConfig(["a", "b"]), {
      simplifiedView: true,
    });
    let verdict: unknown;
    await act(async () => {
      verdict = await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }],
        edges: [],
      });
    });
    // Vetoed — xyflow must not remove the chip while the question is open.
    expect(verdict).toBe(false);
    expect(lastConfirm().title).toBe('Delete "Stage one" and its 2 steps?');
    // Nothing written until the author answers.
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("removes the group AND its steps on confirm", async () => {
    const { onConfigChange } = renderCanvas(chipConfig(["a", "b"]), {
      simplifiedView: true,
    });
    await act(async () => {
      await beforeDelete()({ nodes: [{ id: "group-chip-g1" }], edges: [] });
    });
    act(() => {
      lastConfirm().onConfirm();
    });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.a).toBeUndefined();
    expect(next.nodes.b).toBeUndefined();
    // Removing every member prunes the now-empty group with them.
    expect(next.nodeGroups?.g1).toBeUndefined();
  });

  it("writes nothing when the author cancels (never calls onConfirm)", async () => {
    const { onConfigChange } = renderCanvas(chipConfig(["a", "b"]), {
      simplifiedView: true,
    });
    await act(async () => {
      await beforeDelete()({ nodes: [{ id: "group-chip-g1" }], edges: [] });
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("uses the singular for a one-step group", async () => {
    renderCanvas(chipConfig(["a"]), { simplifiedView: true });
    await act(async () => {
      await beforeDelete()({ nodes: [{ id: "group-chip-g1" }], edges: [] });
    });
    expect(lastConfirm().title).toBe('Delete "Stage one" and its 1 step?');
  });

  it("lets real nodes through in a mixed chip + node gesture", async () => {
    renderCanvas(chipConfig(["a", "b"]), { simplifiedView: true });
    let verdict: unknown;
    await act(async () => {
      verdict = await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }, { id: "a" }],
        edges: [],
      });
    });
    // The chip is filtered out (it has its own confirm); the real node
    // proceeds through xyflow's normal delete path.
    expect(verdict).toEqual({ nodes: [{ id: "a" }], edges: [] });
  });

  it("passes an ordinary node delete straight through", async () => {
    renderCanvas(chipConfig(["a"]), { simplifiedView: false });
    let verdict: unknown;
    await act(async () => {
      verdict = await beforeDelete()({ nodes: [{ id: "a" }], edges: [] });
    });
    expect(verdict).toBe(true);
  });

  /**
   * B-1 — the chip's own wires. xyflow sweeps every edge incident to a deleted
   * node into `onBeforeDelete`'s `edges`, so a vetoed chip arrives here WITH
   * its connections, and returning them untouched cut them before the author
   * had answered — and for good, if the answer was Cancel.
   */
  function chipConfigWithWire(): GraphWorkflowConfig {
    const base = chipConfig(["a", "b"]);
    return {
      ...base,
      nodes: {
        ...base.nodes,
        z: {
          id: "z",
          type: "activity",
          label: "Z",
          activityType: "file.prepare",
        } as GraphWorkflowConfig["nodes"][string],
      },
      entryNodeId: "z",
      edges: [{ id: "e_z_a", source: "z", target: "a", type: "normal" }],
    };
  }

  it("holds the chip's wires back while the confirm is open (B-1)", async () => {
    const { onConfigChange } = renderCanvas(chipConfigWithWire(), {
      simplifiedView: true,
    });
    let verdict: unknown;
    await act(async () => {
      verdict = await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }],
        edges: [{ id: "e_z_a", source: "z", target: "group-chip-g1" } as Edge],
      });
    });
    // Whole gesture vetoed: nothing leaves xyflow's store, so nothing reaches
    // `handleDelete` and no edge is cut behind the open question.
    expect(verdict).toBe(false);
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("still lets an unrelated edge through in the same gesture (B-1)", async () => {
    renderCanvas(chipConfigWithWire(), { simplifiedView: true });
    let verdict: unknown;
    const farEdge = { id: "e_far", source: "z", target: "z2" } as Edge;
    await act(async () => {
      verdict = await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }],
        edges: [
          farEdge,
          { id: "e_z_a", source: "z", target: "group-chip-g1" } as Edge,
        ],
      });
    });
    // Only the chip-incident edge is withheld — an edge the author selected
    // between two survivors is not the chip's business.
    expect(verdict).toEqual({ nodes: [], edges: [farEdge] });
  });

  it("cancelling leaves config.edges byte-identical (B-1)", async () => {
    const before = chipConfigWithWire();
    const { onConfigChange } = renderCanvas(before, { simplifiedView: true });
    await act(async () => {
      await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }],
        edges: [{ id: "e_z_a", source: "z", target: "group-chip-g1" } as Edge],
      });
    });
    // Cancel = the confirm's `onConfirm` is never invoked. Nothing was
    // written, so the wire the chip carried is still there.
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(before.edges).toEqual([
      { id: "e_z_a", source: "z", target: "a", type: "normal" },
    ]);
  });

  it("confirming removes steps AND their wires in ONE write (one undo) (B-1)", async () => {
    const { onConfigChange } = renderCanvas(chipConfigWithWire(), {
      simplifiedView: true,
    });
    await act(async () => {
      await beforeDelete()({
        nodes: [{ id: "group-chip-g1" }],
        edges: [{ id: "e_z_a", source: "z", target: "group-chip-g1" } as Edge],
      });
    });
    act(() => {
      lastConfirm().onConfirm();
    });
    // One config change = one history entry = one Ctrl+Z to get it all back.
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.a).toBeUndefined();
    expect(next.nodes.b).toBeUndefined();
    expect(next.nodes.z).toBeDefined();
    // The member's wire goes as collateral of the member removal, in the same
    // write — `removeNodesFromConfig` drops every edge touching a removed node.
    expect(next.edges).toEqual([]);
  });

  it("ignores a chip id that still reaches onDelete", () => {
    // Defensive: onBeforeDelete filters chips out, so one arriving here would
    // be a bug. It must not fall through to removeNodesFromConfig, where it
    // would match nothing and emit a pointless config write.
    const { onConfigChange } = renderCanvas(chipConfig(["a"]), {
      simplifiedView: true,
    });
    act(() => {
      unifiedOnDelete()({ nodes: [{ id: "group-chip-g1" }], edges: [] });
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});

/**
 * R-1 (2026-08-03) — drag the header to move the group, drag a member to move
 * the member.
 *
 * These cases REPLACE the 2026-08-02 ones, which asserted the opposite: that a
 * drag of any member carried its siblings. That rule existed only because an
 * authored group had no surface of its own to grab; G-1's container box gives
 * it one, so cohesive movement became a target you aim at and rearranging a
 * node inside its own group became possible.
 *
 * Selection is still not cohesive — clicking a member selects and edits
 * exactly that member — so these tests pin the drag behaviour specifically.
 */
describe("WorkflowEditorCanvas — R-1 header drag vs member drag", () => {
  function dragHandlers(): {
    start: (e: unknown, node: { id: string; position: XY }) => void;
    move: (e: unknown, node: { id: string; position: XY }) => void;
    stop: (
      e: unknown,
      node: { id: string; position: XY },
      dragged?: Array<{ id: string; position: XY }>,
    ) => void;
  } {
    const props = latestReactFlowProps.current;
    if (!props) throw new Error("ReactFlow mock did not capture props");
    for (const key of ["onNodeDragStart", "onNodeDrag", "onNodeDragStop"]) {
      if (typeof props[key] !== "function") {
        throw new Error(`ReactFlow mock did not capture ${key}`);
      }
    }
    return {
      start: props.onNodeDragStart as never,
      move: props.onNodeDrag as never,
      stop: props.onNodeDragStop as never,
    };
  }

  type XY = { x: number; y: number };

  function groupedPositions(
    nodeGroups: GraphWorkflowConfig["nodeGroups"],
  ): GraphWorkflowConfig {
    const at: Record<string, XY> = {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      c: { x: 400, y: 300 },
    };
    const nodes: GraphWorkflowConfig["nodes"] = {};
    for (const [id, position] of Object.entries(at)) {
      nodes[id] = {
        id,
        type: "activity",
        label: id.toUpperCase(),
        activityType: "file.prepare",
        metadata: { position },
      } as GraphWorkflowConfig["nodes"][string];
    }
    return {
      schemaVersion: "1.0",
      metadata: { name: "grp" },
      ctx: {},
      entryNodeId: "a",
      nodes,
      edges: [],
      nodeGroups,
    } as GraphWorkflowConfig;
  }

  /** The projected container box for a group, as xyflow sees it. */
  function boxFor(groupId: string): {
    id: string;
    position: XY;
    data: { width: number; height: number };
  } {
    const nodes = (latestReactFlowProps.current?.nodes ?? []) as Array<{
      id: string;
      position: XY;
      data: { width: number; height: number };
    }>;
    const box = nodes.find((n) => n.id === `container-${groupId}`);
    if (!box) throw new Error(`no container box projected for ${groupId}`);
    return box;
  }

  it("carries every member when the box is dragged by its header", async () => {
    const { onConfigChange } = renderCanvas(
      groupedPositions({ g1: { label: "Stage one", nodeIds: ["a", "b"] } }),
    );
    await flushAnimationFrame();
    const { start, stop } = dragHandlers();
    const box = boxFor("g1");
    act(() => {
      start({}, { id: box.id, position: box.position });
      stop(
        {},
        {
          id: box.id,
          position: { x: box.position.x + 50, y: box.position.y + 20 },
        },
        [
          {
            id: box.id,
            position: { x: box.position.x + 50, y: box.position.y + 20 },
          },
        ],
      );
    });
    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.a.metadata?.position).toEqual({ x: 50, y: 20 });
    // b moved by the same delta, keeping its 100px offset from a.
    expect(next.nodes.b.metadata?.position).toEqual({ x: 150, y: 20 });
    // c is not in the group and must not have moved.
    expect(next.nodes.c.metadata?.position).toEqual({ x: 400, y: 300 });
  });

  it("moves ONLY the member when a member is dragged", async () => {
    // The reversal of 2026-08-02: rearranging one node inside its own group is
    // exactly what the old cohesive-member rule made impossible.
    const { onConfigChange } = renderCanvas(
      groupedPositions({ g1: { label: "Stage one", nodeIds: ["a", "b"] } }),
    );
    await flushAnimationFrame();
    const { start, stop } = dragHandlers();
    act(() => {
      start({}, { id: "a", position: { x: 0, y: 0 } });
      stop({}, { id: "a", position: { x: 50, y: 20 } }, [
        { id: "a", position: { x: 50, y: 20 } },
      ]);
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.a.metadata?.position).toEqual({ x: 50, y: 20 });
    expect(next.nodes.b.metadata?.position).toEqual({ x: 100, y: 0 });
    expect(next.nodes.c.metadata?.position).toEqual({ x: 400, y: 300 });
  });

  it("re-fits the box around a member that was dragged out of it", async () => {
    renderCanvas(
      groupedPositions({ g1: { label: "Stage one", nodeIds: ["a", "b"] } }),
    );
    await flushAnimationFrame();
    const before = boxFor("g1");
    const { start, move } = dragHandlers();
    act(() => {
      start({}, { id: "b", position: { x: 100, y: 0 } });
      move({}, { id: "b", position: { x: 600, y: 200 } });
    });
    const after = boxFor("g1");
    // The box grew to keep enclosing its declared members — it did not follow
    // the node, and it did not stay where the members used to be.
    expect(after.position).toEqual(before.position);
    expect(after.data.width).toBeGreaterThan(before.data.width);
    expect(after.data.height).toBeGreaterThan(before.data.height);
  });

  it("leaves an ungrouped drag alone", async () => {
    const { onConfigChange } = renderCanvas(
      groupedPositions({ g1: { label: "Stage one", nodeIds: ["a", "b"] } }),
    );
    await flushAnimationFrame();
    const { start, stop } = dragHandlers();
    act(() => {
      start({}, { id: "c", position: { x: 400, y: 300 } });
      stop({}, { id: "c", position: { x: 410, y: 310 } }, [
        { id: "c", position: { x: 410, y: 310 } },
      ]);
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.c.metadata?.position).toEqual({ x: 410, y: 310 });
    expect(next.nodes.a.metadata?.position).toEqual({ x: 0, y: 0 });
    expect(next.nodes.b.metadata?.position).toEqual({ x: 100, y: 0 });
  });

  it("does not offer a synthetic map-body box as a drag handle", async () => {
    renderCanvas(
      groupedPositions({
        __map_body_m1: { label: "Map body", nodeIds: ["a", "b"] },
      }),
    );
    await flushAnimationFrame();
    const box = boxFor("__map_body_m1") as unknown as {
      draggable?: boolean;
      dragHandle?: string;
    };
    expect(box.draggable).toBe(false);
    expect(box.dragHandle).toBeUndefined();
  });

  it("moves carried members live during the drag, not only at drop", async () => {
    renderCanvas(
      groupedPositions({ g1: { label: "Stage one", nodeIds: ["a", "b"] } }),
    );
    await flushAnimationFrame();
    const { start, move } = dragHandlers();
    const box = boxFor("g1");
    act(() => {
      start({}, { id: box.id, position: box.position });
      move(
        {},
        {
          id: box.id,
          position: { x: box.position.x + 25, y: box.position.y + 5 },
        },
      );
    });
    // The canvas is controlled, so the projected node array IS what renders.
    const props = latestReactFlowProps.current;
    const nodes = (props?.nodes ?? []) as Array<{ id: string; position: XY }>;
    expect(nodes.find((n) => n.id === "a")?.position).toEqual({ x: 25, y: 5 });
    expect(nodes.find((n) => n.id === "b")?.position).toEqual({
      x: 125,
      y: 5,
    });
  });

  it("writes one config emission for the whole gesture", async () => {
    const { onConfigChange } = renderCanvas(
      groupedPositions({
        g1: { label: "Stage one", nodeIds: ["a", "b", "c"] },
      }),
    );
    await flushAnimationFrame();
    const { start, move, stop } = dragHandlers();
    const box = boxFor("g1");
    const at = (dx: number) => ({
      id: box.id,
      position: { x: box.position.x + dx, y: box.position.y },
    });
    act(() => {
      start({}, at(0));
      move({}, at(10));
      move({}, at(20));
      stop({}, at(30), [at(30)]);
    });
    // One gesture, one write — so it is also one undo step.
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodes.a.metadata?.position).toEqual({ x: 30, y: 0 });
    expect(next.nodes.b.metadata?.position).toEqual({ x: 130, y: 0 });
    expect(next.nodes.c.metadata?.position).toEqual({ x: 430, y: 300 });
  });
});

/**
 * G-031 — the badge-sync effect skipped source nodes and group chips, so the
 * top bar could report "N issues" with nothing marked anywhere on the graph.
 * Source nodes carry ERROR-severity rules; a chip collapses members whose
 * badges leave the canvas with them.
 */
describe("WorkflowEditorCanvas — G-031 validation state on source cards and chips", () => {
  function sourceConfig(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "src" },
      ctx: {},
      entryNodeId: "intake",
      nodes: {
        intake: {
          id: "intake",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
          parameters: {},
        },
        a: {
          id: "a",
          type: "activity",
          label: "A",
          activityType: "file.prepare",
        },
      },
      edges: [],
      nodeGroups: { g1: { label: "Stage one", nodeIds: ["a"] } },
    } as GraphWorkflowConfig;
  }

  it("marks a source card that carries a validation error", async () => {
    renderCanvas(sourceConfig(), {
      errorsByNode: new Map([
        [
          "intake",
          [
            {
              path: "nodes.intake.sourceType",
              message: "Unknown source subtype",
              severity: "error",
            },
          ],
        ],
      ]),
    });
    await flushAnimationFrame();
    expect(await screen.findByTestId("node-badge-intake")).toHaveTextContent(
      "1",
    );
  });

  it("leaves a clean source card unmarked", async () => {
    renderCanvas(sourceConfig(), { errorsByNode: new Map() });
    await flushAnimationFrame();
    expect(screen.queryByTestId("node-badge-intake")).toBeNull();
  });

  it("rolls a collapsed group's member issues onto its chip", async () => {
    renderCanvas(sourceConfig(), {
      simplifiedView: true,
      errorsByNode: new Map([
        [
          "a",
          [
            {
              path: "nodes.a.parameters.x",
              message: "Required",
              severity: "error",
            },
            {
              path: "nodes.a.inputs.fileData",
              message: "Needs a source",
              severity: "warning",
            },
          ],
        ],
      ]),
    });
    await flushAnimationFrame();
    // One error + one warning on the hidden member → the chip shows the
    // error count, matching how the badge renders elsewhere.
    expect(
      await screen.findByTestId("node-badge-group-chip-g1"),
    ).toHaveTextContent("1");
  });

  it("leaves a chip unmarked when its members are clean", async () => {
    renderCanvas(sourceConfig(), {
      simplifiedView: true,
      errorsByNode: new Map(),
    });
    await flushAnimationFrame();
    expect(screen.queryByTestId("node-badge-group-chip-g1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-3 / P-4 (2026-08-03): canvas menus close on a left click, and the empty
// pane gets a menu of its own instead of the browser's.
// ---------------------------------------------------------------------------

/**
 * Mantine's `closeOnClickOutside` listens on document `mousedown`, and
 * xyflow's pane runs d3-zoom/d3-drag, which calls `stopImmediatePropagation`
 * on pane mousedown — so the menu closed for every click EXCEPT a click on the
 * canvas. These tests drive the xyflow callbacks the canvas now closes from.
 */
// Found in a real browser, not here: xyflow's default minZoom is 0.5 and
// `fitView` CLAMPS to it silently. standard-ocr lays out ~4500 flow-units wide
// against a ~720px pane, so fitting needs ~0.16 — the viewport stopped at 0.5,
// the graph hung off both edges, and every later Fit was a no-op because it was
// already at the limit. jsdom cannot catch this (it mocks ReactFlow wholesale
// and never lays anything out), so this test pins the PROP rather than the
// behaviour: it is the one part of the fix that is checkable here.
describe("WorkflowEditorCanvas — fitView can actually fit a wide graph", () => {
  it("lowers minZoom below xyflow's clamping default of 0.5", () => {
    renderCanvas(makeAllNodeTypesConfig());
    const minZoom = latestReactFlowProps.current?.minZoom as number | undefined;
    expect(typeof minZoom).toBe("number");
    expect(minZoom).toBeLessThan(0.5);
  });
});

describe("WorkflowEditorCanvas — B-3: menus close on a canvas left click", () => {
  function openNodeMenu(nodeId: string) {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onNodeContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onNodeContextMenu");
    }
    const handler = props.onNodeContextMenu as (
      event: React.MouseEvent,
      node: FlowNode,
    ) => void;
    act(() => {
      handler(
        {
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 120,
        } as unknown as React.MouseEvent,
        {
          id: nodeId,
          data: {},
          position: { x: 0, y: 0 },
        } as unknown as FlowNode,
      );
    });
  }

  function fireCanvasCallback(name: "onPaneClick" | "onNodeClick" | "onMove") {
    const props = latestReactFlowProps.current;
    if (!props || typeof props[name] !== "function") {
      throw new Error(`ReactFlow mock did not capture ${name}`);
    }
    act(() => {
      (props[name] as (...args: unknown[]) => void)();
    });
  }

  it.each([
    "onPaneClick",
    "onNodeClick",
    "onMove",
  ] as const)("closes the node context menu on %s", async (callback) => {
    renderCanvas(makeAllNodeTypesConfig());
    openNodeMenu("activity_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    fireCanvasCallback(callback);
    await waitFor(() => {
      expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
    });
  });

  // The wire menu is the same Mantine menu opened by the same right-click, so
  // it carried the identical defect: right-click a wire, left-click the
  // canvas, and it stayed open. Covered here rather than in the §7 wire-menu
  // block because the fix is one shared `closeCanvasMenus`, not three.
  it.each([
    "onPaneClick",
    "onNodeClick",
    "onMove",
  ] as const)("closes the wire context menu on %s", async (callback) => {
    renderCanvas(makeSingleWireConfig());
    await flushAnimationFrame();

    const props = latestReactFlowProps.current;
    const onEdgeContextMenu = props?.onEdgeContextMenu as (
      event: React.MouseEvent,
      edge: Edge,
    ) => void;
    const dataWireEdge = getCapturedEdges().find(
      (e) => e.id === "wire:submit:inA",
    );
    if (!dataWireEdge) throw new Error("data wire not projected");
    act(() => {
      onEdgeContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 111,
          clientY: 222,
        } as unknown as React.MouseEvent,
        dataWireEdge,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("wire-context-menu")).toBeInTheDocument();
    });

    fireCanvasCallback(callback);
    await waitFor(() => {
      expect(screen.queryByTestId("wire-context-menu")).not.toBeInTheDocument();
    });
  });

  it("closes without firing any of the menu's actions", async () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());
    openNodeMenu("activity_1");
    await waitFor(() => {
      expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    });
    fireCanvasCallback("onPaneClick");
    await waitFor(() => {
      expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});

describe("WorkflowEditorCanvas — P-4: empty-canvas context menu", () => {
  /** Right-clicks the pane at (x, y) through the captured xyflow callback. */
  function openPaneMenu(x = 400, y = 300) {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onPaneContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onPaneContextMenu");
    }
    const preventDefault = vi.fn();
    act(() => {
      (props.onPaneContextMenu as (e: React.MouseEvent) => void)({
        preventDefault,
        clientX: x,
        clientY: y,
      } as unknown as React.MouseEvent);
    });
    return { preventDefault };
  }

  function renderedNodes(): Array<{ id: string; selected?: boolean }> {
    return (latestReactFlowProps.current?.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
  }

  it("suppresses the browser menu and opens ours", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    const { preventDefault } = openPaneMenu();
    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    for (const entry of [
      "pane-menu-add-node",
      "pane-menu-auto-arrange",
      "pane-menu-fit-view",
      "pane-menu-select-all",
    ]) {
      expect(screen.getByTestId(entry)).toBeInTheDocument();
    }
  });

  it("closes on a left click on the pane (shares the B-3 fix)", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    act(() => {
      (latestReactFlowProps.current?.onPaneClick as () => void)();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("pane-context-menu")).not.toBeInTheDocument();
    });
  });

  it("disables the node actions on an empty canvas", async () => {
    const empty: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Empty", version: "1.0.0" },
      ctx: {},
      nodes: {},
      edges: [],
      entryNodeId: "",
    };
    renderCanvas(empty);
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-context-menu")).toBeInTheDocument();
    });
    // "Add node here" is the one entry that still means something.
    expect(screen.getByTestId("pane-menu-add-node")).not.toHaveAttribute(
      "data-disabled",
      "true",
    );
    for (const entry of [
      "pane-menu-auto-arrange",
      "pane-menu-fit-view",
      "pane-menu-select-all",
    ]) {
      expect(screen.getByTestId(entry)).toHaveAttribute(
        "data-disabled",
        "true",
      );
    }
  });

  it("Fit view fits the whole graph", async () => {
    renderCanvas(makeAllNodeTypesConfig());
    await flushAnimationFrame();
    mockFitView.mockClear();
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-fit-view")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-fit-view"));
    await waitFor(() => {
      expect(mockFitView).toHaveBeenCalledWith({
        padding: 0.15,
        duration: 300,
      });
    });
    // The menu closes behind the action.
    await waitFor(() => {
      expect(screen.queryByTestId("pane-context-menu")).not.toBeInTheDocument();
    });
  });

  it("Auto-arrange stamps a fresh layout in one config change", async () => {
    const { onConfigChange } = renderCanvas(makeAllNodeTypesConfig());
    await flushAnimationFrame();
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-auto-arrange")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-auto-arrange"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledTimes(1);
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    // Every node comes back carrying a position — that is what dagre wrote.
    for (const node of Object.values(next.nodes)) {
      const pos = (node.metadata as { position?: { x: number; y: number } })
        ?.position;
      expect(typeof pos?.x).toBe("number");
      expect(typeof pos?.y).toBe("number");
    }
    // Positions changed for at least one node (the fixture lays them all on
    // one row; dagre does not).
    const before = makeAllNodeTypesConfig();
    const moved = Object.keys(next.nodes).some((id) => {
      const a = (before.nodes[id].metadata as { position?: { x: number } })
        ?.position;
      const b = (next.nodes[id].metadata as { position?: { x: number } })
        ?.position;
      return a?.x !== b?.x;
    });
    expect(moved).toBe(true);
  });

  it("Select all marks every selectable node", async () => {
    // The map-body container is `selectable: false` decor — selecting it would
    // put a box in the selection no action can act on.
    renderCanvas(makeMapWithBodyDisplayConfig());
    await flushAnimationFrame();
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-select-all")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-select-all"));
    await waitFor(() => {
      expect(renderedNodes().some((n) => n.selected === true)).toBe(true);
    });
    for (const node of renderedNodes()) {
      if (node.id.startsWith("container-")) {
        expect(node.selected).not.toBe(true);
      } else {
        expect(node.selected).toBe(true);
      }
    }
  });

  it("'Add node here' lands the picked activity at the right-clicked point", async () => {
    const { onConfigChange, onSelectNode } = renderCanvas(
      makeAllNodeTypesConfig(),
    );
    await flushAnimationFrame();
    openPaneMenu(640, 480);
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-add-node")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-add-node"));
    // The pane menu hands over to the catalogue, pinned to the same point.
    await waitFor(() => {
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    });
    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 640, y: 480 });

    fireEvent.click(screen.getByTestId("hover-extend-activity-file.prepare"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    const newIds = Object.keys(next.nodes).filter(
      (id) => !(id in makeAllNodeTypesConfig().nodes),
    );
    expect(newIds).toHaveLength(1);
    const added = next.nodes[newIds[0]];
    if (!added || added.type !== "activity") {
      throw new Error("expected the picked node to be an activity");
    }
    expect(added.activityType).toBe("file.prepare");
    // Detached: the pick wires nothing, unlike hover-extend.
    expect(next.edges).toEqual([]);
    expect(
      (added.metadata as { position?: { x: number; y: number } })?.position,
    ).toEqual({ x: 640, y: 480 });
    // No port bindings — the auto-wire resolver owns input binding.
    expect(added.inputs).toEqual([]);
    expect(added.outputs).toEqual([]);
    expect(onSelectNode).toHaveBeenCalledWith(newIds[0]);
    // The entry pointer is left alone: this graph already had one.
    expect(next.entryNodeId).toBe("activity_1");
  });

  it("'Add node here' adopts the first node as the entry point", async () => {
    const empty: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Empty", version: "1.0.0" },
      ctx: {},
      nodes: {},
      edges: [],
      entryNodeId: "",
    };
    const { onConfigChange } = renderCanvas(empty);
    openPaneMenu(120, 90);
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-add-node")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-add-node"));
    await waitFor(() => {
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("hover-extend-control-flow-switch"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    const ids = Object.keys(next.nodes);
    expect(ids).toHaveLength(1);
    expect(next.nodes[ids[0]].type).toBe("switch");
    // A first node that is not the entry point makes the workflow invalid on
    // arrival — the palette-add path adopts it, so this one does too.
    expect(next.entryNodeId).toBe(ids[0]);
  });
});

// ---------------------------------------------------------------------------
// G-4 — the pane menu's Auto-arrange is simplified-view aware.
//
// With groups collapsed, the graph on screen is chips + ungrouped nodes.
// Laying out the MEMBER graph slid each chip to the centre of its own member
// chain, so the author saw nothing move. The pane menu is one of the three
// Auto-arrange entry points and had to learn the same rule as the top bar.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — G-4: Auto-arrange in simplified view", () => {
  /**
   * Two groups wired g1 → g2, plus one ungrouped node hanging off g2. Every
   * node starts stacked near the origin, so both chips start on top of each
   * other — the state the author reaches for Auto-arrange to fix.
   */
  function makeCollapsedFixture(): GraphWorkflowConfig {
    const at = (id: string, x: number, y: number): ActivityNode => ({
      id,
      type: "activity",
      label: id,
      activityType: "data.transform",
      parameters: {},
      metadata: { position: { x, y } },
    });
    return {
      schemaVersion: "1.0",
      metadata: { name: "collapsed", version: "1.0.0" },
      ctx: {},
      nodes: {
        n1: at("n1", 0, 0),
        n2: at("n2", 90, 30),
        n3: at("n3", 20, 10),
        n4: at("n4", 110, -25),
        tail: at("tail", 50, 0),
      },
      edges: [
        { id: "e1", source: "n1", target: "n2", type: "normal" },
        { id: "e2", source: "n2", target: "n3", type: "normal" },
        { id: "e3", source: "n3", target: "n4", type: "normal" },
        { id: "e4", source: "n4", target: "tail", type: "normal" },
      ],
      entryNodeId: "n1",
      nodeGroups: {
        g1: { label: "Group 1", nodeIds: ["n1", "n2"] },
        g2: { label: "Group 2", nodeIds: ["n3", "n4"] },
      },
    };
  }

  function chipXOf(config: GraphWorkflowConfig, groupId: string): number {
    const chip = projectGroupedConfig(config).chips.find(
      (c) => c.groupId === groupId,
    );
    if (!chip) throw new Error(`no chip projected for ${groupId}`);
    return chip.position.x;
  }

  function positionOf(
    config: GraphWorkflowConfig,
    id: string,
  ): { x: number; y: number } {
    return (config.nodes[id].metadata as { position: { x: number; y: number } })
      .position;
  }

  /** W-1 — the simplified view's own coordinate for a node. */
  function simplifiedPositionOf(
    config: GraphWorkflowConfig,
    id: string,
  ): { x: number; y: number } | undefined {
    return (
      config.nodes[id].metadata as
        | { simplifiedPosition?: { x: number; y: number } }
        | undefined
    )?.simplifiedPosition;
  }

  function openPaneMenu() {
    const props = latestReactFlowProps.current;
    if (!props || typeof props.onPaneContextMenu !== "function") {
      throw new Error("ReactFlow mock did not capture onPaneContextMenu");
    }
    act(() => {
      (props.onPaneContextMenu as (e: React.MouseEvent) => void)({
        preventDefault: vi.fn(),
        clientX: 300,
        clientY: 200,
      } as unknown as React.MouseEvent);
    });
  }

  async function arrangeFromPaneMenu(simplifiedView: boolean) {
    const rendered = renderCanvas(makeCollapsedFixture(), { simplifiedView });
    await flushAnimationFrame();
    openPaneMenu();
    await waitFor(() => {
      expect(screen.getByTestId("pane-menu-auto-arrange")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("pane-menu-auto-arrange"));
    await waitFor(() => {
      expect(rendered.onConfigChange).toHaveBeenCalledTimes(1);
    });
    return {
      ...rendered,
      next: rendered.onConfigChange.mock.calls[0][0] as GraphWorkflowConfig,
    };
  }

  it("spaces the chips as CHIP columns, not as member-chain centroids", async () => {
    const before = makeCollapsedFixture();
    const { next } = await arrangeFromPaneMenu(true);
    // Before: the two chips sit on top of each other.
    expect(
      Math.abs(chipXOf(before, "g2") - chipXOf(before, "g1")),
    ).toBeLessThan(248);
    // After: adjacent chip columns are exactly a chip box plus one ranksep
    // apart (248 + 80). This is the assertion the old behaviour fails — laying
    // out the MEMBER graph left each chip at the centre of its own two-card
    // chain, so the gap came out at member-column scale, near 4x this.
    expect(chipXOf(next, "g2") - chipXOf(next, "g1")).toBeCloseTo(248 + 80, 0);
    // The ungrouped node is a real card in the next column along.
    expect(simplifiedPositionOf(next, "tail")?.x).toBeGreaterThan(
      chipXOf(next, "g2") + 248,
    );
  });

  // W-1 — the defect Alex reported: auto-arranging here used to rewrite every
  // member's `metadata.position`, so switching back to the expanded view showed
  // the graph bunched up, permanently.
  it("leaves the EXPANDED arrangement untouched", async () => {
    const before = makeCollapsedFixture();
    const { next } = await arrangeFromPaneMenu(true);
    for (const id of Object.keys(before.nodes)) {
      expect(positionOf(next, id)).toEqual(positionOf(before, id));
    }
    // The chips did move — otherwise this test would pass on a no-op.
    expect(chipXOf(next, "g2") - chipXOf(next, "g1")).not.toBeCloseTo(
      chipXOf(before, "g2") - chipXOf(before, "g1"),
      0,
    );
  });

  it("arranging in the EXPANDED view still writes `position`", async () => {
    const before = makeCollapsedFixture();
    const { next } = await arrangeFromPaneMenu(false);
    const moved = Object.keys(before.nodes).some(
      (id) => positionOf(next, id).x !== positionOf(before, id).x,
    );
    expect(moved).toBe(true);
  });

  it("keeps each group's internal geometry so expanding stays coherent", async () => {
    const before = makeCollapsedFixture();
    const { next } = await arrangeFromPaneMenu(true);
    for (const [a, b] of [
      ["n1", "n2"],
      ["n3", "n4"],
    ]) {
      expect({
        x: positionOf(next, b).x - positionOf(next, a).x,
        y: positionOf(next, b).y - positionOf(next, a).y,
      }).toEqual({
        x: positionOf(before, b).x - positionOf(before, a).x,
        y: positionOf(before, b).y - positionOf(before, a).y,
      });
    }
  });

  it("moves the RENDERED chips, not just the config", async () => {
    // The structural fingerprint excludes positions, so nothing re-projects on
    // an arrange. A chip is derived geometry (its members' centroid) and is not
    // in `config.nodes`, so the position copy cannot reach it — without the
    // chip re-derivation the config changed and the canvas sat still, which is
    // exactly the bug the author reported.
    const { next } = await arrangeFromPaneMenu(true);
    const renderedChips = (
      (latestReactFlowProps.current?.nodes ?? []) as Array<{
        id: string;
        position: { x: number; y: number };
      }>
    ).filter((n) => n.id.startsWith("group-chip-"));
    expect(renderedChips).toHaveLength(2);
    for (const chip of renderedChips) {
      const groupId = chip.id.replace("group-chip-", "");
      expect(chip.position.x).toBeCloseTo(chipXOf(next, groupId), 5);
    }
  });

  it("leaves EXPANDED-view Auto-arrange on the member-graph layout", async () => {
    const { next } = await arrangeFromPaneMenu(false);
    // jsdom measures nothing, so the live-instance width sweep is empty and
    // the helper runs on its defaults — byte-comparable with a direct call.
    expect(next).toEqual(layoutGraphWithMapBodies(makeCollapsedFixture()));
  });
});

// ---------------------------------------------------------------------------
// Batch 8b — Inderdeep UX review 2026-08-06
// ---------------------------------------------------------------------------

/**
 * Item 19 — *"I was trying to ungroup it … I'm just right clicking. Nothing is
 * happening. And then I realized, oh, I need to be on a particular node."*
 *
 * The handler DID fire for the group's box; it bailed one line later on
 * `config.nodes[node.id]`, because a container's id is `container-<groupId>`
 * and is never a key in `config.nodes`.
 */
describe("WorkflowEditorCanvas — item 19: right-click the group to ungroup it", () => {
  function groupedConfig(): GraphWorkflowConfig {
    const nodes: Record<string, GraphNode> = {};
    for (const id of ["a", "b"]) {
      nodes[id] = {
        id,
        type: "activity",
        label: id.toUpperCase(),
        activityType: "file.prepare",
        parameters: {},
        metadata: { position: { x: 0, y: 0 } },
      } as GraphNode;
    }
    return {
      schemaVersion: "1.0",
      metadata: { name: "grouped", version: "1.0.0" },
      ctx: {},
      nodes,
      edges: [],
      entryNodeId: "a",
      nodeGroups: { g1: { label: "Stage one", nodeIds: ["a", "b"] } },
    };
  }

  function rightClick(nodeId: string) {
    const props = latestReactFlowProps.current;
    const handler = props?.onNodeContextMenu as (
      event: React.MouseEvent,
      node: FlowNode,
    ) => void;
    if (typeof handler !== "function") {
      throw new Error("ReactFlow mock did not capture onNodeContextMenu");
    }
    const preventDefault = vi.fn();
    act(() => {
      handler(
        {
          preventDefault,
          clientX: 40,
          clientY: 50,
        } as unknown as React.MouseEvent,
        {
          id: nodeId,
          data: {},
          position: { x: 0, y: 0 },
        } as unknown as FlowNode,
      );
    });
    return { preventDefault };
  }

  it("offers Ungroup on the group container, and nothing that means nothing for a projection", async () => {
    renderCanvas(groupedConfig());
    rightClick("container-g1");
    await waitFor(() => {
      expect(screen.getByTestId("context-menu-ungroup")).toBeInTheDocument();
    });
    expect(screen.getByTestId("context-menu-ungroup")).toHaveTextContent(
      "Ungroup",
    );
    expect(screen.getByTestId("context-menu-ungroup")).toHaveTextContent(
      "Stage one",
    );
    // "Change activity type" has nothing to swap and "Delete node" would look
    // up `config.nodes["container-g1"]` and silently do nothing.
    expect(screen.queryByTestId("context-menu-delete-node")).toBeNull();
    expect(
      screen.queryByTestId("context-menu-change-activity-type"),
    ).toBeNull();
    expect(screen.queryByTestId("context-menu-delete-selection")).toBeNull();
  });

  it("ungroups through the SAME path the member-node entry uses", async () => {
    const { onConfigChange } = renderCanvas(groupedConfig());
    rightClick("container-g1");
    await waitFor(() => {
      expect(screen.getByTestId("context-menu-ungroup")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-menu-ungroup"));
    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1).toBeUndefined();
    // The steps stay — ungrouping removes the group entry, not the work.
    expect(Object.keys(next.nodes).sort()).toEqual(["a", "b"]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ungrouped" }),
    );
  });

  it("still shows the full node menu when the right-click lands on a member", async () => {
    renderCanvas(groupedConfig());
    rightClick("a");
    await waitFor(() => {
      expect(
        screen.getByTestId("context-menu-delete-node"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("context-menu-change-activity-type"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("context-menu-ungroup")).toBeInTheDocument();
  });

  it("opens no menu on a map-body box — there is no authored group to remove", async () => {
    renderCanvas(makeMapWithBodyDisplayConfig());
    rightClick("container-__map_body_m");
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("node-context-menu")).toBeNull();
  });
});

/**
 * Item 5 — *"I don't even know first what the red dot is … and then like even
 * if I notice it, then it doesn't do anything."*
 */
describe("WorkflowEditorCanvas — item 5: the error-path handle", () => {
  function fallbackConfig(): GraphWorkflowConfig {
    const seed: ActivityNode = {
      id: "seed",
      type: "activity",
      label: "Seed",
      activityType: "data.transform",
      parameters: {},
      errorPolicy: { retryable: false, onError: "fallback" },
      metadata: { position: { x: 100, y: 50 } },
    };
    return {
      schemaVersion: "1.0",
      metadata: { name: "E", version: "1.0.0" },
      ctx: {},
      nodes: { seed },
      edges: [],
      entryNodeId: "seed",
    };
  }

  function hoverErrorHandle(nodeId: string) {
    const nodeEl = screen.getByTestId(`canvas-node-${nodeId}`);
    const handle = nodeEl.querySelector<HTMLElement>(
      '[data-testid="handle-source-bottom"][data-handleid="error"]',
    );
    if (!handle) throw new Error(`error handle missing on ${nodeId}`);
    fireEvent.mouseEnter(handle);
  }

  it("names the red dot on hover", () => {
    renderCanvas(fallbackConfig());
    expect(screen.getByTestId("error-handle-tooltip-seed")).toHaveAttribute(
      "data-port-tooltip",
      "Error path: runs when this step fails",
    );
  });

  it("opens the SAME picker every other output handle opens, saying what the pick is for", async () => {
    vi.useFakeTimers();
    try {
      renderCanvas(fallbackConfig());
      hoverErrorHandle("seed");
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
      const banner = screen.getByTestId("hover-extend-error-path-banner");
      expect(banner).toHaveTextContent("Error path");
      expect(banner).toHaveTextContent(
        "Pick the step that runs when this step fails.",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("lands an error-typed edge and records it on the source's policy", async () => {
    vi.useFakeTimers();
    try {
      const { onConfigChange } = renderCanvas(fallbackConfig());
      hoverErrorHandle("seed");
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const row = screen.getByTestId("hover-extend-activity-file.prepare");
      vi.useRealTimers();
      fireEvent.click(row);
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
      expect(next.edges).toHaveLength(1);
      const edge = next.edges[0];
      expect(edge.type).toBe("error");
      expect(edge.source).toBe("seed");
      // G-001 — drawing the path IS naming it, so the validator has nothing
      // left to complain about.
      const seed = next.nodes.seed;
      expect(seed.errorPolicy?.fallbackEdgeId).toBe(edge.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps ordinary wiring ordinary — the node-level handle still lands a normal edge", async () => {
    vi.useFakeTimers();
    try {
      const { onConfigChange } = renderCanvas(fallbackConfig());
      const nodeEl = screen.getByTestId("canvas-node-seed");
      const outHandle = nodeEl.querySelector<HTMLElement>(
        '[data-testid="handle-source-right"][data-handleid="out"]',
      );
      if (!outHandle) throw new Error("out handle missing");
      fireEvent.mouseEnter(outHandle);
      act(() => {
        vi.advanceTimersByTime(210);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByTestId("hover-extend-error-path-banner")).toBeNull();
      const row = screen.getByTestId("hover-extend-activity-file.prepare");
      vi.useRealTimers();
      fireEvent.click(row);
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
      const next = onConfigChange.mock.calls[0][0] as GraphWorkflowConfig;
      expect(next.edges[0].type).toBe("normal");
      expect(next.nodes.seed.errorPolicy?.fallbackEdgeId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Item 7 — *"If it's an error, maybe it's better to mention it alongside the
 * node name or the title … rather than at the top right of it."*
 */
describe("WorkflowEditorCanvas — item 7: failure is visible at the title", () => {
  function twoNodeConfig(): GraphWorkflowConfig {
    const nodes: Record<string, GraphNode> = {};
    for (const id of ["ok", "boom"]) {
      nodes[id] = {
        id,
        type: "activity",
        label: id.toUpperCase(),
        activityType: "file.prepare",
        parameters: {},
        metadata: { position: { x: 0, y: 0 } },
      } as GraphNode;
    }
    return {
      schemaVersion: "1.0",
      metadata: { name: "run", version: "1.0.0" },
      ctx: {},
      nodes,
      edges: [],
      entryNodeId: "ok",
    };
  }

  it("shows an Error chip beside the failed node's title, and only there", () => {
    mockRunState.current = {
      activeRunId: "run_1",
      nodeStatuses: {
        ok: { status: "succeeded" },
        boom: { status: "failed", errorMessage: "Azure OCR rejected the PDF" },
      },
    };
    renderCanvas(twoNodeConfig());
    const chip = screen.getByTestId("node-failure-chip-boom");
    expect(chip).toHaveTextContent("Error");
    // Beside the title, not in the corner: the chip's parent row is the one
    // carrying the node's label.
    expect(chip.parentElement?.textContent).toContain("BOOM");
    expect(screen.queryByTestId("node-failure-chip-ok")).toBeNull();
  });

  it("never marks a cache hit or a succeeded step as failed", () => {
    mockRunState.current = {
      activeRunId: "run_1",
      nodeStatuses: {
        ok: { status: "succeeded" },
        boom: { status: "skipped" },
      },
    };
    renderCanvas(twoNodeConfig());
    expect(screen.queryByTestId("node-failure-chip-boom")).toBeNull();
    expect(screen.queryByTestId("node-failure-chip-ok")).toBeNull();
  });

  it("shows nothing at design time — no run, no failure to report", () => {
    renderCanvas(twoNodeConfig());
    expect(screen.queryByTestId("node-failure-chip-boom")).toBeNull();
  });
});
