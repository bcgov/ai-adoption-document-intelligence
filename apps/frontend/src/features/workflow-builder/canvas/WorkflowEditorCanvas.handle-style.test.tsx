/**
 * Integration tests for kind-aware canvas handle styling (US-095).
 *
 * The shared catalog has no `PortDescriptor.kind` declarations at the time
 * this story ships (the fan-out happens in US-101 / US-102 — Milestone F).
 * So these tests selectively mock `@ai-di/graph-workflow` to inject
 * synthetic typed activities and assert that the canvas renders the
 * expected handle colour + tooltip text per scenario.
 *
 * Kept in its own file so the mock doesn't bleed into the broader
 * `WorkflowEditorCanvas.test.tsx` suite — that file relies on the real
 * catalog for its existing scenarios.
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

// ---------------------------------------------------------------------------
// Catalog mock — synthetic typed activities for the four canvas-styling
// branches the helper supports (single-typed-output / array-cardinality /
// multi-typed / untyped). The mock is partial — every non-overridden
// surface falls through to the real module so the rest of the canvas
// behaves normally.
// ---------------------------------------------------------------------------

vi.mock("@ai-di/graph-workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-di/graph-workflow")>();

  type CatalogEntry = ReturnType<typeof actual.getActivityCatalogEntry>;

  // Use a permissive Zod-ish stub for the parametersSchema field — the
  // canvas's projection code only reads `inputs[]` / `outputs[]` so the
  // schema shape doesn't matter for these tests. Casting to the catalog
  // entry type once at construction time keeps the rest of the test code
  // typed.
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
        { name: "segment", label: "Segment", required: true, kind: "Segment" },
        { name: "ocr", label: "OCR result", required: true, kind: "OcrResult" },
      ],
      outputs: [
        {
          name: "classification",
          label: "Classification",
          required: true,
          kind: "Classification",
        },
        {
          name: "validation",
          label: "Validation",
          required: false,
          kind: "ValidationResult",
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

// ---------------------------------------------------------------------------
// xyflow mock — mirrors the harness used by `WorkflowEditorCanvas.test.tsx`
// so each registered node-type renders directly through `nodeTypes` and we
// can read the kind-aware wrapper's data-* attributes from the DOM.
// `Handle` forwards `style` so the assertion can probe the background +
// outline overrides on the dot itself.
// ---------------------------------------------------------------------------

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

// Imported AFTER `vi.mock` calls so the mocked module is what the canvas
// resolves at module load.
// eslint-disable-next-line import/first
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

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

function renderCanvas(config: GraphWorkflowConfig) {
  return render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={config}
        selectedNodeId={null}
        onConfigChange={vi.fn()}
        onSelectNode={vi.fn()}
      />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// US-095 — canvas wiring of `computeHandleStyle`
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-095 Scenario 1: single typed port", () => {
  it("test.split (one MultiPageDocument input, one Segment[] output) renders blue input + green array-outline output", () => {
    renderCanvas(makeConfigWith("test.split"));

    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-color")).toBe("blue");
    expect(inputWrap.getAttribute("data-port-array")).toBe("false");
    expect(inputWrap.getAttribute("data-port-multi")).toBe("false");
    expect(inputWrap.getAttribute("data-port-tooltip")).toBe(
      "MultiPageDocument",
    );

    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-color")).toBe("green");
    expect(outputWrap.getAttribute("data-port-array")).toBe("true");
    expect(outputWrap.getAttribute("data-port-multi")).toBe("false");
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe("Segment[]");

    // The doubled-outline visual cue rides on the handle dot's `outline`
    // style — confirms the array cardinality renders distinctly.
    const sourceHandle = outputWrap.querySelector(
      "[data-testid='handle-source-right']",
    );
    expect(sourceHandle).not.toBeNull();
    const style = (sourceHandle as HTMLElement).getAttribute("style") ?? "";
    expect(style).toContain("outline");
  });
});

describe("WorkflowEditorCanvas — US-095 Scenario 2: multi/untyped stay gray", () => {
  it("test.classify-multi (two typed inputs + two typed outputs) renders gray on BOTH sides", () => {
    renderCanvas(makeConfigWith("test.classify-multi"));

    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(inputWrap.getAttribute("data-port-multi")).toBe("true");

    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(outputWrap.getAttribute("data-port-multi")).toBe("true");
  });

  it("test.untyped (no kinds declared) renders gray multi-port on both sides", () => {
    renderCanvas(makeConfigWith("test.untyped"));

    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(inputWrap.getAttribute("data-port-multi")).toBe("true");
    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(outputWrap.getAttribute("data-port-multi")).toBe("true");
  });
});

describe("WorkflowEditorCanvas — US-095 Scenario 3: tooltip is the kind literal verbatim", () => {
  it("tooltip text on a single-typed output handle is the declared kind including the `[]` suffix", () => {
    renderCanvas(makeConfigWith("test.split"));
    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    // The Mantine Tooltip mounts the label into the wrapped element's
    // data-* attribute via our `data-port-tooltip` mirror so the test
    // can read it directly. The same string is passed to Tooltip's
    // `label` prop.
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe("Segment[]");
  });
});

describe("WorkflowEditorCanvas — US-095 Scenario 4: multi-port tooltip explains the indirection", () => {
  it("multi-port output tooltip reads 'Multiple outputs — select node to view all'", () => {
    renderCanvas(makeConfigWith("test.classify-multi"));
    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple outputs — select node to view all",
    );
  });

  it("multi-port input tooltip reads 'Multiple inputs — select node to view all'", () => {
    renderCanvas(makeConfigWith("test.classify-multi"));
    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple inputs — select node to view all",
    );
  });

  it("legacy untyped activity falls back to the same multi-port tooltip text", () => {
    renderCanvas(makeConfigWith("test.untyped"));
    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple inputs — select node to view all",
    );
    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple outputs — select node to view all",
    );
  });
});

// ---------------------------------------------------------------------------
// US-102 — real `document.classify` catalog entry drives the multi-port
// gray rendering on BOTH sides. Unlike the `test.*` fixtures above, this
// scenario hits the production catalog (US-102 typed the entry with
// OcrResult + Segment inputs and Classification + Artifact + Artifact
// outputs), so the multi-port branch of `computeHandleStyle` fires
// against the real shipped data.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — US-102: document.classify renders gray multi-port handles on both sides", () => {
  it("renders gray input handle with the 'Multiple inputs' tooltip (real catalog entry, 2 typed inputs of distinct kinds)", () => {
    renderCanvas(makeConfigWith("document.classify"));

    const inputWrap = screen.getByTestId("port-tooltip-input-activity_1");
    expect(inputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(inputWrap.getAttribute("data-port-multi")).toBe("true");
    expect(inputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple inputs — select node to view all",
    );
  });

  it("renders gray output handle with the 'Multiple outputs' tooltip (real catalog entry, 3 typed outputs)", () => {
    renderCanvas(makeConfigWith("document.classify"));

    const outputWrap = screen.getByTestId("port-tooltip-output-activity_1");
    expect(outputWrap.getAttribute("data-port-color")).toBe("gray");
    expect(outputWrap.getAttribute("data-port-multi")).toBe("true");
    expect(outputWrap.getAttribute("data-port-tooltip")).toBe(
      "Multiple outputs — select node to view all",
    );
  });
});
