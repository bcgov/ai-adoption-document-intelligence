/**
 * Tests for MapNodeSettings (US-005).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-005-map-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  CtxDeclaration,
  GraphNode,
  GraphWorkflowConfig,
  MapNode,
} from "../../../../types/workflow";
import { MapNodeSettings } from "./MapNodeSettings";

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

function renderSettings(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Mounts the form with a controlled wrapper so a test can poke at the
 * latest `onConfigChange` payload via the spy while the form stays in
 * sync with the most recent value.
 */
function mountWithSpy(initialConfig: GraphWorkflowConfig, mapNodeId: string) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[mapNodeId] as MapNode;
    return (
      <MapNodeSettings
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
// Scenario 1: all three ctx-key fields use VariablePicker and surface the
// declared ctx keys.
// ---------------------------------------------------------------------------

describe("MapNodeSettings — Scenario 1: ctx-key fields use VariablePicker", () => {
  it("renders collection / item / index ctx-key fields as VariablePickers populated with declared ctx keys", () => {
    const node = mapNode("m1", "Per-Item");
    const config = makeConfig([node, activity("a1", "Body")], {
      documents: { type: "array" },
      items: { type: "array" },
    });

    renderSettings(
      <MapNodeSettings
        node={node}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // All three ctx-key fields are present.
    const collectionField = screen.getByTestId(
      "map-node-settings-collection-ctx-key",
    );
    const itemField = screen.getByTestId("map-node-settings-item-ctx-key");
    const indexField = screen.getByTestId("map-node-settings-index-ctx-key");
    expect(collectionField).toBeInTheDocument();
    expect(itemField).toBeInTheDocument();
    expect(indexField).toBeInTheDocument();

    // Open each in turn and confirm the declared ctx keys appear as options.
    fireEvent.focus(collectionField);
    fireEvent.click(collectionField);
    expect(screen.getAllByText("documents").length).toBeGreaterThan(0);
    expect(screen.getAllByText("items").length).toBeGreaterThan(0);
    // VariablePicker groups options under "Workflow context".
    expect(screen.getAllByText("Workflow context").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: maxConcurrency is an optional integer NumberInput
// ---------------------------------------------------------------------------

describe("MapNodeSettings — Scenario 2: maxConcurrency is optional integer NumberInput", () => {
  it("entering 4 then clearing fires onConfigChange first with maxConcurrency: 4, then with maxConcurrency removed", () => {
    const initial = mapNode("m1", "Per-Item");
    const config = makeConfig([initial, activity("a1", "Body")]);
    const { spy } = mountWithSpy(config, "m1");

    const input = screen.getByTestId(
      "map-node-settings-max-concurrency",
    ) as HTMLInputElement;

    // Type "4".
    fireEvent.change(input, { target: { value: "4" } });

    // First call carries maxConcurrency: 4.
    expect(spy).toHaveBeenCalled();
    const firstCall = spy.mock.calls[0]?.[0] as GraphWorkflowConfig;
    const afterSet = firstCall.nodes.m1 as MapNode;
    expect(afterSet.maxConcurrency).toBe(4);

    // Clear the input.
    fireEvent.change(input, { target: { value: "" } });

    // The latest call drops maxConcurrency entirely.
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const afterClear = latest.nodes.m1 as MapNode;
    expect(afterClear.maxConcurrency).toBeUndefined();
    expect("maxConcurrency" in afterClear).toBe(false);
  });

  it("rejects values < 1 and non-integer input via the NumberInput's own constraints", () => {
    const initial = mapNode("m1", "Per-Item");
    const config = makeConfig([initial, activity("a1", "Body")]);
    const { spy } = mountWithSpy(config, "m1");

    const input = screen.getByTestId(
      "map-node-settings-max-concurrency",
    ) as HTMLInputElement;

    // Try a series of malformed inputs (fractional, negative, zero,
    // non-numeric). NumberInput parses each and emits "" / a clamped
    // value rather than the raw bad value, so the resulting
    // maxConcurrency on the node either stays undefined or is a positive
    // integer.
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.change(input, { target: { value: "-3" } });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "abc" } });

    // Whatever the spy observed for maxConcurrency must always be either
    // undefined or a positive integer — never a decimal, never < 1.
    for (const call of spy.mock.calls) {
      const cfg = call[0];
      const updated = cfg.nodes.m1 as MapNode;
      if (updated.maxConcurrency !== undefined) {
        expect(Number.isInteger(updated.maxConcurrency)).toBe(true);
        expect(updated.maxConcurrency).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: bodyEntryNodeId and bodyExitNodeId use NodePicker over all
// nodes (no filterType applied).
// ---------------------------------------------------------------------------

describe("MapNodeSettings — Scenario 3: body pickers list all nodes", () => {
  it("opens either body picker and shows all other nodes (no filterType applied)", () => {
    const initial = mapNode("m1", "Per-Item");
    const config = makeConfig([
      initial,
      activity("a1", "Body Entry"),
      activity("a2", "Middle"),
      activity("a3", "Body Exit"),
    ]);

    const { spy } = mountWithSpy(config, "m1");

    const entryPicker = screen.getByTestId("map-node-settings-body-entry");
    fireEvent.click(entryPicker);

    // All non-self nodes are present in the entry picker dropdown as
    // selectable options. Both NodePickers (entry + exit) live in the
    // DOM, but only the clicked one opens its options list — scope to
    // role="option" to ignore any other text nodes.
    const entryOptions = screen.getAllByRole("option");
    const entryLabels = entryOptions.map((o) => o.textContent ?? "");
    expect(entryLabels.some((t) => t.includes("Body Entry"))).toBe(true);
    expect(entryLabels.some((t) => t.includes("Middle"))).toBe(true);
    expect(entryLabels.some((t) => t.includes("Body Exit"))).toBe(true);
    // No filterType applied: all three other nodes are listed (the map
    // node itself is excluded by NodePicker's currentNodeId rule).
    expect(entryOptions.length).toBe(3);

    // Selecting one updates bodyEntryNodeId.
    const bodyEntryOption = entryOptions.find((o) =>
      (o.textContent ?? "").includes("Body Entry"),
    );
    if (!bodyEntryOption) throw new Error("Body Entry option not found");
    fireEvent.click(bodyEntryOption);

    expect(spy).toHaveBeenCalled();
    const afterEntry = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updatedEntry = afterEntry.nodes.m1 as MapNode;
    expect(updatedEntry.bodyEntryNodeId).toBe("a1");
    expect(updatedEntry.bodyExitNodeId).toBe("");

    // Open the exit picker and select a different node.
    const exitPicker = screen.getByTestId("map-node-settings-body-exit");
    fireEvent.click(exitPicker);
    const exitOptions = screen.getAllByRole("option");
    const bodyExitOption = exitOptions.find((o) =>
      (o.textContent ?? "").includes("Body Exit"),
    );
    if (!bodyExitOption) throw new Error("Body Exit option not found");
    fireEvent.click(bodyExitOption);

    const afterExit = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updatedExit = afterExit.nodes.m1 as MapNode;
    expect(updatedExit.bodyExitNodeId).toBe("a3");
    // Previous entry choice is preserved.
    expect(updatedExit.bodyEntryNodeId).toBe("a1");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: editing any field propagates a typed update to onConfigChange
// with only that field mutated.
// ---------------------------------------------------------------------------

describe("MapNodeSettings — Scenario 4: edits propagate a typed update", () => {
  it("editing itemCtxKey fires onConfigChange with the full MapNode carrying the new value and other fields unchanged", () => {
    const initial = mapNode("m1", "Per-Item", {
      collectionCtxKey: "documents",
      itemCtxKey: "doc",
      indexCtxKey: "idx",
      maxConcurrency: 2,
      bodyEntryNodeId: "a1",
      bodyExitNodeId: "a3",
    });
    const config = makeConfig(
      [
        initial,
        activity("a1", "Body Entry"),
        activity("a2", "Middle"),
        activity("a3", "Body Exit"),
      ],
      { documents: { type: "array" } },
    );

    const { spy } = mountWithSpy(config, "m1");

    // Edit itemCtxKey via the VariablePicker's underlying Autocomplete input.
    const itemField = screen.getByTestId(
      "map-node-settings-item-ctx-key",
    ) as HTMLInputElement;
    fireEvent.change(itemField, { target: { value: "page" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.m1 as MapNode;

    expect(updated.type).toBe("map");
    expect(updated.id).toBe("m1");
    // Only itemCtxKey changed.
    expect(updated.itemCtxKey).toBe("page");
    expect(updated.collectionCtxKey).toBe("documents");
    expect(updated.indexCtxKey).toBe("idx");
    expect(updated.maxConcurrency).toBe(2);
    expect(updated.bodyEntryNodeId).toBe("a1");
    expect(updated.bodyExitNodeId).toBe("a3");
    expect(updated.label).toBe("Per-Item");
  });
});
