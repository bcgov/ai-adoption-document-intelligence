/**
 * Integration tests for NodeSettingsPanel (US-010).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-010-node-settings-panel-wiring.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1", name: "Group 1" } }),
}));

vi.mock("../../../data/services/api.service", () => ({
  apiService: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith("/workflows?") || url === "/workflows") {
        return { success: true, data: { workflows: [] } };
      }
      return { success: false, message: "no test data for this id" };
    }),
  },
}));

import type {
  ActivityNode,
  ChildWorkflowNode,
  ConditionExpression,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SourceNode,
  SwitchNode,
} from "../../../types/workflow";
import { NodeSettingsPanel } from "./NodeSettingsPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CONDITION: ConditionExpression = {
  operator: "equals",
  left: { ref: "" },
  right: { ref: "" },
};

function activityNode(id: string, label: string): ActivityNode {
  return {
    id,
    type: "activity",
    label,
    activityType: "test.noop",
    inputs: [{ port: "in", ctxKey: "ctx.in" }],
  };
}

function switchNode(id: string, label: string): SwitchNode {
  return {
    id,
    type: "switch",
    label,
    cases: [],
  };
}

function mapNode(id: string, label: string): MapNode {
  return {
    id,
    type: "map",
    label,
    collectionCtxKey: "ctx.items",
    itemCtxKey: "ctx.item",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
  };
}

function joinNode(id: string, label: string): JoinNode {
  return {
    id,
    type: "join",
    label,
    sourceMapNodeId: "",
    strategy: "all",
    resultsCtxKey: "ctx.results",
  };
}

function childWorkflowNode(id: string, label: string): ChildWorkflowNode {
  return {
    id,
    type: "childWorkflow",
    label,
    workflowRef: { type: "library", workflowId: "" },
  };
}

function pollUntilNode(id: string, label: string): PollUntilNode {
  return {
    id,
    type: "pollUntil",
    label,
    activityType: "",
    condition: { ...EMPTY_CONDITION },
    interval: "30s",
  };
}

function humanGateNode(id: string, label: string): HumanGateNode {
  return {
    id,
    type: "humanGate",
    label,
    signal: { name: "approve" },
    timeout: "1h",
    onTimeout: "fail",
  };
}

function sourceNode(id: string, label: string): SourceNode {
  return {
    id,
    type: "source",
    label,
    sourceType: "source.api",
    parameters: { fields: [] },
  };
}

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[] = [],
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

function renderPanel(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>{ui}</MantineProvider>
    </QueryClientProvider>,
  );
}

/**
 * Mount NodeSettingsPanel with a controlled config + spies so tests can
 * select different nodes in the same mounted instance and inspect the
 * latest mutations.
 */
function mountWithSpy(
  initialConfig: GraphWorkflowConfig,
  initialSelectedNodeId: string,
) {
  const onConfigChange = vi.fn<(next: GraphWorkflowConfig) => void>();
  const onDeleteSelected = vi.fn<() => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
      initialSelectedNodeId,
    );
    return (
      <>
        {/* Tiny selector so a test can change the current selection without
            having to re-render the wrapping component itself. */}
        <select
          data-testid="test-select-node"
          value={selectedNodeId ?? ""}
          onChange={(event) =>
            setSelectedNodeId(
              event.currentTarget.value === ""
                ? null
                : event.currentTarget.value,
            )
          }
        >
          <option value="">(none)</option>
          {Object.keys(config.nodes).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <NodeSettingsPanel
          config={config}
          selectedNodeId={selectedNodeId}
          onConfigChange={(next) => {
            onConfigChange(next);
            setConfig(next);
          }}
          onDeleteSelected={onDeleteSelected}
        />
      </>
    );
  }

  const utils = renderPanel(<Wrapper />);
  return { ...utils, onConfigChange, onDeleteSelected };
}

