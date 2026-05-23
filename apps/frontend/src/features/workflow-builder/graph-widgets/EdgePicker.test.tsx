/**
 * Tests for EdgePicker (US-002).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-002-edge-picker-primitive.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { EdgePicker } from "./EdgePicker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges,
    ctx: {},
  };
}

const activity = (id: string, label: string): GraphNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
});

const edge = (
  id: string,
  source: string,
  target: string,
  type: GraphEdge["type"] = "normal",
): GraphEdge => ({
  id,
  source,
  target,
  type,
});

function renderPicker(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// ---------------------------------------------------------------------------
// Scenario 1: Lists edges that originate from fromNodeId
// ---------------------------------------------------------------------------

describe("EdgePicker — Scenario 1: lists edges from fromNodeId", () => {
  it("only lists edges whose source equals fromNodeId", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n3", "Process"),
        activity("n4", "Other"),
      ],
      [
        edge("e1", "n1", "n2"),
        edge("e2", "n1", "n3"),
        edge("e3", "n4", "n2"),
        edge("e4", "n4", "n3"),
      ],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // Edges originating from n1 are present (by edge id rendered as
    // secondary text inside their option rows).
    expect(screen.getByText("e1")).toBeInTheDocument();
    expect(screen.getByText("e2")).toBeInTheDocument();

    // Edges originating from n4 are not present.
    expect(screen.queryByText("e3")).not.toBeInTheDocument();
    expect(screen.queryByText("e4")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Option labels show the target node's label + edge id
// ---------------------------------------------------------------------------

describe("EdgePicker — Scenario 2: option shows target label + edge id", () => {
  it("renders the target node's label as primary text and the edge id as secondary text", () => {
    const config = makeConfig(
      [activity("n1", "Start"), activity("n2", "Validate")],
      [edge("e1", "n1", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // Both pieces of text are inside the same option row.
    const primary = screen.getByText("Validate");
    const secondary = screen.getByText("e1");
    expect(primary).toBeInTheDocument();
    expect(secondary).toBeInTheDocument();
  });

  it("falls back to the target node id when the target node has no label", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        { id: "n2", type: "activity", label: "", activityType: "test.noop" },
      ],
      [edge("e1", "n1", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));
    expect(screen.getByText("n2")).toBeInTheDocument();
    expect(screen.getByText("e1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Emits onChange with the chosen id and supports clearing
// ---------------------------------------------------------------------------

describe("EdgePicker — Scenario 3: emits onChange on select and clear", () => {
  it("calls onChange with the new edge id, then with null when cleared", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n3", "Process"),
      ],
      [edge("e1", "n1", "n2"), edge("e2", "n1", "n3")],
    );

    const onChange = vi.fn<(edgeId: string | null) => void>();

    function Wrapper() {
      const [value, setValue] = useState<string | null>("e1");
      return (
        <EdgePicker
          config={config}
          fromNodeId="n1"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          data-testid="picker"
        />
      );
    }

    renderPicker(<Wrapper />);

    // Open the dropdown and select the edge whose target is "Process".
    const input = screen.getByTestId("picker");
    fireEvent.click(input);
    fireEvent.click(screen.getByText("Process"));

    expect(onChange).toHaveBeenNthCalledWith(1, "e2");

    // Clear via the built-in clear button.
    const clearButton = screen.getByLabelText(/clear edge selection/i);
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenNthCalledWith(2, null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Warns inline when the bound edge no longer exists or its
// source changed
// ---------------------------------------------------------------------------

describe("EdgePicker — Scenario 4: stale-reference warning", () => {
  it("warns when the bound edge id is not present in config.edges", () => {
    const config = makeConfig(
      [activity("n1", "Start"), activity("n2", "Validate")],
      [edge("e1", "n1", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value="deleted-edge-id"
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    const warning = screen.getByTestId("edge-picker-stale-warning");
    expect(warning).toBeInTheDocument();
    expect(within(warning).getByText(/stale/i)).toBeInTheDocument();
    expect(within(warning).getByText(/deleted-edge-id/)).toBeInTheDocument();
  });

  it("warns when the bound edge exists but its source !== fromNodeId", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n4", "Other"),
      ],
      [edge("e3", "n4", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value="e3"
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    const warning = screen.getByTestId("edge-picker-stale-warning");
    expect(warning).toBeInTheDocument();
    expect(within(warning).getByText(/e3/)).toBeInTheDocument();
  });

  it("does not warn when the bound edge exists and originates from fromNodeId", () => {
    const config = makeConfig(
      [activity("n1", "Start"), activity("n2", "Validate")],
      [edge("e1", "n1", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value="e1"
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    expect(
      screen.queryByTestId("edge-picker-stale-warning"),
    ).not.toBeInTheDocument();
  });

  it("does not warn when value is null", () => {
    const config = makeConfig(
      [activity("n1", "Start"), activity("n2", "Validate")],
      [edge("e1", "n1", "n2")],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    expect(
      screen.queryByTestId("edge-picker-stale-warning"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-022 Scenario 1: Without `edgeTypes` prop, behavior is unchanged
// ---------------------------------------------------------------------------

describe("EdgePicker — US-022 Scenario 1: no edgeTypes prop keeps all edges", () => {
  it("lists normal, conditional, and error edges when edgeTypes is not provided", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n3", "Process"),
        activity("n4", "Recover"),
      ],
      [
        edge("e1", "n1", "n2", "normal"),
        edge("e2", "n1", "n3", "conditional"),
        edge("e3", "n1", "n4", "error"),
      ],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    expect(screen.getByText("e1")).toBeInTheDocument();
    expect(screen.getByText("e2")).toBeInTheDocument();
    expect(screen.getByText("e3")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-022 Scenario 2: With `edgeTypes={["conditional"]}`, only conditional
// edges appear
// ---------------------------------------------------------------------------

describe("EdgePicker — US-022 Scenario 2: edgeTypes filter restricts options", () => {
  it("offers only conditional edges when edgeTypes={['conditional']}", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n3", "Process"),
        activity("n4", "Recover"),
      ],
      [
        edge("e-norm", "n1", "n2", "normal"),
        edge("e-cond", "n1", "n3", "conditional"),
        edge("e-err", "n1", "n4", "error"),
      ],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        edgeTypes={["conditional"]}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    expect(screen.getByText("e-cond")).toBeInTheDocument();
    expect(screen.queryByText("e-norm")).not.toBeInTheDocument();
    expect(screen.queryByText("e-err")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-022 Scenario 3: Selected value pointing to a non-matching type still
// surfaces the existing stale-reference warning
// ---------------------------------------------------------------------------

describe("EdgePicker — US-022 Scenario 3: stale warning when bound edge type no longer matches filter", () => {
  it("surfaces the stale-reference warning for a bound edge whose type is filtered out, and supports clearing", () => {
    // edge-x exists with type "normal", but the picker filters to
    // conditional. The existing stale-warning semantics apply because the
    // bound id is no longer a valid option for this role.
    const config = makeConfig(
      [activity("n1", "Start"), activity("n2", "Validate")],
      [edge("edge-x", "n1", "n2", "normal")],
    );

    const onChange = vi.fn<(edgeId: string | null) => void>();

    function Wrapper() {
      const [value, setValue] = useState<string | null>("edge-x");
      return (
        <EdgePicker
          config={config}
          fromNodeId="n1"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          edgeTypes={["conditional"]}
          data-testid="picker"
        />
      );
    }

    renderPicker(<Wrapper />);

    const warning = screen.getByTestId("edge-picker-stale-warning");
    expect(warning).toBeInTheDocument();
    expect(within(warning).getByText(/edge-x/)).toBeInTheDocument();

    // Clearing still works.
    const clearButton = screen.getByLabelText(/clear edge selection/i);
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenNthCalledWith(1, null);
  });
});

// ---------------------------------------------------------------------------
// US-022 Scenario 4: Empty filter list shows no candidates
// ---------------------------------------------------------------------------

describe("EdgePicker — US-022 Scenario 4: empty edgeTypes filter yields no options", () => {
  it("renders no options and does not throw when edgeTypes is an empty array", () => {
    const config = makeConfig(
      [
        activity("n1", "Start"),
        activity("n2", "Validate"),
        activity("n3", "Process"),
        activity("n4", "Recover"),
      ],
      [
        edge("e1", "n1", "n2", "normal"),
        edge("e2", "n1", "n3", "conditional"),
        edge("e3", "n1", "n4", "error"),
      ],
    );

    renderPicker(
      <EdgePicker
        config={config}
        fromNodeId="n1"
        value={null}
        onChange={() => undefined}
        edgeTypes={[]}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // None of the candidate edge-id secondary labels should appear.
    expect(screen.queryByText("e1")).not.toBeInTheDocument();
    expect(screen.queryByText("e2")).not.toBeInTheDocument();
    expect(screen.queryByText("e3")).not.toBeInTheDocument();
  });
});
