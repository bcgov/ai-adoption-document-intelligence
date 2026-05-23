/**
 * Tests for the custom xyflow `WorkflowEdge` component (US-023).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/
 * user_stories/US-023-workflow-edge-component.md.
 *
 * `@xyflow/react` is mocked so the `BaseEdge` becomes a tagged DOM node
 * carrying its style, and the `EdgeLabelRenderer` becomes a passthrough
 * div. This lets us assert stroke colour and label text without booting
 * a real SVG layout engine.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { type EdgeProps, Position } from "@xyflow/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ComparisonExpression,
  GraphEdge,
  SwitchNode,
} from "../../../types/workflow";
import { getControlFlowVisualHints } from "../control-flow-visual-hints";
import { WorkflowEdge, type WorkflowEdgeData } from "./WorkflowEdge";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@xyflow/react", () => ({
  BaseEdge: ({
    id,
    path,
    style,
    markerEnd,
  }: {
    id?: string;
    path: string;
    style?: React.CSSProperties;
    markerEnd?: string;
  }) => (
    <div
      data-testid="base-edge"
      data-edge-id={id ?? ""}
      data-edge-path={path}
      data-marker-end={markerEnd ?? ""}
      style={style}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  getStraightPath: ({
    sourceX,
    sourceY,
    targetX,
    targetY,
  }: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  }) => {
    const labelX = (sourceX + targetX) / 2;
    const labelY = (sourceY + targetY) / 2;
    return [
      `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      labelX,
      labelY,
      Math.abs(targetX - sourceX),
      Math.abs(targetY - sourceY),
    ] as const;
  },
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SWITCH_ACCENT = getControlFlowVisualHints("switch").color;

type WorkflowEdgeProps = EdgeProps & { data?: WorkflowEdgeData };

function makeEdgeProps(
  overrides: Partial<WorkflowEdgeProps> &
    Pick<WorkflowEdgeProps, "id" | "source" | "target">,
): WorkflowEdgeProps {
  return {
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 50,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    ...overrides,
  };
}

function makeSwitchNode(overrides: Partial<SwitchNode> = {}): SwitchNode {
  return {
    id: "s1",
    type: "switch",
    label: "Switch",
    cases: [],
    metadata: {},
    ...overrides,
  };
}

function renderEdge(props: WorkflowEdgeProps) {
  return render(
    <MantineProvider>
      <svg>
        <WorkflowEdge {...props} />
      </svg>
    </MantineProvider>,
  );
}

function expectBaseEdgeStroke(expected: string) {
  const baseEdge = screen.getByTestId("base-edge");
  // jsdom serialises inline styles colour-by-colour; the easiest stable
  // check is via the rendered style attribute string.
  const styleAttr = baseEdge.getAttribute("style") ?? "";
  expect(styleAttr).toContain(`stroke: ${expected}`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("WorkflowEdge — Scenario 1: normal edge", () => {
  it("renders grey stroke and no label", () => {
    const graphEdge: GraphEdge = {
      id: "e1",
      source: "n1",
      target: "n2",
      type: "normal",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { graphEdge },
      }),
    );
    expectBaseEdgeStroke("rgb(156, 163, 175)");
    expect(screen.queryByTestId("edge-label")).not.toBeInTheDocument();
  });
});

describe("WorkflowEdge — Scenario 2: conditional edge from switch with matching case", () => {
  it("renders switch accent stroke and `case[i]: <predicate>` label", () => {
    const condition: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    const sourceSwitch = makeSwitchNode({
      id: "s1",
      cases: [{ condition, edgeId: "e-routed" }],
    });
    const graphEdge: GraphEdge = {
      id: "e-routed",
      source: "s1",
      target: "n2",
      type: "conditional",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { graphEdge, sourceSwitch },
      }),
    );
    const label = screen.getByTestId("edge-label");
    expect(label).toHaveTextContent("case[0]: ctx.requiresReview == true");
    // SWITCH_ACCENT is "#facc15" → rgb(250, 204, 21) once jsdom
    // normalises the CSSOM colour.
    expectBaseEdgeStroke("rgb(250, 204, 21)");
    // Label border uses the switch accent colour too — jsdom serialises
    // the colour as the same rgb(...) string.
    expect(label.getAttribute("style") ?? "").toContain("rgb(250, 204, 21)");
    // Sanity check the source-of-truth hex hasn't drifted away from the
    // computed rgb. If the visual-hints accent ever changes, this catches
    // it before the rgb assertions go stale.
    expect(SWITCH_ACCENT).toBe("#facc15");
  });
});

describe("WorkflowEdge — Scenario 3: conditional edge bound to switch.defaultEdge", () => {
  it("renders the literal `default` label", () => {
    const sourceSwitch = makeSwitchNode({
      id: "s1",
      defaultEdge: "e-default",
    });
    const graphEdge: GraphEdge = {
      id: "e-default",
      source: "s1",
      target: "n2",
      type: "conditional",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { graphEdge, sourceSwitch },
      }),
    );
    expect(screen.getByTestId("edge-label")).toHaveTextContent("default");
  });
});

describe("WorkflowEdge — Scenario 4: orphan conditional edge", () => {
  it("renders `case[?]` when the edge id is not in cases or defaultEdge", () => {
    const sourceSwitch = makeSwitchNode({
      id: "s1",
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "a" },
            right: { literal: 1 },
          },
          edgeId: "e-other",
        },
      ],
      defaultEdge: "e-default",
    });
    const graphEdge: GraphEdge = {
      id: "e-orphan",
      source: "s1",
      target: "n2",
      type: "conditional",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { graphEdge, sourceSwitch },
      }),
    );
    expect(screen.getByTestId("edge-label")).toHaveTextContent("case[?]");
  });
});

describe("WorkflowEdge — Scenario 5: error edge", () => {
  it("renders red stroke and `on error` label", () => {
    const graphEdge: GraphEdge = {
      id: "e-error",
      source: "n1",
      target: "fallback",
      type: "error",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { graphEdge },
      }),
    );
    // The component uses `var(--mantine-color-red-6, #e03131)` for the
    // error stroke. jsdom doesn't resolve the var token but keeps the
    // raw string in the serialised style attribute.
    expectBaseEdgeStroke("var(--mantine-color-red-6, #e03131)");
    expect(screen.getByTestId("edge-label")).toHaveTextContent("on error");
  });
});

describe("WorkflowEdge — Scenario 6: registered xyflow edge contract", () => {
  it("accepts xyflow EdgeProps + data: { graphEdge, sourceSwitch? } shape", () => {
    // This scenario asserts the contract the canvas projection will rely
    // on. The component receives the merged xyflow EdgeProps + a `data`
    // payload that carries the underlying GraphEdge (and the source
    // SwitchNode when applicable). Rendering must not throw and must
    // produce both the base edge SVG path and the label renderer outlet
    // — proving the component is usable as a registered xyflow edge type.
    const sourceSwitch = makeSwitchNode({
      id: "s1",
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "ctx.flag" },
            right: { literal: true },
          },
          edgeId: "e-routed",
        },
      ],
    });
    const graphEdge: GraphEdge = {
      id: "e-routed",
      source: "s1",
      target: "n2",
      type: "conditional",
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        sourceX: 10,
        sourceY: 20,
        targetX: 110,
        targetY: 70,
        data: { graphEdge, sourceSwitch },
      }),
    );
    const baseEdge = screen.getByTestId("base-edge");
    expect(baseEdge).toBeInTheDocument();
    // BaseEdge gets the path computed from sourceX/Y → targetX/Y.
    expect(baseEdge.getAttribute("data-edge-path")).toBe("M 10 20 L 110 70");
    expect(baseEdge.getAttribute("data-edge-id")).toBe("e-routed");
    expect(screen.getByTestId("edge-label-renderer")).toBeInTheDocument();
    expect(screen.getByTestId("edge-label")).toHaveTextContent(
      "case[0]: ctx.flag == true",
    );
  });
});
