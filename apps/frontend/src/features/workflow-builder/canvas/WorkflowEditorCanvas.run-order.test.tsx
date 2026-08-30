/**
 * The run-order connectors, end to end on the canvas — review items D9, D10
 * and D28, all three of which are the same dot seen from different sides.
 *
 * - **D28** — the pair is drawn identically on every rectangular card
 *   (position, fill) and says the same sentence on both, and the sentence is
 *   about execution order rather than about data ports.
 * - **D10** — that sentence states the gesture exists, which is the whole
 *   answer: run-order edges were always drawable by hand and nothing said so.
 * - **D9** — a drag begun on a data port and released on the run-order dot no
 *   longer becomes an execution edge. It binds the input it was aimed at, or
 *   it is refused out loud.
 *
 * Lives in its own file because it needs a `Handle` mock that forwards
 * `style` (the main suite's does not) and a captured `onConnectEnd`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { render, screen } from "@testing-library/react";
import type { Connection } from "@xyflow/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
  MapNode,
  SwitchNode,
} from "../../../types/workflow";
import { FLOW_HANDLE_TOP } from "./flow-handle";
import { SEQUENCE_STROKE } from "./WorkflowEdge";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock("../dynamic-nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../dynamic-nodes")>();
  return {
    ...actual,
    useActivityCatalog: () => ({ isLoading: false, entries: [], error: null }),
  };
});

interface MockNodeProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
  selected?: boolean;
}

const { latestReactFlowProps, mockUpdateNodeInternals } = vi.hoisted(() => ({
  latestReactFlowProps: { current: null as null | Record<string, unknown> },
  mockUpdateNodeInternals: vi.fn(),
}));

vi.mock("@xyflow/react", () => {
  const useNodesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    return [state, setState, () => undefined] as const;
  };
  const useEdgesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    return [state, setState, () => undefined] as const;
  };
  return {
    ReactFlow: (props: Record<string, unknown>) => {
      latestReactFlowProps.current = props;
      const nodes: MockNodeProps[] = (props.nodes as MockNodeProps[]) ?? [];
      const nodeTypes = props.nodeTypes as
        | Record<string, React.ComponentType<MockNodeProps>>
        | undefined;
      return (
        <div data-testid="react-flow">
          {nodes.map((n) => {
            const Renderer = nodeTypes?.[n.type];
            return Renderer ? (
              <div key={n.id} data-testid={`rf-node-${n.id}`}>
                <Renderer
                  id={n.id}
                  type={n.type}
                  data={n.data}
                  selected={n.selected ?? false}
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
    Panel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Handle: ({
      type,
      position,
      id,
      style,
      children,
    }: {
      type: string;
      position: string;
      id?: string;
      style?: React.CSSProperties;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
        style={style}
      >
        {children}
      </div>
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNodes: () => [],
      setNodes: vi.fn(),
      screenToFlowPosition: (p: { x: number; y: number }) => p,
    }),
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
  };
});

// eslint-disable-next-line import/first
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas";

// ---------------------------------------------------------------------------
// Fixtures — gallery stop 7's own pair, plus one card of every other shape.
// ---------------------------------------------------------------------------

function splitNode(): ActivityNode {
  return {
    id: "splitDoc",
    type: "activity",
    label: "Split Document",
    activityType: "document.split",
    parameters: { strategy: "per-page" },
    metadata: { position: { x: 0, y: 0 } },
  };
}

function loopNode(): MapNode {
  return {
    id: "loopNode",
    type: "map",
    label: "Run for each item",
    collectionCtxKey: "",
    itemCtxKey: "",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
    metadata: { position: { x: 400, y: 0 } },
  };
}

function makeConfig(extra: GraphNode[] = []): GraphWorkflowConfig {
  const nodes: Record<string, GraphNode> = {
    splitDoc: splitNode(),
    loopNode: loopNode(),
  };
  for (const n of extra) nodes[n.id] = n;
  return {
    schemaVersion: "1.0",
    metadata: { name: "run-order", version: "1.0.0" },
    ctx: {},
    nodes,
    edges: [],
    entryNodeId: "splitDoc",
  };
}

function renderCanvas(
  config: GraphWorkflowConfig,
  onConfigChange = vi.fn(),
): { onConfigChange: ReturnType<typeof vi.fn> } {
  render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={config}
        selectedNodeId={null}
        onConfigChange={onConfigChange}
        onSelectNode={vi.fn()}
      />
    </MantineProvider>,
  );
  return { onConfigChange };
}

/** The run-order dot on one side of one card. */
function flowHandle(nodeId: string, side: "in" | "out"): HTMLElement {
  const wrapper = screen.getByTestId(`flow-handle-tooltip-${side}-${nodeId}`);
  const handle = wrapper.querySelector<HTMLElement>("[data-testid^='handle-']");
  if (!handle) throw new Error(`no run-order handle on ${nodeId}/${side}`);
  return handle;
}

