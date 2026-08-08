/**
 * Integration tests for kind-aware activity-node port rendering on the
 * canvas.
 *
 * Originally written for the single-handle-per-side styling (US-095) and
 * the on-selection type pill (US-096); activity nodes now render one
 * kind-coloured handle per catalog port via `PortRows`, so the activity
 * assertions target `port-row-*` testids. Control-flow and source nodes
 * keep the `NodeHandles` single-handle shape — covered in
 * `WorkflowEditorCanvas.test.tsx`.
 *
 * The shared catalog is mocked with synthetic typed activities
 * (`test.*`) so each colour/cardinality branch is exercised
 * deterministically; the `document.classify` block hits the real catalog
 * entry. Kept in its own file so the mock doesn't bleed into the broader
 * `WorkflowEditorCanvas.test.tsx` suite.
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
// `useActivityCatalog` depends on `GroupProvider` (via `useGroup`). The
// integration tests here don't exercise auth state, so stub the hook with an
// empty catalog so the canvas renderers proceed past their dynamic-node
// branch unchanged. Mirrors the shim used in `WorkflowEditorV2Page.test.tsx`.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Catalog mock — synthetic typed activities covering the port-row branches
// (single typed input/output, array cardinality, multi-port, untyped). The
// mock is partial — every non-overridden surface falls through to the real
// module so the rest of the canvas behaves normally.
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
// can read the port rows' data-* attributes from the DOM. `Handle` forwards
// `style` + `isConnectable` so the assertions can probe the background /
// outline overrides and per-port drag-to-bind connectability (§6.1) on
// the dot itself.
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
    Panel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    // `children` is forwarded because the real `Handle` forwards it — that is
    // where the unconnected-port "+" invitation's bars live.
    Handle: ({
      type,
      position,
      id,
      style,
      isConnectable,
      children,
    }: {
      type: string;
      position: string;
      id?: string;
      style?: React.CSSProperties;
      isConnectable?: boolean;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
        data-isconnectable={isConnectable === false ? "false" : "true"}
        style={style}
      >
        {children}
      </div>
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    // D-1 — the canvas reads measured card sizes off the live instance to
    // size group container boxes, so `getNodes` has to exist even in a suite
    // that only cares about handle styling.
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNodes: () => [],
      setNodes: vi.fn(),
    }),
    // Stable no-op — the activity renderer calls this to re-measure
    // per-port handle bounds; jsdom has no layout to invalidate.
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
  };
});

const { mockUpdateNodeInternals } = vi.hoisted(() => ({
  mockUpdateNodeInternals: (_nodeId: string) => {
    // Intentional no-op — jsdom has no handle bounds to re-measure.
  },
}));

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

function renderCanvas(
  config: GraphWorkflowConfig,
  selectedNodeId: string | null = null,
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

function handleFor(id: string): HTMLElement {
  const el = document.querySelector(`[data-handleid='${id}']`);
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

// ---------------------------------------------------------------------------
// Per-port rows — kind colours + cardinality + connectability
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — activity port rows: single typed ports", () => {
  it("test.split renders one row per port with kind attributes and kind-coloured, connectable handles", () => {
    renderCanvas(makeConfigWith("test.split"));

    expect(screen.getByTestId("port-rows-activity_1")).toBeInTheDocument();

    const inputRow = screen.getByTestId("port-row-activity_1-in-source");
    expect(inputRow.getAttribute("data-port-kind")).toBe("MultiPageDocument");
    expect(inputRow).toHaveTextContent("Source");
    const inputHandle = handleFor("in-source");
    expect(inputHandle.getAttribute("data-testid")).toBe("handle-target-left");
    expect(inputHandle.getAttribute("data-isconnectable")).toBe("true");
    // MultiPageDocument → blue kind family.
    expect(inputHandle.style.background).toContain("--mantine-color-blue-6");

    const outputRow = screen.getByTestId("port-row-activity_1-out-segments");
    expect(outputRow.getAttribute("data-port-kind")).toBe("Segment[]");
    expect(outputRow).toHaveTextContent("Segments");
    const outputHandle = handleFor("out-segments");
    expect(outputHandle.getAttribute("data-testid")).toBe(
      "handle-source-right",
    );
    expect(outputHandle.getAttribute("data-isconnectable")).toBe("true");
    // Segment[] → green kind family with the doubled array outline.
    expect(outputHandle.style.background).toContain("--mantine-color-green-6");
    expect(outputHandle.style.outline).toContain("2px solid");
  });

  it("flags an unbound required input with the amber needs-source ring", () => {
    renderCanvas(makeConfigWith("test.split"));
    // The fixture node has no `inputs[]` bindings, so the required
    // `source` port has no wire and no persisted binding.
    const inputRow = screen.getByTestId("port-row-activity_1-in-source");
    expect(inputRow.getAttribute("data-needs-source")).toBe("true");
    expect(handleFor("in-source").style.boxShadow).toContain("yellow");
    // Outputs never need a source.
    const outputRow = screen.getByTestId("port-row-activity_1-out-segments");
    expect(outputRow.getAttribute("data-needs-source")).toBe("false");
  });
});

describe("WorkflowEditorCanvas — activity port rows: multi-port nodes get one coloured handle per port", () => {
  it("test.classify-multi renders all four rows, each coloured by its own kind", () => {
    renderCanvas(makeConfigWith("test.classify-multi"));

    expect(
      screen
        .getByTestId("port-row-activity_1-in-segment")
        .getAttribute("data-port-kind"),
    ).toBe("Segment");
    expect(
      screen
        .getByTestId("port-row-activity_1-in-ocr")
        .getAttribute("data-port-kind"),
    ).toBe("OcrResult");
    expect(
      screen
        .getByTestId("port-row-activity_1-out-classification")
        .getAttribute("data-port-kind"),
    ).toBe("Classification");
    expect(
      screen
        .getByTestId("port-row-activity_1-out-validation")
        .getAttribute("data-port-kind"),
    ).toBe("ValidationResult");

    // Per-port colours replace the old side-level gray collapse.
    expect(handleFor("in-segment").style.background).toContain(
      "--mantine-color-green-6",
    );
    expect(handleFor("in-ocr").style.background).toContain(
      "--mantine-color-violet-6",
    );
    expect(handleFor("out-classification").style.background).toContain(
      "--mantine-color-yellow-6",
    );
  });

  it("test.untyped (no kinds declared) renders rows as the gray Artifact wildcard", () => {
    renderCanvas(makeConfigWith("test.untyped"));

    const inputRow = screen.getByTestId("port-row-activity_1-in-in");
    expect(inputRow.getAttribute("data-port-kind")).toBe("Artifact");
    expect(handleFor("in-in").style.background).toContain(
      "--mantine-color-gray-6",
    );
    const outputRow = screen.getByTestId("port-row-activity_1-out-out");
    expect(outputRow.getAttribute("data-port-kind")).toBe("Artifact");
    expect(handleFor("out-out").style.background).toContain(
      "--mantine-color-gray-6",
    );
  });
});

// ---------------------------------------------------------------------------
// Node-level flow handles — the node-to-node connect gesture + existing-edge
// anchors stay on the unnamed target / `out` source handles; per-port
// handles carry the separate drag-to-bind gesture (§6.1).
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — activity node-level handles stay intact", () => {
  it("renders the unnamed left target handle and the `out` right source handle alongside the rows", () => {
    renderCanvas(makeConfigWith("test.split"));
    const nodeEl = screen.getByTestId("rf-node-activity_1");

    const targets = Array.from(
      nodeEl.querySelectorAll("[data-testid='handle-target-left']"),
    );
    // One per-port input handle + the unnamed node-level target.
    // React omits the attribute when `id` is undefined (`?? null`), so the
    // node-level default target is the one with no data-handleid at all.
    const nodeLevelTarget = targets.find(
      (el) => el.getAttribute("data-handleid") === null,
    );
    expect(nodeLevelTarget).toBeDefined();
    expect(nodeLevelTarget?.getAttribute("data-isconnectable")).toBe("true");

    const sources = Array.from(
      nodeEl.querySelectorAll("[data-testid='handle-source-right']"),
    );
    const nodeLevelSource = sources.find(
      (el) => el.getAttribute("data-handleid") === "out",
    );
    expect(nodeLevelSource).toBeDefined();
    expect(nodeLevelSource?.getAttribute("data-isconnectable")).toBe("true");
  });

  it("mounts the node-level handles FIRST in DOM order for their type (xyflow default-edge resolution picks bounds[0])", () => {
    // xyflow resolves an edge with no sourceHandle/targetHandle to the
    // FIRST handle of the required type in DOM order (`getHandle` →
    // `bounds[0]` from an unsorted querySelectorAll). If a per-port row
    // handle ever renders before the node-level ones, every existing edge
    // silently re-anchors onto the first row dot.
    renderCanvas(makeConfigWith("test.split"));
    const nodeEl = screen.getByTestId("rf-node-activity_1");

    const firstTarget = nodeEl.querySelector(
      "[data-testid='handle-target-left']",
    );
    expect(firstTarget?.getAttribute("data-handleid")).toBeNull();

    const firstSource = nodeEl.querySelector(
      "[data-testid='handle-source-right']",
    );
    expect(firstSource?.getAttribute("data-handleid")).toBe("out");
  });
});

// ---------------------------------------------------------------------------
// Pills are superseded by rows on activity nodes (US-096 retired there).
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — activity nodes render no type pill", () => {
  it("selected typed activity renders port rows, not the node-type-pill-row", () => {
    renderCanvas(makeConfigWith("test.classify-multi"), "activity_1");
    expect(screen.queryByTestId("node-type-pill-row")).not.toBeInTheDocument();
    expect(screen.getByTestId("port-rows-activity_1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Real catalog entry — `document.classify` (typed in US-102) renders one
// row per shipped port descriptor without any synthetic mocking.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — document.classify port rows come from the real catalog", () => {
  it("renders rows for in:ocrResult/in:segment and out:segmentType/out:confidence/out:matchedRule", () => {
    renderCanvas(makeConfigWith("document.classify"));

    expect(
      screen
        .getByTestId("port-row-activity_1-in-ocrResult")
        .getAttribute("data-port-kind"),
    ).toBe("OcrResult");
    expect(
      screen
        .getByTestId("port-row-activity_1-in-segment")
        .getAttribute("data-port-kind"),
    ).toBe("DocumentSegment");
    expect(
      screen
        .getByTestId("port-row-activity_1-out-segmentType")
        .getAttribute("data-port-kind"),
    ).toBe("ClassificationLabel");
    expect(
      screen
        .getByTestId("port-row-activity_1-out-confidence")
        .getAttribute("data-port-kind"),
    ).toBe("Artifact");
    expect(
      screen
        .getByTestId("port-row-activity_1-out-matchedRule")
        .getAttribute("data-port-kind"),
    ).toBe("Artifact");
  });
});

// ---------------------------------------------------------------------------
// The "+" invitation on unconnected ports (Inderdeep UX walkthrough
// 2026-08-06, item 3). End-to-end through the canvas projection, so the
// `computePortRows` → `PortRows` wiring of `connected`/`required` is covered
// as it actually renders, not only in the two unit suites.
// ---------------------------------------------------------------------------

describe("WorkflowEditorCanvas — unconnected required ports invite with a '+'", () => {
  function plusBarsIn(handleId: string): HTMLElement[] {
    return Array.from(handleFor(handleId).querySelectorAll("[data-port-plus]"));
  }

  it("draws the plus on every required port of a freshly-dropped node, inputs and outputs alike", () => {
    // The fixture node has no bindings and the config has no wires, so every
    // port is unconnected — exactly the state a user sees after dropping a
    // node onto the canvas, which is the moment Inderdeep was describing.
    renderCanvas(makeConfigWith("test.classify-multi"));

    for (const handleId of ["in-segment", "in-ocr", "out-classification"]) {
      expect(plusBarsIn(handleId)).toHaveLength(2);
      expect(
        screen
          .getByTestId(`port-row-activity_1-${handleId}`)
          .getAttribute("data-invites-connection"),
      ).toBe("true");
    }
  });

  it("leaves the optional `validation` output as a plain circle", () => {
    renderCanvas(makeConfigWith("test.classify-multi"));
    expect(plusBarsIn("out-validation")).toHaveLength(0);
    expect(
      screen
        .getByTestId("port-row-activity_1-out-validation")
        .getAttribute("data-invites-connection"),
    ).toBe("false");
  });

  it("keeps the port's family colour under the plus", () => {
    // The colour encodes what can connect to what; the glyph is a knockout in
    // the body colour, so it must not repaint the dot.
    renderCanvas(makeConfigWith("test.split"));
    const inputHandle = handleFor("in-source");
    expect(inputHandle.style.background).toContain("--mantine-color-blue-6");
    expect(inputHandle.querySelectorAll("[data-port-plus]")).toHaveLength(2);
    const outputHandle = handleFor("out-segments");
    expect(outputHandle.style.background).toContain("--mantine-color-green-6");
    // The array-cardinality outline survives alongside the glyph.
    expect(outputHandle.style.outline).toContain("2px solid");
    expect(outputHandle.querySelectorAll("[data-port-plus]")).toHaveLength(2);
  });
});
