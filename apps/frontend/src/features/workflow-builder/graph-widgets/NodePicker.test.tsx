/**
 * Tests for NodePicker (US-001).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-001-node-picker-primitive.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GraphNode, GraphWorkflowConfig } from "../../../types/workflow";
import { NodePicker } from "./NodePicker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(nodes: GraphNode[]): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges: [],
    ctx: {},
  };
}

const activity = (id: string, label: string): GraphNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
});

const mapNode = (id: string, label: string): GraphNode => ({
  id,
  type: "map",
  label,
  collectionCtxKey: "items",
  itemCtxKey: "item",
  bodyEntryNodeId: "",
  bodyExitNodeId: "",
});

const switchNode = (id: string, label: string): GraphNode => ({
  id,
  type: "switch",
  label,
  cases: [],
});

function renderPicker(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// ---------------------------------------------------------------------------
// Scenario 1: Lists nodes from config.nodes
// ---------------------------------------------------------------------------

describe("NodePicker — Scenario 1: lists nodes from config.nodes", () => {
  it("renders every node in config.nodes as an option with label and a type badge", () => {
    const config = makeConfig([
      activity("a1", "Fetch Documents"),
      mapNode("m1", "Per-Page Fan-Out"),
      switchNode("s1", "Branch on Status"),
    ]);

    renderPicker(
      <NodePicker
        config={config}
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    // Open the Select dropdown.
    const input = screen.getByTestId("picker");
    fireEvent.click(input);

    // Each node's label is present.
    expect(screen.getByText("Fetch Documents")).toBeInTheDocument();
    expect(screen.getByText("Per-Page Fan-Out")).toBeInTheDocument();
    expect(screen.getByText("Branch on Status")).toBeInTheDocument();

    // Each option has a small badge showing its type.
    // Badges render inline next to each option label.
    expect(screen.getByText("activity")).toBeInTheDocument();
    expect(screen.getByText("map")).toBeInTheDocument();
    expect(screen.getByText("switch")).toBeInTheDocument();
  });

  it("falls back to the node id when a node has no label", () => {
    const node: GraphNode = {
      id: "no-label-node",
      type: "activity",
      label: "",
      activityType: "test.noop",
    };
    const config = makeConfig([node]);

    renderPicker(
      <NodePicker
        config={config}
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));
    expect(screen.getByText("no-label-node")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: filterType narrows options to nodes of that type
// ---------------------------------------------------------------------------

describe("NodePicker — Scenario 2: filterType narrows options", () => {
  it('only lists map nodes when filterType="map"', () => {
    const config = makeConfig([
      activity("a1", "Activity A"),
      mapNode("m1", "Map One"),
      mapNode("m2", "Map Two"),
      switchNode("s1", "Switch One"),
    ]);

    renderPicker(
      <NodePicker
        config={config}
        value={null}
        onChange={() => undefined}
        filterType="map"
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // Only the two map nodes are visible.
    expect(screen.getByText("Map One")).toBeInTheDocument();
    expect(screen.getByText("Map Two")).toBeInTheDocument();
    expect(screen.queryByText("Activity A")).not.toBeInTheDocument();
    expect(screen.queryByText("Switch One")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Excludes the currently-selected node from its own options
// ---------------------------------------------------------------------------

describe("NodePicker — Scenario 3: excludes currentNodeId from options", () => {
  it("does not list the node identified by currentNodeId", () => {
    const config = makeConfig([
      activity("n1", "First Node"),
      activity("n2", "Second Node"),
      activity("n3", "Third Node"),
    ]);

    renderPicker(
      <NodePicker
        config={config}
        value={null}
        onChange={() => undefined}
        currentNodeId="n1"
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    expect(screen.queryByText("First Node")).not.toBeInTheDocument();
    expect(screen.getByText("Second Node")).toBeInTheDocument();
    expect(screen.getByText("Third Node")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Emits onChange with the chosen id and supports clearing
// ---------------------------------------------------------------------------

describe("NodePicker — Scenario 4: emits onChange on select and clear", () => {
  it("calls onChange with the new id, then with null when cleared", () => {
    const config = makeConfig([
      activity("n1", "First Node"),
      activity("n2", "Second Node"),
    ]);

    const onChange = vi.fn<(nodeId: string | null) => void>();

    // Controlled wrapper so the Select reflects the latest value and the
    // clear (X) affordance becomes available once a value is selected.
    function Wrapper() {
      const [value, setValue] = useState<string | null>("n1");
      return (
        <NodePicker
          config={config}
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

    // Open the dropdown and select "Second Node".
    const input = screen.getByTestId("picker");
    fireEvent.click(input);
    fireEvent.click(screen.getByText("Second Node"));

    expect(onChange).toHaveBeenNthCalledWith(1, "n2");

    // Clear via Mantine's built-in clear button (rendered when clearable
    // is true and a value is set). We pass an explicit aria-label via
    // clearButtonProps so the button is reliably reachable in tests.
    const clearButton = screen.getByLabelText(/clear node selection/i);
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenNthCalledWith(2, null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Warns inline when the bound value points to a missing node
// ---------------------------------------------------------------------------

describe("NodePicker — Scenario 5: missing-reference warning", () => {
  it("renders an inline warning when value points to a node not in config.nodes", () => {
    const config = makeConfig([activity("n1", "Existing Node")]);

    renderPicker(
      <NodePicker
        config={config}
        value="deleted-node-id"
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    const warning = screen.getByTestId("node-picker-missing-warning");
    expect(warning).toBeInTheDocument();
    expect(within(warning).getByText(/no longer exists/i)).toBeInTheDocument();
    expect(within(warning).getByText(/deleted-node-id/)).toBeInTheDocument();
  });

  it("does not render the warning when value points to a node that exists", () => {
    const config = makeConfig([activity("n1", "Existing Node")]);

    renderPicker(
      <NodePicker
        config={config}
        value="n1"
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    expect(
      screen.queryByTestId("node-picker-missing-warning"),
    ).not.toBeInTheDocument();
  });

  it("does not render the warning when value is null", () => {
    const config = makeConfig([activity("n1", "Existing Node")]);

    renderPicker(
      <NodePicker
        config={config}
        value={null}
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    expect(
      screen.queryByTestId("node-picker-missing-warning"),
    ).not.toBeInTheDocument();
  });
});
