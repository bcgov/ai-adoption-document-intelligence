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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import type { DataWire, StructuralWire } from "./derive-wires";
import {
  WorkflowEdge,
  type WorkflowEdgeData,
  wireTooltip,
} from "./WorkflowEdge";

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
  // `WirePeekPopover` (mounted when a data edge is selected) calls
  // `useActivityOutputPreview` → `useQuery`, so the harness must supply a
  // QueryClient even though the no-run branch never fires a fetch.
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <svg>
          <WorkflowEdge {...props} />
        </svg>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function expectBaseEdgeStroke(expected: string) {
  const baseEdge = screen.getByTestId("base-edge");
  // jsdom serialises inline styles colour-by-colour; the easiest stable
  // check is via the rendered style attribute string.
  const styleAttr = baseEdge.getAttribute("style") ?? "";
  expect(styleAttr).toContain(`stroke: ${expected}`);
}

/** The `<g>` wrapper carrying `data-wire-variant` / `data-provenance`. */
function getWireGroup(container: HTMLElement): Element {
  const group = container.querySelector("g[data-wire-variant]");
  if (!group) throw new Error("wire <g> wrapper not rendered");
  return group;
}

function makeDataWire(overrides: Partial<DataWire> = {}): DataWire {
  return {
    variant: "data",
    id: "wire:B:fileData",
    source: "A",
    sourcePort: "preparedData",
    target: "B",
    targetPort: "fileData",
    kind: "Document",
    pinned: false,
    auto: true,
    via: "nearest-kind",
    edgeId: "e1",
    ctxKey: "__auto.A.preparedData",
    ...overrides,
  };
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
  it("renders switch accent stroke and `if <predicate>` label", () => {
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
    expect(label).toHaveTextContent("if ctx.requiresReview is true");
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
  it("renders the literal `otherwise` label", () => {
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
    expect(screen.getByTestId("edge-label")).toHaveTextContent("otherwise");
  });
});

describe("WorkflowEdge — Scenario 4: orphan conditional edge", () => {
  it("renders `(unmatched)` when the edge id is not in cases or defaultEdge", () => {
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
    expect(screen.getByTestId("edge-label")).toHaveTextContent("(unmatched)");
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

describe("WorkflowEdge — wire variants (port-to-port wires phase)", () => {
  it("data wire: kind-coloured stroke, no label, provenance attrs + title tooltip", () => {
    const wire = makeDataWire({ kind: "Document", via: "name-match" });
    const { container } = renderEdge(
      makeEdgeProps({
        id: wire.id,
        source: wire.source,
        target: wire.target,
        data: { wire },
      }),
    );
    // `Document` → registry colour "blue" → the same shade-6 Mantine
    // variable the port dots use.
    expectBaseEdgeStroke("var(--mantine-color-blue-6, blue)");
    expect(screen.queryByTestId("edge-label")).not.toBeInTheDocument();
    const group = getWireGroup(container);
    expect(group.getAttribute("data-wire-variant")).toBe("data");
    expect(group.getAttribute("data-provenance")).toBe("auto:name-match");
    const title = group.querySelector("title");
    expect(title?.textContent).toBe(
      'Connected automatically — matched by name "fileData"',
    );
  });

  it("data wire provenance: pinned / auto / manual variants", () => {
    const pinned = renderEdge(
      makeEdgeProps({
        id: "w1",
        source: "A",
        target: "B",
        data: { wire: makeDataWire({ pinned: true, via: undefined }) },
      }),
    );
    expect(getWireGroup(pinned.container).getAttribute("data-provenance")).toBe(
      "pinned",
    );
    pinned.unmount();

    const auto = renderEdge(
      makeEdgeProps({
        id: "w2",
        source: "A",
        target: "B",
        data: { wire: makeDataWire({ via: undefined }) },
      }),
    );
    expect(getWireGroup(auto.container).getAttribute("data-provenance")).toBe(
      "auto",
    );
    auto.unmount();

    const manual = renderEdge(
      makeEdgeProps({
        id: "w3",
        source: "A",
        target: "B",
        data: {
          wire: makeDataWire({
            auto: false,
            via: undefined,
            ctxKey: "sharedBlob",
          }),
        },
      }),
    );
    expect(getWireGroup(manual.container).getAttribute("data-provenance")).toBe(
      "manual",
    );
  });

  it("sequence wire: grey dashed stroke, no label, data-wire-variant='sequence'", () => {
    const graphEdge: GraphEdge = {
      id: "e-seq",
      source: "n1",
      target: "n2",
      type: "normal",
    };
    const wire: StructuralWire = {
      variant: "sequence",
      id: graphEdge.id,
      edge: graphEdge,
    };
    const { container } = renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { wire, graphEdge },
      }),
    );
    expectBaseEdgeStroke("rgb(156, 163, 175)");
    const styleAttr =
      screen.getByTestId("base-edge").getAttribute("style") ?? "";
    expect(styleAttr).toContain("stroke-dasharray: 6 4");
    expect(screen.queryByTestId("edge-label")).not.toBeInTheDocument();
    expect(getWireGroup(container).getAttribute("data-wire-variant")).toBe(
      "sequence",
    );
    expect(getWireGroup(container).hasAttribute("data-provenance")).toBe(false);
  });

  it("error structural wire keeps today's rendering plus its variant attr", () => {
    const graphEdge: GraphEdge = {
      id: "e-err",
      source: "n1",
      target: "fallback",
      type: "error",
    };
    const wire: StructuralWire = {
      variant: "error",
      id: graphEdge.id,
      edge: graphEdge,
    };
    const { container } = renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { wire, graphEdge },
      }),
    );
    expectBaseEdgeStroke("var(--mantine-color-red-6, #e03131)");
    expect(screen.getByTestId("edge-label")).toHaveTextContent("on error");
    expect(getWireGroup(container).getAttribute("data-wire-variant")).toBe(
      "error",
    );
  });

  it("run-time isActive blue override wins over the data-wire stroke", () => {
    renderEdge(
      makeEdgeProps({
        id: "w1",
        source: "A",
        target: "B",
        // `kind: undefined` → gray stroke when inactive, so the blue
        // active override is unambiguous in the assertion below.
        data: { wire: makeDataWire({ kind: undefined }), isActive: true },
      }),
    );
    expectBaseEdgeStroke("var(--mantine-color-blue-6, #228be6)");
    const styleAttr =
      screen.getByTestId("base-edge").getAttribute("style") ?? "";
    expect(styleAttr).toContain("stroke-width: 2.5");
    expect(styleAttr).not.toContain("stroke-dasharray");
  });
});

