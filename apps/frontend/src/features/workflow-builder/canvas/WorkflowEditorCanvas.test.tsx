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
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
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
    ReactFlow: ({
      nodes,
      nodeTypes,
    }: {
      nodes: MockNodeProps[];
      nodeTypes?: Record<string, React.ComponentType<MockNodeProps>>;
    }) => (
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
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: ({ type, position }: { type: string; position: string }) => (
      <div data-testid={`handle-${type}-${position}`} />
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
  };
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
  const utils = render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={config}
        selectedNodeId={options.selectedNodeId ?? null}
        onConfigChange={onConfigChange}
        onSelectNode={onSelectNode}
        errorsByNode={options.errorsByNode}
        onNodeBadgeClick={options.onNodeBadgeClick}
      />
    </MantineProvider>,
  );
  return { ...utils, onConfigChange, onSelectNode };
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
