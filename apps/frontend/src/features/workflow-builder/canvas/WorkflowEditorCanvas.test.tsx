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

import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import type { Connection, Edge } from "@xyflow/react";
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
import type { WorkflowEdgeData } from "./WorkflowEdge";
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
const { mockFitView, mockReactFlowApi, latestReactFlowProps } = vi.hoisted(
  () => {
    const fitView = vi.fn();
    return {
      mockFitView: fitView,
      mockReactFlowApi: { fitView },
      latestReactFlowProps: {
        current: null as null | Record<string, unknown>,
      },
    };
  },
);

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
        </div>
      );
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: ({
      type,
      position,
      id,
    }: {
      type: string;
      position: string;
      id?: string;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
      />
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    useReactFlow: () => mockReactFlowApi,
  };
});

beforeEach(() => {
  mockFitView.mockClear();
  latestReactFlowProps.current = null;
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
  } = {},
) {
  const onConfigChange = vi.fn();
  const onSelectNode = vi.fn();
  let currentConfig = config;
  let currentSelected = options.selectedNodeId ?? null;
  const utils = render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={currentConfig}
        selectedNodeId={currentSelected}
        onConfigChange={onConfigChange}
        onSelectNode={onSelectNode}
        errorsByNode={options.errorsByNode}
        onNodeBadgeClick={options.onNodeBadgeClick}
      />
    </MantineProvider>,
  );
  /**
   * Re-renders the canvas with a new config (and optionally a new
   * selectedNodeId), mirroring how the page component pushes
   * `setConfig(next)` after `addActivity` / `addControlFlowNode`. Tests
   * use this to simulate a palette add.
   */
  const rerenderWithConfig = (
    nextConfig: GraphWorkflowConfig,
    nextSelected?: string | null,
  ) => {
    currentConfig = nextConfig;
    if (nextSelected !== undefined) {
      currentSelected = nextSelected;
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
        />
      </MantineProvider>,
    );
  };
  return { ...utils, onConfigChange, onSelectNode, rerenderWithConfig };
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
  ): Array<{ type: string; handleId: string | null }> {
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
    const sources = handles.filter((h) => h.type === "source");
    expect(sources).toHaveLength(1);
    // Without a fallback policy the renderer still names the normal
    // source handle `out` so xyflow can disambiguate consistently —
    // there must not be a second source handle with id `error`.
    expect(sources.some((h) => h.handleId === "error")).toBe(false);
  });

  it("Scenario 1b: activity node with errorPolicy.onError='fail' renders exactly one source handle", () => {
    renderCanvas(configWithErrorPolicyActivity("fail"));
    const handles = collectHandles("activity_1");
    const sources = handles.filter((h) => h.type === "source");
    expect(sources).toHaveLength(1);
    expect(sources.some((h) => h.handleId === "error")).toBe(false);
  });

  it("Scenario 2: activity node with errorPolicy.onError='fallback' renders two source handles (out + error)", () => {
    renderCanvas(configWithErrorPolicyActivity("fallback"));
    const handles = collectHandles("activity_1");
    const sources = handles.filter((h) => h.type === "source");
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
    const sources = handles.filter((h) => h.type === "source");
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
    // Source handle on activity_1 must carry id="out" so xyflow's
    // default-handle resolution can still match it.
    const handles = collectHandles("activity_1");
    const source = handles.find((h) => h.type === "source");
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
        padding: 0.25,
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
      expect.objectContaining({ padding: 0.25, duration: 300 }),
    );
    expect(callArg.nodes).toBeUndefined();
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
    // WorkflowEdge renderer can resolve `case[i]: <predicate>` labels.
    expect(conditionalEdge?.data).toMatchObject({
      graphEdge: { id: "edge_conditional", type: "conditional" },
      sourceSwitch: { id: "switch_1", type: "switch" },
    });
  });

  it("aligns each edge's arrowhead marker colour with its stroke colour", async () => {
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

    // Normal: grey marker matching the grey stroke.
    expect(normalEdge?.markerEnd).toMatchObject({ color: "#9ca3af" });
    expect(normalEdge?.style).toMatchObject({ stroke: "#9ca3af" });

    // Conditional: switch accent for both stroke and marker.
    const switchAccent = "#facc15";
    expect(conditionalEdge?.markerEnd).toMatchObject({ color: switchAccent });
    expect(conditionalEdge?.style).toMatchObject({ stroke: switchAccent });

    // Error: red for both stroke and marker (matches the WorkflowEdge
    // renderer's ERROR_STROKE colour).
    const errorColor = "var(--mantine-color-red-6, #e03131)";
    expect(errorEdge?.markerEnd).toMatchObject({ color: errorColor });
    expect(errorEdge?.style).toMatchObject({ stroke: errorColor });
  });
});