function selectNode(nodeId: string) {
  fireEvent.change(screen.getByTestId("test-select-node"), {
    target: { value: nodeId },
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: each control-flow node type mounts its matching per-type body
// and the legacy "Settings for {type} nodes are not yet supported" stub is
// gone.
// ---------------------------------------------------------------------------

describe("NodeSettingsPanel — Scenario 1: per-type body mounts for each node type", () => {
  it("clicking each non-activity node renders the matching per-type form body", () => {
    const nodes: GraphNode[] = [
      activityNode("a1", "Activity"),
      switchNode("sw1", "Branch"),
      mapNode("m1", "Fan out"),
      joinNode("j1", "Fan in"),
      childWorkflowNode("cw1", "Child WF"),
      pollUntilNode("p1", "Poll"),
      humanGateNode("h1", "Gate"),
    ];
    const config = makeConfig(nodes);

    mountWithSpy(config, "sw1");

    // Switch body mounts when sw1 is selected; legacy stub absent.
    expect(screen.getByTestId("switch-node-settings")).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();

    selectNode("m1");
    expect(screen.getByTestId("map-node-settings")).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();

    selectNode("j1");
    expect(screen.getByTestId("join-node-settings")).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();

    selectNode("cw1");
    expect(
      screen.getByTestId("child-workflow-node-settings"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();

    selectNode("p1");
    expect(screen.getByTestId("poll-until-node-settings")).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();

    selectNode("h1");
    expect(screen.getByTestId("human-gate-node-settings")).toBeInTheDocument();
    expect(screen.queryByText(/not yet supported in V2/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: shared header is preserved across all node types
// ---------------------------------------------------------------------------

describe("NodeSettingsPanel — Scenario 2: shared header is present for every node type", () => {
  it.each<{ nodeId: string; nodeType: GraphNode["type"]; node: GraphNode }>([
    { nodeId: "a1", nodeType: "activity", node: activityNode("a1", "Act") },
    { nodeId: "sw1", nodeType: "switch", node: switchNode("sw1", "Branch") },
    { nodeId: "m1", nodeType: "map", node: mapNode("m1", "Fan out") },
    { nodeId: "j1", nodeType: "join", node: joinNode("j1", "Fan in") },
    {
      nodeId: "cw1",
      nodeType: "childWorkflow",
      node: childWorkflowNode("cw1", "Child WF"),
    },
    { nodeId: "p1", nodeType: "pollUntil", node: pollUntilNode("p1", "Poll") },
    { nodeId: "h1", nodeType: "humanGate", node: humanGateNode("h1", "Gate") },
  ])("renders label input, type badge, and delete button for $nodeType", ({
    nodeId,
    nodeType,
    node,
  }) => {
    const config = makeConfig([node]);
    const { onDeleteSelected } = mountWithSpy(config, nodeId);

    // Label input present and reflects the node's label.
    const labelInput = screen.getByTestId(
      "node-settings-label",
    ) as HTMLInputElement;
    expect(labelInput).toBeInTheDocument();
    expect(labelInput.value).toBe(node.label);

    // Type badge present and shows the node's type.
    const typeBadge = screen.getByTestId("node-settings-type-badge");
    expect(typeBadge).toBeInTheDocument();
    expect(typeBadge.textContent).toBe(nodeType);

    // Delete button present and wired to onDeleteSelected.
    const deleteButton = screen.getByTestId("node-settings-delete");
    expect(deleteButton).toBeInTheDocument();
    fireEvent.click(deleteButton);
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: shared footer (input/output port bindings) is preserved
// ---------------------------------------------------------------------------

describe("NodeSettingsPanel — Scenario 3: shared footer (port bindings) is present for every node type", () => {
  it("renders input + output port-binding sections for an activity node", () => {
    const node = activityNode("a1", "Act");
    const config = makeConfig([node]);
    mountWithSpy(config, "a1");

    expect(
      screen.getByTestId("node-settings-input-bindings"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("node-settings-output-bindings"),
    ).toBeInTheDocument();
  });

  it("renders input + output port-binding sections for a control-flow node with existing bindings", () => {
    const node: SwitchNode = {
      ...switchNode("sw1", "Branch"),
      inputs: [{ port: "value", ctxKey: "ctx.value" }],
      outputs: [{ port: "result", ctxKey: "ctx.result" }],
    };
    const config = makeConfig([node]);
    mountWithSpy(config, "sw1");

    const inputs = screen.getByTestId("node-settings-input-bindings");
    const outputs = screen.getByTestId("node-settings-output-bindings");

    expect(inputs).toBeInTheDocument();
    expect(outputs).toBeInTheDocument();

    // Each existing binding renders a row labelled with the port name.
    expect(within(inputs).getByText("value")).toBeInTheDocument();
    expect(within(outputs).getByText("result")).toBeInTheDocument();
  });

  it("renders the footer with 'None.' placeholder for a control-flow node without bindings", () => {
    const node = switchNode("sw1", "Branch");
    const config = makeConfig([node]);
    mountWithSpy(config, "sw1");

    const inputs = screen.getByTestId("node-settings-input-bindings");
    const outputs = screen.getByTestId("node-settings-output-bindings");

    // Both sections are rendered (matching activity-node parity); each
    // surfaces the "None." placeholder when there are no ports / bindings.
    expect(within(inputs).getByText("None.")).toBeInTheDocument();
    expect(within(outputs).getByText("None.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: saving / dirty-state matches activity-node experience —
// onConfigChange bubbles up from per-type form edits and from the shared
// header's label input.
// ---------------------------------------------------------------------------

describe("NodeSettingsPanel — Scenario 4: edits bubble up via onConfigChange", () => {
  it("editing the shared label input on a control-flow node fires onConfigChange with the updated node", () => {
    const node = switchNode("sw1", "Branch");
    const config = makeConfig([node]);
    const { onConfigChange } = mountWithSpy(config, "sw1");

    const labelInput = screen.getByTestId("node-settings-label");
    fireEvent.change(labelInput, { target: { value: "Renamed Branch" } });

    expect(onConfigChange).toHaveBeenCalled();
    const lastCall = onConfigChange.mock.lastCall;
    expect(lastCall).toBeDefined();
    const next = lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    expect(updated.label).toBe("Renamed Branch");
    // Type discriminant preserved.
    expect(updated.type).toBe("switch");
    // Switch-only field (cases) preserved.
    expect(updated.cases).toEqual([]);
  });

  it("editing a per-type form field (switch Add Case) fires onConfigChange with the updated node", () => {
    const node = switchNode("sw1", "Branch");
    const config = makeConfig([node]);
    const { onConfigChange } = mountWithSpy(config, "sw1");

    fireEvent.click(screen.getByTestId("switch-node-settings-add-case"));

    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.sw1 as SwitchNode;
    expect(updated.cases).toHaveLength(1);
  });

  it("editing the shared label input on an activity node fires onConfigChange with the updated activity node", () => {
    const node = activityNode("a1", "Act");
    const config = makeConfig([node]);
    const { onConfigChange } = mountWithSpy(config, "a1");

    const labelInput = screen.getByTestId("node-settings-label");
    fireEvent.change(labelInput, { target: { value: "Renamed Activity" } });

    expect(onConfigChange).toHaveBeenCalled();
    const next = onConfigChange.mock.lastCall?.[0] as GraphWorkflowConfig;
    const updated = next.nodes.a1 as ActivityNode;
    expect(updated.label).toBe("Renamed Activity");
    expect(updated.type).toBe("activity");
    expect(updated.activityType).toBe("test.noop");
    // Inputs preserved.
    expect(updated.inputs).toEqual([{ port: "in", ctxKey: "ctx.in" }]);
  });
});

// ---------------------------------------------------------------------------
// US-119 Scenario 1: dispatch routes source nodes to SourceNodeSettings
// ---------------------------------------------------------------------------

describe("NodeSettingsPanel — US-119 Scenario 1: source dispatch", () => {
  it("renders SourceNodeSettings when a source node is selected", () => {
    const node = sourceNode("src1", "API endpoint");
    const config = makeConfig([node]);
    mountWithSpy(config, "src1");

    expect(screen.getByTestId("source-node-settings")).toBeInTheDocument();
    // Catalog-driven displayName surfaces in the body header.
    expect(
      screen.getByTestId("source-node-settings-display-name"),
    ).toHaveTextContent("API endpoint");
  });

  it("leaves the activity / control-flow branches unchanged", () => {
    const nodes: GraphNode[] = [
      activityNode("a1", "Activity"),
      switchNode("sw1", "Branch"),
      sourceNode("src1", "API endpoint"),
    ];
    const config = makeConfig(nodes);
    mountWithSpy(config, "a1");

    // Activity branch is unchanged — no source-settings body present.
    expect(screen.queryByTestId("source-node-settings")).toBeNull();

    selectNode("sw1");
    // Switch branch still renders its dedicated body.
    expect(screen.getByTestId("switch-node-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("source-node-settings")).toBeNull();

    selectNode("src1");
    expect(screen.getByTestId("source-node-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("switch-node-settings")).toBeNull();
  });
});