function reactFlowProp<T>(name: string): T {
  const props = latestReactFlowProps.current;
  if (!props || typeof props[name] !== "function") {
    throw new Error(`ReactFlow mock did not capture ${name}`);
  }
  return props[name] as T;
}

beforeEach(() => {
  latestReactFlowProps.current = null;
  vi.mocked(notifications.show).mockClear();
});

// ---------------------------------------------------------------------------
// D28 — one connector, drawn one way
// ---------------------------------------------------------------------------

describe("D28 — the run-order pair is identical on every rectangular card", () => {
  it("sits at the same height on an activity card and a control-flow card", () => {
    renderCanvas(makeConfig());
    for (const nodeId of ["splitDoc", "loopNode"]) {
      for (const side of ["in", "out"] as const) {
        expect(flowHandle(nodeId, side).style.top).toBe(`${FLOW_HANDLE_TOP}px`);
      }
    }
  });

  it("takes the same fill on both — the dashed wire's own grey", () => {
    renderCanvas(makeConfig());
    const rgb = (hex: string) => {
      const v = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) =>
        Number.parseInt(v.slice(i, i + 2), 16),
      );
      return `rgb(${r}, ${g}, ${b})`;
    };
    for (const nodeId of ["splitDoc", "loopNode"]) {
      for (const side of ["in", "out"] as const) {
        expect(flowHandle(nodeId, side).style.background).toBe(
          rgb(SEQUENCE_STROKE),
        );
      }
    }
  });

  it("centres on the switch diamond's vertices — the one difference geometry forces", () => {
    const switchNode: SwitchNode = {
      id: "branch",
      type: "switch",
      label: "Needs review?",
      cases: [],
      metadata: { position: { x: 800, y: 0 } },
    };
    renderCanvas(makeConfig([switchNode]));
    expect(flowHandle("branch", "in").style.top).toBe("50%");
    expect(flowHandle("branch", "out").style.top).toBe("50%");
  });

  it("says the same sentence on every card, and it is about order, not data", () => {
    renderCanvas(makeConfig());
    const tip = (nodeId: string, side: "in" | "out") =>
      screen
        .getByTestId(`flow-handle-tooltip-${side}-${nodeId}`)
        .getAttribute("data-port-tooltip");

    expect(tip("splitDoc", "in")).toBe(tip("loopNode", "in"));
    expect(tip("splitDoc", "out")).toBe(tip("loopNode", "out"));
    // The control-flow card used to describe this dot as "No typed inputs" —
    // a sentence about data ports, on the connector that carries no data.
    expect(tip("loopNode", "in")).toContain("Runs after");
    expect(tip("loopNode", "in")).not.toContain("typed");
  });
});

// ---------------------------------------------------------------------------
// D10 — "Cannot seem to manually connect order-of-operations edges."
// ---------------------------------------------------------------------------

