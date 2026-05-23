/**
 * Tests for JoinNodeSettings (US-006).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-006-join-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  CtxDeclaration,
  GraphNode,
  GraphWorkflowConfig,
  JoinNode,
  MapNode,
  SwitchNode,
} from "../../../../types/workflow";
import { JoinNodeSettings } from "./JoinNodeSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  ctx: Record<string, CtxDeclaration> = {},
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
    edges: [],
    ctx,
  };
}

const activity = (id: string, label: string): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
});

function mapNode(
  id: string,
  label: string,
  overrides: Partial<MapNode> = {},
): MapNode {
  return {
    id,
    type: "map",
    label,
    collectionCtxKey: "",
    itemCtxKey: "",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
    ...overrides,
  };
}

function switchNode(
  id: string,
  label: string,
  overrides: Partial<SwitchNode> = {},
): SwitchNode {
  return {
    id,
    type: "switch",
    label,
    cases: [],
    ...overrides,
  };
}

function joinNode(
  id: string,
  label: string,
  overrides: Partial<JoinNode> = {},
): JoinNode {
  return {
    id,
    type: "join",
    label,
    sourceMapNodeId: "",
    strategy: "all",
    resultsCtxKey: "",
    ...overrides,
  };
}

function renderSettings(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Mounts the form with a controlled wrapper so a test can poke at the
 * latest `onConfigChange` payload via the spy while the form stays in
 * sync with the most recent value.
 */
