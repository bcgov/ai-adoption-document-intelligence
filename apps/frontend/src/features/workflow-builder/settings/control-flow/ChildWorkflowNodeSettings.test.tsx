/**
 * Tests for ChildWorkflowNodeSettings (US-007).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-007-child-workflow-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ChildWorkflowNode,
  CtxDeclaration,
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../../types/workflow";
import { ChildWorkflowNodeSettings } from "./ChildWorkflowNodeSettings";

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

function childWorkflowNode(
  id: string,
  label: string,
  overrides: Partial<ChildWorkflowNode> = {},
): ChildWorkflowNode {
  return {
    id,
    type: "childWorkflow",
    label,
    workflowRef: { type: "library", workflowId: "" },
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
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  childWorkflowNodeId: string,
) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const node = config.nodes[childWorkflowNodeId] as ChildWorkflowNode;
    return (
      <ChildWorkflowNodeSettings
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
// Scenario 1: workflowRef.type SegmentedControl toggles between library /
// inline and the body swaps to match.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 1: ref-type SegmentedControl toggles library / inline", () => {
  it("clicking the 'inline' segment fires onConfigChange with workflowRef.type === 'inline' and the body swaps to the inline view", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "invoice-approval" },
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "c1");

    // Initially the library body is rendered.
    expect(
      screen.getByTestId("child-workflow-node-settings-library-body"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("child-workflow-node-settings-inline-body"),
    ).not.toBeInTheDocument();

    const segmented = screen.getByTestId(
      "child-workflow-node-settings-ref-type",
    );
    const inlineInput = within(segmented).getByDisplayValue(
      "inline",
    ) as HTMLInputElement;
    fireEvent.click(inlineInput);

    expect(spy).toHaveBeenCalled();
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = latest.nodes.c1 as ChildWorkflowNode;
    expect(updated.workflowRef.type).toBe("inline");
    // The body must swap to the inline view.
    expect(
      screen.getByTestId("child-workflow-node-settings-inline-body"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("child-workflow-node-settings-library-body"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Library mode renders a TextInput for workflowId
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 2: library mode renders a TextInput for workflowId", () => {
  it("typing a workflow id fires onConfigChange with workflowRef.workflowId set to the typed value", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: { type: "library", workflowId: "" },
    });
    const config = makeConfig([initial]);

    const { spy } = mountWithSpy(config, "c1");

    const input = screen.getByTestId(
      "child-workflow-node-settings-workflow-id",
    ) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    fireEvent.change(input, { target: { value: "invoice-approval" } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalled();
    const latest = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = latest.nodes.c1 as ChildWorkflowNode;
    if (updated.workflowRef.type !== "library") {
      throw new Error("Expected workflowRef.type === 'library'");
    }
    expect(updated.workflowRef.workflowId).toBe("invoice-approval");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Inline mode shows read-only JSON preview + advisory hint.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 3: inline mode shows read-only JSON preview + hint", () => {
  it("renders the inline graph as read-only JSON and surfaces a dimmed advisory hint", () => {
    const initial = childWorkflowNode("c1", "Child", {
      workflowRef: {
        type: "inline",
        graph: {
          schemaVersion: "1.0",
          metadata: { name: "Nested" },
          nodes: {},
          edges: [],
          entryNodeId: "",
          ctx: {},
        },
      },
    });
    const config = makeConfig([initial]);

    renderSettings(
      <ChildWorkflowNodeSettings
        node={initial}
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    // Inline body is rendered.
    const inlineBody = screen.getByTestId(
      "child-workflow-node-settings-inline-body",
    );
    expect(inlineBody).toBeInTheDocument();

    // Read-only JSON preview is present and contains the serialised graph.
    const preview = screen.getByTestId(
      "child-workflow-node-settings-inline-preview",
    );
    expect(preview).toBeInTheDocument();
    // The preview is a Mantine <Code block>, which is not an interactive
    // input — there's no value to mutate; the textContent must contain the
    // serialised JSON.
    expect(preview.tagName).not.toBe("INPUT");
    expect(preview.tagName).not.toBe("TEXTAREA");
    expect(preview.textContent ?? "").toContain('"schemaVersion": "1.0"');
    expect(preview.textContent ?? "").toContain('"name": "Nested"');

    // Advisory hint text is present and uses the dimmed text style.
    expect(
      within(inlineBody).getByText(
        "Inline graph editing is not yet supported in V2; switch to JSON editor to author.",
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: inputMappings list editor supports add + remove rows.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 4: inputMappings supports add + remove rows", () => {
  it("Add Row appends a row, Remove on row 0 drops it, and each row is { port: TextInput, ctxKey: VariablePicker }", () => {
    const initialMappings: PortBinding[] = [
      { port: "payload", ctxKey: "doc" },
      { port: "options", ctxKey: "opts" },
    ];
    const initial = childWorkflowNode("c1", "Child", {
      inputMappings: initialMappings,
    });
    const config = makeConfig([initial], {
      doc: { type: "object" },
      opts: { type: "object" },
    });

    const { spy } = mountWithSpy(config, "c1");

    // Sanity: two rows initially.
    expect(
      screen.getByTestId("child-workflow-node-settings-input-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("child-workflow-node-settings-input-row-1"),
    ).toBeInTheDocument();

    // Each row is { port: TextInput, ctxKey: VariablePicker }.
    for (const index of [0, 1]) {
      const row = screen.getByTestId(
        `child-workflow-node-settings-input-row-${index}`,
      );
      const portInput = within(row).getByTestId(
        `child-workflow-node-settings-input-row-${index}-port`,
      ) as HTMLInputElement;
      const ctxKeyInput = within(row).getByTestId(
        `child-workflow-node-settings-input-row-${index}-ctx-key`,
      ) as HTMLInputElement;
      expect(portInput.tagName).toBe("INPUT");
      // The VariablePicker is built on Mantine's Autocomplete and forwards
      // `data-testid` to its underlying <input>. Hitting the test-id and
      // seeing an INPUT confirms the picker mounted.
      expect(ctxKeyInput.tagName).toBe("INPUT");
    }

    // Click Add Row -> length === 3.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-input-add"),
    );
    const afterAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterAdd = afterAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterAdd.inputMappings).toHaveLength(3);
    // Existing rows are preserved.
    expect(nodeAfterAdd.inputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterAdd.inputMappings?.[1]).toEqual(initialMappings[1]);
    // New row is empty.
    expect(nodeAfterAdd.inputMappings?.[2]).toEqual({ port: "", ctxKey: "" });

    // Click Remove on row 0 -> length === 2 (drops the original first row).
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-input-row-0-remove"),
    );
    const afterRemove = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterRemove = afterRemove.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterRemove.inputMappings).toHaveLength(2);
    // Remaining rows in order: original row 1, then the newly added empty row.
    expect(nodeAfterRemove.inputMappings?.[0]).toEqual(initialMappings[1]);
    expect(nodeAfterRemove.inputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: outputMappings list editor supports add + remove rows.
// ---------------------------------------------------------------------------

describe("ChildWorkflowNodeSettings — Scenario 5: outputMappings supports add + remove rows", () => {
  it("Add Row twice then Remove on row 1 transitions outputMappings.length: 1 -> 2 -> 3 -> 2, with TextInput + VariablePicker rows", () => {
    const initialMappings: PortBinding[] = [
      { port: "result", ctxKey: "summary" },
    ];
    const initial = childWorkflowNode("c1", "Child", {
      outputMappings: initialMappings,
    });
    const config = makeConfig([initial], {
      summary: { type: "object" },
    });

    const { spy } = mountWithSpy(config, "c1");

    // Sanity: one row initially.
    expect(
      screen.getByTestId("child-workflow-node-settings-output-row-0"),
    ).toBeInTheDocument();

    // First click Add Row -> length 2.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-add"),
    );
    const afterFirstAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterFirstAdd = afterFirstAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterFirstAdd.outputMappings).toHaveLength(2);
    expect(nodeAfterFirstAdd.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterFirstAdd.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });

    // Second click Add Row -> length 3.
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-add"),
    );
    const afterSecondAdd = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterSecondAdd = afterSecondAdd.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterSecondAdd.outputMappings).toHaveLength(3);
    expect(nodeAfterSecondAdd.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterSecondAdd.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
    expect(nodeAfterSecondAdd.outputMappings?.[2]).toEqual({
      port: "",
      ctxKey: "",
    });

    // Each row is { port: TextInput, ctxKey: VariablePicker }.
    for (const index of [0, 1, 2]) {
      const row = screen.getByTestId(
        `child-workflow-node-settings-output-row-${index}`,
      );
      const portInput = within(row).getByTestId(
        `child-workflow-node-settings-output-row-${index}-port`,
      ) as HTMLInputElement;
      const ctxKeyInput = within(row).getByTestId(
        `child-workflow-node-settings-output-row-${index}-ctx-key`,
      ) as HTMLInputElement;
      expect(portInput.tagName).toBe("INPUT");
      // The VariablePicker is built on Mantine's Autocomplete and forwards
      // `data-testid` to its underlying <input>. Hitting the test-id and
      // seeing an INPUT confirms the picker mounted.
      expect(ctxKeyInput.tagName).toBe("INPUT");
    }

    // Remove row 1 -> length 2 (drops the first added empty row).
    fireEvent.click(
      screen.getByTestId("child-workflow-node-settings-output-row-1-remove"),
    );
    const afterRemove = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    const nodeAfterRemove = afterRemove.nodes.c1 as ChildWorkflowNode;
    expect(nodeAfterRemove.outputMappings).toHaveLength(2);
    // Original row remains plus the second added empty row.
    expect(nodeAfterRemove.outputMappings?.[0]).toEqual(initialMappings[0]);
    expect(nodeAfterRemove.outputMappings?.[1]).toEqual({
      port: "",
      ctxKey: "",
    });
  });
});