describe("D10 — the run-order gesture works, and now says so", () => {
  it("accepts a run-order drag between two node-level dots", () => {
    const { onConfigChange } = renderCanvas(makeConfig());
    reactFlowProp<(c: Connection) => void>("onConnect")({
      source: "splitDoc",
      target: "loopNode",
      sourceHandle: "out",
      targetHandle: null,
    });
    const next = onConfigChange.mock.calls[0]?.[0] as GraphWorkflowConfig;
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "splitDoc",
      target: "loopNode",
      type: "normal",
    });
  });

  it("still validates that gesture as connectable", () => {
    renderCanvas(makeConfig());
    const isValid =
      reactFlowProp<(c: Connection) => boolean>("isValidConnection");
    expect(
      isValid({
        source: "splitDoc",
        target: "loopNode",
        sourceHandle: "out",
        targetHandle: null,
      }),
    ).toBe(true);
  });

  it("tells the user on hover that the dot is draggable", () => {
    renderCanvas(makeConfig());
    const out = screen
      .getByTestId("flow-handle-tooltip-out-splitDoc")
      .getAttribute("data-port-tooltip");
    expect(out).toContain("drag from here");
  });
});

// ---------------------------------------------------------------------------
// D9 — a data-port drag stays a data gesture
// ---------------------------------------------------------------------------

interface ConnectEndState {
  fromHandle: { id: string | null } | null;
  toHandle: { id: string | null } | null;
  fromNode: { id: string } | null;
  toNode: { id: string } | null;
  isValid: boolean;
}
type ConnectEnd = (event: MouseEvent, state: ConnectEndState) => void;

describe("D9 — Segments dragged onto the loop's run-order dot", () => {
  it("no longer becomes a run-order edge", () => {
    const { onConfigChange } = renderCanvas(makeConfig());
    reactFlowProp<(c: Connection) => void>("onConnect")({
      source: "splitDoc",
      target: "loopNode",
      sourceHandle: "out-segments",
      targetHandle: null,
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("is refused at validation time, so the wire never snaps", () => {
    renderCanvas(makeConfig());
    const isValid =
      reactFlowProp<(c: Connection) => boolean>("isValidConnection");
    expect(
      isValid({
        source: "splitDoc",
        target: "loopNode",
        sourceHandle: "out-segments",
        targetHandle: null,
      }),
    ).toBe(false);
  });

  it("says WHY on release — the loop has no data inputs at all", () => {
    renderCanvas(makeConfig());
    reactFlowProp<ConnectEnd>("onConnectEnd")(new MouseEvent("mouseup"), {
      fromHandle: { id: "out-segments" },
      toHandle: { id: null },
      fromNode: { id: "splitDoc" },
      toNode: { id: "loopNode" },
      isValid: false,
    });
    expect(notifications.show).toHaveBeenCalledTimes(1);
    const message = vi.mocked(notifications.show).mock.calls[0][0]
      ?.message as string;
    expect(message).toContain('"Run for each item" has no data inputs');
    expect(message).toContain("run-order dots");
  });

  it("completes as the DATA edge aimed at when exactly one input can take it", () => {
    const store: ActivityNode = {
      id: "storeResults",
      type: "activity",
      label: "Store Results",
      activityType: "ocr.storeResults",
      parameters: {},
      metadata: { position: { x: 400, y: 200 } },
    };
    const { onConfigChange } = renderCanvas(makeConfig([store]));
    reactFlowProp<(c: Connection) => void>("onConnect")({
      source: "splitDoc",
      target: "storeResults",
      sourceHandle: "out-segments",
      targetHandle: null,
    });
    const next = onConfigChange.mock.calls[0]?.[0] as GraphWorkflowConfig;
    const target = next.nodes.storeResults;
    if (target.type !== "activity") throw new Error("unreachable");
    // `enrichmentSummary` is the only input on that card a segment list can
    // land in — so the gesture lands there instead of silently becoming an
    // execution edge.
    expect(target.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ port: "enrichmentSummary" }),
      ]),
    );
    expect(next.edges).toHaveLength(1);
  });

  it("leaves a run-order drag onto the same dot alone", () => {
    // The gesture D10 asked about must not be caught by D9's guard: it
    // starts on the node-level dot, so it is authoring order, not data.
    const { onConfigChange } = renderCanvas(makeConfig());
    reactFlowProp<ConnectEnd>("onConnectEnd")(new MouseEvent("mouseup"), {
      fromHandle: { id: "out" },
      toHandle: { id: null },
      fromNode: { id: "splitDoc" },
      toNode: { id: "loopNode" },
      isValid: true,
    });
    expect(notifications.show).not.toHaveBeenCalled();
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});