describe("WorkflowEdge — selection indicator", () => {
  it("selected sequence wire: thicker stroke + glow, keeps grey dash", () => {
    const graphEdge: GraphEdge = {
      id: "e-seq",
      source: "n1",
      target: "n2",
      type: "normal",
    };
    const wire: StructuralWire = {
      variant: "sequence",
      id: graphEdge.id,
      edge: graphEdge,
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { wire, graphEdge },
        selected: true,
      }),
    );
    const styleAttr =
      screen.getByTestId("base-edge").getAttribute("style") ?? "";
    expect(styleAttr).toContain("stroke-width: 3.5");
    // Selection is additive — the sequence dash + grey stroke survive.
    expect(styleAttr).toContain("stroke-dasharray: 6 4");
    expect(styleAttr).toContain("stroke: rgb(156, 163, 175)");
    expect(styleAttr).toContain("drop-shadow");
  });

  it("unselected sequence wire keeps the default 2px stroke, no glow", () => {
    const graphEdge: GraphEdge = {
      id: "e-seq",
      source: "n1",
      target: "n2",
      type: "normal",
    };
    const wire: StructuralWire = {
      variant: "sequence",
      id: graphEdge.id,
      edge: graphEdge,
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { wire, graphEdge },
        selected: false,
      }),
    );
    const styleAttr =
      screen.getByTestId("base-edge").getAttribute("style") ?? "";
    expect(styleAttr).toContain("stroke-width: 2");
    expect(styleAttr).not.toContain("stroke-width: 3.5");
    expect(styleAttr).not.toContain("drop-shadow");
  });

  it("selected data wire also reads as selected (thicker stroke + glow)", () => {
    const wire = makeDataWire({ kind: undefined });
    renderEdge(
      makeEdgeProps({
        id: wire.id,
        source: wire.source,
        target: wire.target,
        data: { wire },
        selected: true,
      }),
    );
    const styleAttr =
      screen.getByTestId("base-edge").getAttribute("style") ?? "";
    expect(styleAttr).toContain("stroke-width: 3.5");
    expect(styleAttr).toContain("drop-shadow");
  });
});

describe("wireTooltip", () => {
  it("pinned wins over every other flag", () => {
    expect(wireTooltip(makeDataWire({ pinned: true, via: "name-match" }))).toBe(
      "Pinned by you",
    );
  });

  it("name-match names the target port", () => {
    expect(wireTooltip(makeDataWire({ via: "name-match" }))).toBe(
      'Connected automatically — matched by name "fileData"',
    );
  });

  it("map-item explains the loop item", () => {
    expect(wireTooltip(makeDataWire({ via: "map-item" }))).toBe(
      "Connected automatically — item from the loop",
    );
  });

  it("auto without a specific via describes the nearest producer by kind", () => {
    expect(wireTooltip(makeDataWire({ via: "nearest-kind" }))).toBe(
      "Connected automatically — nearest Document producer",
    );
    expect(wireTooltip(makeDataWire({ via: undefined }))).toBe(
      "Connected automatically — nearest Document producer",
    );
    expect(wireTooltip(makeDataWire({ via: undefined, kind: undefined }))).toBe(
      "Connected automatically — nearest compatible producer",
    );
  });

  it("manual bindings surface the ctx key", () => {
    expect(
      wireTooltip(
        makeDataWire({ auto: false, via: undefined, ctxKey: "sharedBlob" }),
      ),
    ).toBe("Connected — via sharedBlob");
  });
});

describe("wire data peek mount", () => {
  it("renders the peek popover when a data edge is selected", () => {
    const wire = makeDataWire();
    renderEdge(
      makeEdgeProps({
        id: wire.id,
        source: wire.source,
        target: wire.target,
        data: { wire },
        selected: true,
      }),
    );
    expect(screen.getByTestId("wire-peek-popover")).toBeInTheDocument();
  });

  it("does not render the popover when the data edge is unselected", () => {
    const wire = makeDataWire();
    renderEdge(
      makeEdgeProps({
        id: wire.id,
        source: wire.source,
        target: wire.target,
        data: { wire },
        selected: false,
      }),
    );
    expect(screen.queryByTestId("wire-peek-popover")).toBeNull();
  });

  it("does not render the popover for a selected sequence wire", () => {
    const graphEdge: GraphEdge = {
      id: "e-seq",
      source: "A",
      target: "B",
      type: "normal",
    };
    const wire: StructuralWire = {
      variant: "sequence",
      id: graphEdge.id,
      edge: graphEdge,
    };
    renderEdge(
      makeEdgeProps({
        id: graphEdge.id,
        source: graphEdge.source,
        target: graphEdge.target,
        data: { wire, graphEdge },
        selected: true,
      }),
    );
    expect(screen.queryByTestId("wire-peek-popover")).toBeNull();
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
      "if ctx.flag is true",
    );
  });
});