function mountWithSpy(initialConfig: GraphWorkflowConfig, joinNodeId: string) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[joinNodeId] as JoinNode;
    return (
      <JoinNodeSettings
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
// Scenario 1: sourceMapNodeId uses NodePicker filtered to map nodes.
// ---------------------------------------------------------------------------

describe("JoinNodeSettings — Scenario 1: sourceMapNodeId picker filters to map nodes", () => {
  it("lists only nodes whose type === 'map' in the source-map-node-id picker", () => {
    const node = joinNode("j1", "Join");
    const config = makeConfig([
      node,
      activity("a1", "Some Activity"),
      switchNode("s1", "Decision"),
      mapNode("m1", "Per-Doc Map"),
      mapNode("m2", "Per-Page Map"),
    ]);

    renderSettings(
      <JoinNodeSettings
        node={node}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const sourcePicker = screen.getByTestId(
      "join-node-settings-source-map-node-id",
    );
    fireEvent.click(sourcePicker);

    const options = screen.getAllByRole("option");
    // Both map nodes must appear and nothing else.
    const labels = options.map((o) => o.textContent ?? "");
    expect(labels.some((t) => t.includes("Per-Doc Map"))).toBe(true);
    expect(labels.some((t) => t.includes("Per-Page Map"))).toBe(true);
    expect(labels.some((t) => t.includes("Some Activity"))).toBe(false);
    expect(labels.some((t) => t.includes("Decision"))).toBe(false);
    expect(options.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: strategy renders as a SegmentedControl with all / any.
// ---------------------------------------------------------------------------

describe("JoinNodeSettings — Scenario 2: strategy is a SegmentedControl", () => {
  it("clicking the 'any' segment fires onConfigChange with strategy: 'any'", () => {
    const initial = joinNode("j1", "Join", {
      sourceMapNodeId: "m1",
      strategy: "all",
      resultsCtxKey: "results",
    });
    const config = makeConfig([initial, mapNode("m1", "Per-Doc Map")], {
      results: { type: "array" },
    });

    const { spy } = mountWithSpy(config, "j1");

    const segmented = screen.getByTestId("join-node-settings-strategy");
    // SegmentedControl renders one radio input per option; pick the one
    // whose value is "any" and click it.
    const anyInput = within(segmented).getByDisplayValue(
      "any",
    ) as HTMLInputElement;
    expect(anyInput).toBeInTheDocument();
    fireEvent.click(anyInput);

    expect(spy).toHaveBeenCalled();
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = latest.nodes.j1 as JoinNode;
    expect(updated.strategy).toBe("any");
    // Other fields are preserved.
    expect(updated.sourceMapNodeId).toBe("m1");
    expect(updated.resultsCtxKey).toBe("results");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: resultsCtxKey uses VariablePicker.
// ---------------------------------------------------------------------------

describe("JoinNodeSettings — Scenario 3: resultsCtxKey uses VariablePicker", () => {
  it("renders resultsCtxKey as a VariablePicker populated with declared ctx keys", () => {
    const node = joinNode("j1", "Join");
    const config = makeConfig([node, mapNode("m1", "Per-Doc Map")], {
      results: { type: "array" },
      errors: { type: "array" },
    });

    renderSettings(
      <JoinNodeSettings
        node={node}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const resultsField = screen.getByTestId(
      "join-node-settings-results-ctx-key",
    );
    expect(resultsField).toBeInTheDocument();

    // Open the autocomplete; declared ctx keys appear as options grouped
    // under "Workflow context".
    fireEvent.focus(resultsField);
    fireEvent.click(resultsField);

    expect(screen.getAllByText("results").length).toBeGreaterThan(0);
    expect(screen.getAllByText("errors").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Workflow context").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: editing any field propagates a typed update to onConfigChange.
// ---------------------------------------------------------------------------

describe("JoinNodeSettings — Scenario 4: edits propagate a typed update", () => {
  it("editing resultsCtxKey fires onConfigChange with the full JoinNode carrying the new value", () => {
    const initial = joinNode("j1", "Join", {
      sourceMapNodeId: "m1",
      strategy: "all",
      resultsCtxKey: "results",
    });
    const config = makeConfig([initial, mapNode("m1", "Per-Doc Map")], {
      results: { type: "array" },
      summary: { type: "array" },
    });

    const { spy } = mountWithSpy(config, "j1");

    const resultsField = screen.getByTestId(
      "join-node-settings-results-ctx-key",
    ) as HTMLInputElement;
    fireEvent.change(resultsField, { target: { value: "summary" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.j1 as JoinNode;

    expect(updated.type).toBe("join");
    expect(updated.id).toBe("j1");
    expect(updated.label).toBe("Join");
    expect(updated.resultsCtxKey).toBe("summary");
    // Other fields preserved.
    expect(updated.sourceMapNodeId).toBe("m1");
    expect(updated.strategy).toBe("all");
  });

  it("editing sourceMapNodeId fires onConfigChange with the full JoinNode carrying the new value", () => {
    const initial = joinNode("j1", "Join", {
      sourceMapNodeId: "m1",
      strategy: "all",
      resultsCtxKey: "results",
    });
    const config = makeConfig(
      [initial, mapNode("m1", "Per-Doc Map"), mapNode("m2", "Per-Page Map")],
      { results: { type: "array" } },
    );

    const { spy } = mountWithSpy(config, "j1");

    const sourcePicker = screen.getByTestId(
      "join-node-settings-source-map-node-id",
    );
    fireEvent.click(sourcePicker);

    const options = screen.getAllByRole("option");
    const m2Option = options.find((o) =>
      (o.textContent ?? "").includes("Per-Page Map"),
    );
    if (!m2Option) throw new Error("Per-Page Map option not found");
    fireEvent.click(m2Option);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.j1 as JoinNode;
    expect(updated.sourceMapNodeId).toBe("m2");
    expect(updated.strategy).toBe("all");
    expect(updated.resultsCtxKey).toBe("results");
  });

  it("editing strategy fires onConfigChange with the full JoinNode carrying the new value", () => {
    const initial = joinNode("j1", "Join", {
      sourceMapNodeId: "m1",
      strategy: "all",
      resultsCtxKey: "results",
    });
    const config = makeConfig([initial, mapNode("m1", "Per-Doc Map")]);

    const { spy } = mountWithSpy(config, "j1");

    const segmented = screen.getByTestId("join-node-settings-strategy");
    const anyInput = within(segmented).getByDisplayValue(
      "any",
    ) as HTMLInputElement;
    fireEvent.click(anyInput);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.j1 as JoinNode;
    expect(updated.strategy).toBe("any");
    expect(updated.sourceMapNodeId).toBe("m1");
    expect(updated.resultsCtxKey).toBe("results");
  });
});
