/**
 * Tests for SwitchNodeSettings (US-004).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-004-switch-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  ConditionExpression,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  SwitchCase,
  SwitchNode,
} from "../../../../types/workflow";
import { SwitchNodeSettings } from "./SwitchNodeSettings";

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

const activity = (id: string, label: string): ActivityNode => ({
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

const comparison = (
  left: string,
  right: string | number,
): ConditionExpression => ({
  operator: "equals",
  left: { ref: left },
  right: typeof right === "string" ? { ref: right } : { literal: right },
});

function switchNode(
  id: string,
  label: string,
  cases: SwitchCase[],
  defaultEdge?: string,
): SwitchNode {
  return {
    id,
    type: "switch",
    label,
    cases,
    ...(defaultEdge !== undefined ? { defaultEdge } : {}),
  };
}

function renderSettings(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Convenience wrapper so a test can mount the form once, then poke at the
 * latest `onConfigChange` payload via the spy.
 */
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  switchNodeId: string,
) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[switchNodeId] as SwitchNode;
    return (
      <SwitchNodeSettings
        node={node}
        config={config}
        onConfigChange={(next) => {
          spy(next);
          setConfig(next);
        }}
      />
    );
  }

  const utils = renderSettings(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: Renders existing cases as a list of editable rows
// ---------------------------------------------------------------------------

describe("SwitchNodeSettings — Scenario 1: renders existing cases", () => {
  it("renders one row per case, each containing a ConditionExpressionEditor and an EdgePicker", () => {
    const node = switchNode("sw1", "Branch", [
      { condition: comparison("ctx.a", 1), edgeId: "e1" },
      { condition: comparison("ctx.b", 2), edgeId: "e2" },
    ]);
    const config = makeConfig(
      [node, activity("n2", "Approve"), activity("n3", "Reject")],
      [edge("e1", "sw1", "n2"), edge("e2", "sw1", "n3")],
    );

    renderSettings(
      <SwitchNodeSettings
        node={node}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Two case rows render.
    const row0 = screen.getByTestId("switch-node-settings-case-0");
    const row1 = screen.getByTestId("switch-node-settings-case-1");
    expect(row0).toBeInTheDocument();
    expect(row1).toBeInTheDocument();

    // Each contains a ConditionExpressionEditor bound to its case.
    expect(
      within(row0).getByTestId("switch-node-settings-case-0-condition"),
    ).toBeInTheDocument();
    expect(
      within(row1).getByTestId("switch-node-settings-case-1-condition"),
    ).toBeInTheDocument();

    // Each contains an EdgePicker bound to its case.
    expect(
      within(row0).getByTestId("switch-node-settings-case-0-edge"),
    ).toBeInTheDocument();
    expect(
      within(row1).getByTestId("switch-node-settings-case-1-edge"),
    ).toBeInTheDocument();

    // The EdgePicker reflects the bound edge id for each row.
    const edgePicker0 = within(row0).getByTestId(
      "switch-node-settings-case-0-edge",
    ) as HTMLInputElement;
    const edgePicker1 = within(row1).getByTestId(
      "switch-node-settings-case-1-edge",
    ) as HTMLInputElement;
    // Edge labels resolve to the target node's label.
    expect(edgePicker0.value).toBe("Approve");
    expect(edgePicker1.value).toBe("Reject");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Add Case appends an empty case
// ---------------------------------------------------------------------------

describe("SwitchNodeSettings — Scenario 2: Add Case appends an empty case", () => {
  it("clicking Add Case fires onConfigChange with cases.length === 2 and the new case is empty", () => {
    const initialNode = switchNode("sw1", "Branch", [
      { condition: comparison("ctx.a", 1), edgeId: "e1" },
    ]);
    const config = makeConfig(
      [initialNode, activity("n2", "Approve")],
      [edge("e1", "sw1", "n2")],
    );

    const { spy } = mountWithSpy(config, "sw1");

    fireEvent.click(screen.getByTestId("switch-node-settings-add-case"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    expect(updated.cases).toHaveLength(2);
    // First case preserved.
    expect(updated.cases[0]).toEqual({
      condition: comparison("ctx.a", 1),
      edgeId: "e1",
    });
    // Second case is fresh + empty.
    const fresh = updated.cases[1];
    expect(fresh.edgeId).toBe("");
    expect(fresh.condition.operator).toBe("equals");
    // Both sides of the comparison default to empty ref operands.
    if (
      fresh.condition.operator === "equals" ||
      fresh.condition.operator === "not-equals" ||
      fresh.condition.operator === "gt" ||
      fresh.condition.operator === "gte" ||
      fresh.condition.operator === "lt" ||
      fresh.condition.operator === "lte" ||
      fresh.condition.operator === "contains"
    ) {
      expect(fresh.condition.left).toEqual({ ref: "" });
      expect(fresh.condition.right).toEqual({ ref: "" });
    } else {
      throw new Error("Expected a comparison expression as the fresh seed");
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Remove Case removes the targeted case
// ---------------------------------------------------------------------------

describe("SwitchNodeSettings — Scenario 3: Remove Case removes the targeted case", () => {
  it("clicking Remove on row index 1 fires onConfigChange with cases.length === 2 and the original index-0 and index-2 cases remain in order", () => {
    const initialNode = switchNode("sw1", "Branch", [
      { condition: comparison("ctx.a", 1), edgeId: "e1" },
      { condition: comparison("ctx.b", 2), edgeId: "e2" },
      { condition: comparison("ctx.c", 3), edgeId: "e3" },
    ]);
    const config = makeConfig(
      [
        initialNode,
        activity("n2", "A"),
        activity("n3", "B"),
        activity("n4", "C"),
      ],
      [
        edge("e1", "sw1", "n2"),
        edge("e2", "sw1", "n3"),
        edge("e3", "sw1", "n4"),
      ],
    );

    const { spy } = mountWithSpy(config, "sw1");

    fireEvent.click(screen.getByTestId("switch-node-settings-case-1-remove"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;

    expect(updated.cases).toHaveLength(2);
    expect(updated.cases[0]).toEqual({
      condition: comparison("ctx.a", 1),
      edgeId: "e1",
    });
    expect(updated.cases[1]).toEqual({
      condition: comparison("ctx.c", 3),
      edgeId: "e3",
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Editing a row's condition or edgeId propagates to onConfigChange
// ---------------------------------------------------------------------------

describe("SwitchNodeSettings — Scenario 4: row edits propagate to onConfigChange", () => {
  it("editing a case's edgeId fires onConfigChange with the updated SwitchNode", () => {
    const initialNode = switchNode("sw1", "Branch", [
      { condition: comparison("ctx.a", 1), edgeId: "e1" },
    ]);
    const config = makeConfig(
      [initialNode, activity("n2", "Approve"), activity("n3", "Reject")],
      [edge("e1", "sw1", "n2"), edge("e2", "sw1", "n3")],
    );

    const { spy } = mountWithSpy(config, "sw1");

    // Open the EdgePicker dropdown for case 0 and pick the edge whose id
    // is "e2". Note: the default-edge picker is also rendered and its
    // option list also contains "Reject" as a target label, so we cannot
    // disambiguate by target label alone — query by the edge id text
    // ("e2") which only appears in the case-0 picker's dropdown row that
    // matches our intended choice (each option renders both target label
    // and edge id).
    const picker = screen.getByTestId("switch-node-settings-case-0-edge");
    fireEvent.click(picker);
    // Both pickers list e2 as an option, so pick the first occurrence
    // inside the case-0 picker's combobox panel. Mantine uses
    // role="option" with a value attribute equal to the option's value.
    const e2Options = screen.getAllByRole("option", { name: /e2/ });
    expect(e2Options.length).toBeGreaterThan(0);
    fireEvent.click(e2Options[0]);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    expect(updated.cases).toHaveLength(1);
    expect(updated.cases[0].edgeId).toBe("e2");
    // Other case fields are preserved.
    expect(updated.cases[0].condition).toEqual(comparison("ctx.a", 1));
  });

  it("editing a case's condition fires onConfigChange with the updated SwitchNode", () => {
    const initialNode = switchNode("sw1", "Branch", [
      { condition: comparison("ctx.a", 1), edgeId: "e1" },
    ]);
    const config = makeConfig(
      [initialNode, activity("n2", "Approve")],
      [edge("e1", "sw1", "n2")],
    );

    const { spy } = mountWithSpy(config, "sw1");

    // Find the comparison operator dropdown inside the nested
    // ConditionExpressionEditor for case 0 and switch from "equals" to
    // "not-equals".
    const opSelect = screen.getByTestId(
      "switch-node-settings-case-0-condition-comparison-op",
    ) as HTMLInputElement;

    fireEvent.click(opSelect);
    fireEvent.click(screen.getByText("not-equals"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    const cond = updated.cases[0].condition;
    expect(cond.operator).toBe("not-equals");
    // edgeId remains.
    expect(updated.cases[0].edgeId).toBe("e1");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: defaultEdge is editable via an EdgePicker scoped to outgoing
// edges from this node
// ---------------------------------------------------------------------------

describe("SwitchNodeSettings — Scenario 5: defaultEdge EdgePicker is scoped to outgoing edges", () => {
  it("only edges with source === switchNode.id appear; selecting one updates defaultEdge via onConfigChange", () => {
    const initialNode = switchNode("sw1", "Branch", []);
    // Canvas has multiple edges: e1 + e2 originate from sw1, e3 + e4 don't.
    const config = makeConfig(
      [
        initialNode,
        activity("n2", "Approve"),
        activity("n3", "Reject"),
        activity("nx", "Other source"),
        activity("ny", "Other target"),
      ],
      [
        edge("e1", "sw1", "n2"),
        edge("e2", "sw1", "n3"),
        edge("e3", "nx", "n2"),
        edge("e4", "nx", "ny"),
      ],
    );

    const { spy } = mountWithSpy(config, "sw1");

    const defaultPicker = screen.getByTestId(
      "switch-node-settings-default-edge",
    );

    fireEvent.click(defaultPicker);

    // Only edges from sw1 are present in the dropdown.
    expect(screen.getByText("e1")).toBeInTheDocument();
    expect(screen.getByText("e2")).toBeInTheDocument();
    expect(screen.queryByText("e3")).not.toBeInTheDocument();
    expect(screen.queryByText("e4")).not.toBeInTheDocument();

    // Pick the "Approve" target (edge e1) — verifies selection writes
    // through to defaultEdge.
    fireEvent.click(screen.getByText("Approve"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    expect(updated.defaultEdge).toBe("e1");
  });
});
