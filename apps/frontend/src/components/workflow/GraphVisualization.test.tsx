import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GraphWorkflowConfig,
  TransformNode,
} from "../../types/graph-workflow";
import { GraphVisualization } from "./GraphVisualization";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock @xyflow/react so that ReactFlow renders each node by calling its
 * nodeTypes renderer directly. This lets us test rendered node content
 * without needing a real browser layout engine.
 */
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    nodeTypes,
  }: {
    nodes: Array<{
      id: string;
      type: string;
      data: Record<string, unknown>;
    }>;
    nodeTypes?: Record<
      string,
      React.ComponentType<{ data: Record<string, unknown>; id: string }>
    >;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => {
        const Renderer = nodeTypes?.[node.type];
        return Renderer ? (
          <div key={node.id} data-testid={`rf-node-${node.id}`}>
            <Renderer data={node.data} id={node.id} />
          </div>
        ) : null;
      })}
    </div>
  ),
  Background: () => null,
  BaseEdge: () => null,
  EdgeText: () => null,
  getBezierPath: () => ["", 0, 0, 0, 0, 0, 0] as const,
  Handle: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

/** Mock dagre layout so it doesn't fail in jsdom. */
vi.mock("dagre-esm", () => ({
  default: {
    graphlib: {
      Graph: class {
        setDefaultEdgeLabel() {
          return;
        }
        setGraph() {
          return;
        }
        setNode() {
          return;
        }
        setEdge() {
          return;
        }
        node() {
          return { x: 50, y: 50, width: 190, height: 110 };
        }
        nodes() {
          return [];
        }
        edges() {
          return [];
        }
      },
    },
    layout: () => {
      return;
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTransformNode = (
  overrides: Partial<TransformNode> = {},
): TransformNode => ({
  id: "t1",
  type: "transform",
  label: "My Transform",
  inputFormat: "xml",
  outputFormat: "json",
  fieldMapping: '{"outputKey": "{{source.field}}"}',
  ...overrides,
});

const makeConfig = (node: TransformNode): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: {},
  entryNodeId: node.id,
  nodes: { [node.id]: node },
  edges: [],
  ctx: {},
});

/**
 * Renders GraphVisualization inside MantineProvider with the given config and
 * optional validationErrors.
 */
function renderViz(
  node: TransformNode,
  validationErrors?: { path: string; message: string }[],
) {
  const config = makeConfig(node);
  return render(
    <MantineProvider>
      <GraphVisualization
        config={config}
        validationErrors={validationErrors}
        viewMode="detailed"
      />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GraphVisualization — TransformNode summary view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Scenario 1: Summary displays selected input and output formats", () => {
    it("shows inputFormat and outputFormat for a transform node", () => {
      renderViz(
        makeTransformNode({ inputFormat: "xml", outputFormat: "json" }),
      );

      expect(screen.getByText(/XML\s*→\s*JSON/i)).toBeInTheDocument();
    });

    it("shows csv inputFormat and xml outputFormat correctly", () => {
      renderViz(makeTransformNode({ inputFormat: "csv", outputFormat: "xml" }));

      expect(screen.getByText(/CSV\s*→\s*XML/i)).toBeInTheDocument();
    });
  });

  describe("Scenario 2: Summary displays a read-only preview of the field mapping", () => {
    it("shows the fieldMapping content in a read-only text display", () => {
      const mapping = '{"key": "{{node.field}}"}';
      renderViz(makeTransformNode({ fieldMapping: mapping }));

      expect(screen.getByText(mapping)).toBeInTheDocument();
    });
  });

  describe("Scenario 3: Large mappings display a truncated summary", () => {
    it("truncates fieldMapping longer than 300 characters with an ellipsis", () => {
      const longMapping = "x".repeat(301);
      renderViz(makeTransformNode({ fieldMapping: longMapping }));

      // Should show first 60 chars + "…", not the full 301-char string
      expect(screen.queryByText(longMapping)).not.toBeInTheDocument();
      expect(screen.getByText(/…$/)).toBeInTheDocument();
    });

    it("does not truncate fieldMapping of exactly 300 characters", () => {
      const mapping = "y".repeat(300);
      renderViz(makeTransformNode({ fieldMapping: mapping }));

      expect(screen.getByText(mapping)).toBeInTheDocument();
    });
  });

  describe("Scenario 4: Error badge displays when the last execution failed", () => {
    it("applies a red error border when validationErrors reference the transform node", () => {
      renderViz(makeTransformNode(), [
        { path: "nodes.t1.fieldMapping", message: "Unresolved binding" },
      ]);

      // The visual layer div is position:absolute inside the node.
      // jsdom normalises #ef4444 → rgb(239, 68, 68) when set via the style API.
      const nodeContainer = screen.getByTestId("rf-node-t1");
      const visualLayer = Array.from(
        nodeContainer.querySelectorAll<HTMLElement>("div"),
      ).find((el) => el.style.position === "absolute");

      expect(visualLayer).toBeDefined();
      // Border-color should be the error red (#ef4444 → rgb(239, 68, 68))
      expect(visualLayer?.style.borderColor).toMatch(
        /rgb\(239,\s*68,\s*68\)|#ef4444/i,
      );
    });

    it("does not apply an error border when there are no validation errors", () => {
      renderViz(makeTransformNode());

      const nodeContainer = screen.getByTestId("rf-node-t1");
      const visualLayer = Array.from(
        nodeContainer.querySelectorAll<HTMLElement>("div"),
      ).find((el) => el.style.position === "absolute");

      expect(visualLayer).toBeDefined();
      // Border-color should NOT be the error red (#ef4444 → rgb(239, 68, 68))
      expect(visualLayer?.style.borderColor).not.toMatch(
        /rgb\(239,\s*68,\s*68\)|#ef4444/i,
      );
    });
  });
});
