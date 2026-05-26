/**
 * Canvas-integration smoke tests for the on-selection type pill (US-096).
 *
 * The shared catalog has no `PortDescriptor.kind` declarations at the
 * time this story ships (the fan-out happens in US-101 / US-102 —
 * Milestone F), so this file selectively mocks `@ai-di/graph-workflow`
 * to inject synthetic typed activities — same pattern as
 * `WorkflowEditorCanvas.handle-style.test.tsx`.
 *
 * Unlike the handle-style suite, the xyflow mock here propagates the
 * `selected` flag from `props.nodes[].selected` through to each
 * registered renderer so we can assert pill-visibility transitions.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";

// `useActivityCatalog` depends on `GroupProvider` (via `useGroup`). The
// integration test doesn't exercise auth state, so stub the hook with an
// empty catalog so the canvas renderers proceed past their dynamic-node
// branch unchanged.
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

vi.mock("@ai-di/graph-workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-di/graph-workflow")>();

  type CatalogEntry = ReturnType<typeof actual.getActivityCatalogEntry>;

  const baseEntry = {
    activityType: "",
    displayName: "Synthetic typed activity",
    category: "Document Handling" as const,
    description: "",
    iconHint: "document",
    colorHint: "blue",
    parametersSchema: actual.documentClassifyParametersSchema,
  };

  const synthetic: Record<string, NonNullable<CatalogEntry>> = {
    "test.split": {
      ...baseEntry,
      activityType: "test.split",
      inputs: [
        {
          name: "source",
          label: "Source",
          required: true,
          kind: "MultiPageDocument",
        },
      ],
      outputs: [
        {
          name: "segments",
          label: "Segments",
          required: true,
          kind: "Segment[]",
        },
      ],
    } satisfies NonNullable<CatalogEntry>,
    "test.classify-multi": {
      ...baseEntry,
      activityType: "test.classify-multi",
      inputs: [
        { name: "ocrResult", label: "OCR", required: true, kind: "OcrResult" },
        { name: "segment", label: "Segment", required: true, kind: "Segment" },
      ],
      outputs: [
        {
          name: "segmentType",
          label: "Type",
          required: true,
          kind: "Classification",
        },
        {
          name: "confidence",
          label: "Confidence",
          required: false,
          kind: "Artifact",
        },
        {
          name: "matchedRule",
          label: "Rule",
          required: false,
          kind: "Artifact",
        },
      ],
    } satisfies NonNullable<CatalogEntry>,
    "test.untyped": {
      ...baseEntry,
      activityType: "test.untyped",
      inputs: [{ name: "in", label: "In", required: true }],
      outputs: [{ name: "out", label: "Out", required: true }],
    } satisfies NonNullable<CatalogEntry>,
  };

  return {
    ...actual,
    getActivityCatalogEntry: (activityType: string) => {
      if (activityType in synthetic) return synthetic[activityType];
      return actual.getActivityCatalogEntry(activityType);
    },
  };
});

vi.mock("@xyflow/react", () => {
  interface MockNodeProps {
    id: string;
    type: string;
    data: Record<string, unknown>;
    selected?: boolean;
  }
  const useNodesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    const onChange = () => {
      // No-op for tests — xyflow internal node changes aren't simulated.
    };
    return [state, setState, onChange] as const;
  };
  const useEdgesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    const onChange = () => {
      // No-op for tests — xyflow internal edge changes aren't simulated.
    };
    return [state, setState, onChange] as const;
  };
  return {
    ReactFlow: (props: Record<string, unknown>) => {
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
      style,
    }: {
      type: string;
      position: string;
      id?: string;
      style?: React.CSSProperties;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
        style={style}
      />
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    useReactFlow: () => ({ fitView: vi.fn() }),
  };
});

// eslint-disable-next-line import/first
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas";

function makeConfigWith(activityType: string): GraphWorkflowConfig {
  const activity: ActivityNode = {
    id: "activity_1",
    type: "activity",
    label: "Synthetic",
    activityType,
    parameters: {},
    metadata: { position: { x: 0, y: 0 } },
  };
  const nodes: Record<string, GraphNode> = { [activity.id]: activity };
  return {
    schemaVersion: "1.0",
    metadata: { name: "test", version: "1.0.0" },
    ctx: {},
    nodes,
    edges: [],
    entryNodeId: activity.id,
  };
}

function renderCanvas(
  config: GraphWorkflowConfig,
  selectedNodeId: string | null,
) {
  return render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={config}
        selectedNodeId={selectedNodeId}
        onConfigChange={vi.fn()}
        onSelectNode={vi.fn()}
      />
    </MantineProvider>,
  );
}

describe("WorkflowEditorCanvas — US-096 Scenario 1: single-port pill renders under the node", () => {
  it("renders a single-port arrow row with uppercase MULTIPAGEDOCUMENT → SEGMENT[] for test.split when selected", () => {
    const { container } = renderCanvas(
      makeConfigWith("test.split"),
      "activity_1",
    );
    expect(
      container.querySelector('[data-pill-anchor="under"]'),
    ).toBeInTheDocument();
    const pillRow = screen.getByTestId("node-type-pill-row");
    expect(pillRow.getAttribute("data-shape")).toBe("arrow");

    const inputBadge = pillRow.querySelector("[data-pill-direction='input']");
    expect(inputBadge).toHaveTextContent("MULTIPAGEDOCUMENT");
    expect(inputBadge?.getAttribute("data-pill-color")).toBe("blue");

    const outputBadge = pillRow.querySelector("[data-pill-direction='output']");
    expect(outputBadge).toHaveTextContent("SEGMENT[]");
    expect(outputBadge?.getAttribute("data-pill-color")).toBe("green");

    expect(screen.getByTestId("pill-row-arrow")).toHaveTextContent("→");
  });
});

describe("WorkflowEditorCanvas — US-096 Scenario 2: multi-port pill stacks inputs + outputs under the node", () => {
  it("renders a stacked pill row with one row per port and per-row colour coding", () => {
    renderCanvas(makeConfigWith("test.classify-multi"), "activity_1");
    const pillRow = screen.getByTestId("node-type-pill-row");
    expect(pillRow.getAttribute("data-shape")).toBe("stacked");

    const segmentType = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='segmentType']",
    );
    const confidence = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='confidence']",
    );
    const matchedRule = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='matchedRule']",
    );

    expect(segmentType).toHaveTextContent("out:segmentType: Classification");
    expect(confidence).toHaveTextContent("out:confidence: Artifact");
    expect(matchedRule).toHaveTextContent("out:matchedRule: Artifact");

    // Classification → yellow; Artifact wildcards → gray.
    expect(segmentType?.getAttribute("data-pill-color")).toBe("yellow");
    expect(confidence?.getAttribute("data-pill-color")).toBe("gray");
    expect(matchedRule?.getAttribute("data-pill-color")).toBe("gray");

    const ocrRow = pillRow.querySelector(
      "[data-pill-direction='input'][data-pill-port='ocrResult']",
    );
    const segmentRow = pillRow.querySelector(
      "[data-pill-direction='input'][data-pill-port='segment']",
    );
    expect(ocrRow).toHaveTextContent("in:ocrResult: OcrResult");
    expect(segmentRow).toHaveTextContent("in:segment: Segment");
    expect(ocrRow?.getAttribute("data-pill-color")).toBe("violet");
    expect(segmentRow?.getAttribute("data-pill-color")).toBe("green");
  });
});

describe("WorkflowEditorCanvas — US-096 Scenario 3: pill hides when node is deselected", () => {
  it("does not render the pill when no node is selected", () => {
    const { container } = renderCanvas(makeConfigWith("test.split"), null);
    expect(
      container.querySelector('[data-pill-anchor="under"]'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("node-type-pill-row")).not.toBeInTheDocument();
  });
});

describe("WorkflowEditorCanvas — US-102: document.classify selection pill expands to the full signature (real catalog entry)", () => {
  it("stacked pill lists in:ocrResult: OcrResult (violet) + in:segment: Segment (green); out:segmentType: Classification (yellow) + out:confidence/out:matchedRule: Artifact (gray)", () => {
    renderCanvas(makeConfigWith("document.classify"), "activity_1");
    const pillRow = screen.getByTestId("node-type-pill-row");
    expect(pillRow.getAttribute("data-shape")).toBe("stacked");

    const ocrRow = pillRow.querySelector(
      "[data-pill-direction='input'][data-pill-port='ocrResult']",
    );
    const segmentRow = pillRow.querySelector(
      "[data-pill-direction='input'][data-pill-port='segment']",
    );
    expect(ocrRow).toHaveTextContent("in:ocrResult: OcrResult");
    expect(segmentRow).toHaveTextContent("in:segment: Segment");
    expect(ocrRow?.getAttribute("data-pill-color")).toBe("violet");
    expect(segmentRow?.getAttribute("data-pill-color")).toBe("green");

    const segmentType = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='segmentType']",
    );
    const confidence = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='confidence']",
    );
    const matchedRule = pillRow.querySelector(
      "[data-pill-direction='output'][data-pill-port='matchedRule']",
    );
    expect(segmentType).toHaveTextContent("out:segmentType: Classification");
    expect(confidence).toHaveTextContent("out:confidence: Artifact");
    expect(matchedRule).toHaveTextContent("out:matchedRule: Artifact");
    // Classification → yellow (Mantine's amber substitute); Artifact wildcards → gray.
    expect(segmentType?.getAttribute("data-pill-color")).toBe("yellow");
    expect(confidence?.getAttribute("data-pill-color")).toBe("gray");
    expect(matchedRule?.getAttribute("data-pill-color")).toBe("gray");
  });
});

describe("WorkflowEditorCanvas — US-096 Scenario 4: pill renders nothing when no ports declare a kind", () => {
  it("renders no pill row for an un-typed activity (legacy descriptors) even when selected", () => {
    const { container } = renderCanvas(
      makeConfigWith("test.untyped"),
      "activity_1",
    );
    // The under-anchor wrapper is still rendered (selected === true), but the
    // child `NodeTypePillRow` returns null so the testid does not appear.
    expect(screen.queryByTestId("node-type-pill-row")).not.toBeInTheDocument();
    const underAnchor = container.querySelector('[data-pill-anchor="under"]');
    expect(underAnchor).toBeInTheDocument();
    expect(underAnchor?.firstChild).toBeNull();

    // US-095's gray handle + multi-port tooltip stays the only signal.
    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(inputWrap.getAttribute("data-port-multi")).toBe("true");
    expect(inputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple inputs — select node to view all",
    );
    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(outputWrap.getAttribute("data-port-multi")).toBe("true");
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple outputs — select node to view all",
    );
  });
});
