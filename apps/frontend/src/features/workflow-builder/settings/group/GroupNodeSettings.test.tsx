/**
 * Tests for `GroupNodeSettings` (US-042).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-042-group-settings-panel.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { Notifications, notifications } from "@mantine/notifications";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  ExposedParam,
  GraphNode,
  GraphWorkflowConfig,
  NodeGroup,
} from "../../../../types/workflow";
import { GROUP_ICON_KEYS } from "../../group/group-icons";
import { GroupNodeSettings } from "./GroupNodeSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activityNode(id: string, label: string): ActivityNode {
  return {
    id,
    type: "activity",
    label,
    activityType: "test.noop",
  };
}

function makeConfig(
  nodes: GraphNode[],
  nodeGroups: Record<string, NodeGroup>,
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
    ctx: {},
    nodeGroups,
  };
}

function renderSettings(ui: React.ReactNode) {
  return render(
    <MantineProvider>
      <Notifications />
      {ui}
    </MantineProvider>,
  );
}

/**
 * Wires the panel in a stateful host so each edit can be observed via the
 * spy while still re-rendering with the new value.
 */
function mountWithSpy(initial: GraphWorkflowConfig, groupId: string) {
  const spy = vi.fn<(next: GraphWorkflowConfig) => void>();

  function Wrapper() {
    const [config, setConfig] = useState<GraphWorkflowConfig>(initial);
    return (
      <GroupNodeSettings
        groupId={groupId}
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
// Scenario 1: Selecting a group opens the panel populated with existing values
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — Scenario 1: panel renders pre-populated", () => {
  it("renders label / icon / color with the group's current values", () => {
    const config = makeConfig(
      [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
      {
        g1: {
          label: "Pay-stub branch",
          icon: "scan",
          color: "blue",
          nodeIds: ["n1", "n2"],
        },
      },
    );

    renderSettings(
      <GroupNodeSettings
        groupId="g1"
        config={config}
        onConfigChange={() => undefined}
      />,
    );

    const root = screen.getByTestId("group-node-settings");
    expect(root).toBeInTheDocument();

    const labelInput = screen.getByTestId(
      "group-settings-label",
    ) as HTMLInputElement;
    expect(labelInput.value).toBe("Pay-stub branch");

    const colorInput = screen.getByTestId(
      "group-settings-color",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("blue");

    const iconInput = screen.getByTestId(
      "group-settings-icon",
    ) as HTMLInputElement;
    // Mantine Select's hidden input or label-text input reflects the value.
    expect(iconInput.value).toBe("scan");
  });

  it("renders a friendly 'Group not found' message when the id is missing", () => {
    const config = makeConfig([activityNode("n1", "Step 1")], {});
    renderSettings(
      <GroupNodeSettings
        groupId="missing"
        config={config}
        onConfigChange={() => undefined}
      />,
    );
    expect(screen.getByText(/group not found/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Editing label propagates via onConfigChange
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — Scenario 2: editing label propagates", () => {
  it("typing into the label TextInput fires onConfigChange with the new label", () => {
    const config = makeConfig(
      [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
      {
        g1: {
          label: "Pay-stub branch",
          nodeIds: ["n1", "n2"],
        },
      },
    );

    const { spy } = mountWithSpy(config, "g1");

    const labelInput = screen.getByTestId(
      "group-settings-label",
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Renamed branch" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.label).toBe("Renamed branch");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Icon picker surfaces the GROUP_ICONS keys
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — Scenario 3: icon picker uses GROUP_ICONS", () => {
  it("opens a dropdown that lists every key from GROUP_ICONS and updates the icon on select", () => {
    const config = makeConfig(
      [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
      {
        g1: {
          label: "Group 1",
          icon: "scan",
          nodeIds: ["n1", "n2"],
        },
      },
    );

    const { spy } = mountWithSpy(config, "g1");

    const iconSelect = screen.getByTestId("group-settings-icon");
    // Open the Mantine Select dropdown.
    fireEvent.click(iconSelect);

    // Every key in GROUP_ICONS should be visible as an option.
    for (const key of GROUP_ICON_KEYS) {
      // There may be multiple matches (the trigger shows the selected key
      // too); we just need at least one rendered option per key.
      const matches = screen.getAllByText(key);
      expect(matches.length).toBeGreaterThan(0);
    }

    // Pick a different icon.
    const pickerOption = screen.getAllByText("validate");
    fireEvent.click(pickerOption[pickerOption.length - 1]);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.icon).toBe("validate");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Color picker fires onConfigChange with updated color
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — Scenario 4: color picker updates color", () => {
  it("typing into the color input fires onConfigChange with the new color", () => {
    const config = makeConfig(
      [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
      {
        g1: {
          label: "Group 1",
          color: "#3b82f6",
          nodeIds: ["n1", "n2"],
        },
      },
    );

    const { spy } = mountWithSpy(config, "g1");

    const colorInput = screen.getByTestId(
      "group-settings-color",
    ) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#10b981" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.color).toBe("#10b981");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Delete group button removes nodeGroups[g1]; nodes untouched
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — Scenario 5: delete group removes only the entry", () => {
  it("clicking the delete button removes the group entry but leaves the nodes intact", () => {
    const n1 = activityNode("n1", "Step 1");
    const n2 = activityNode("n2", "Step 2");
    const config = makeConfig([n1, n2], {
      g1: {
        label: "Pay-stub branch",
        nodeIds: ["n1", "n2"],
      },
      g2: {
        label: "Other",
        nodeIds: ["n2"],
      },
    });

    const { spy } = mountWithSpy(config, "g1");

    const deleteBtn = screen.getByTestId("group-settings-delete");
    fireEvent.click(deleteBtn);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1).toBeUndefined();
    // Other groups stay.
    expect(next.nodeGroups?.g2).toBeDefined();
    // The underlying nodes are NOT touched.
    expect(next.nodes.n1).toEqual(n1);
    expect(next.nodes.n2).toEqual(n2);
  });
});

// ---------------------------------------------------------------------------
// Placeholder section + node membership display
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — companion behaviour", () => {
  it("renders the ExposedParamsEditor with the group's exposedParams (US-044)", () => {
    const config = makeConfig(
      [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
      {
        g1: {
          label: "Group 1",
          nodeIds: ["n1", "n2"],
          exposedParams: [
            { label: "Foo", path: "nodes.n1.x", type: "string", nodeId: "n1" },
          ],
        },
      },
    );
    renderSettings(
      <GroupNodeSettings
        groupId="g1"
        config={config}
        onConfigChange={() => undefined}
      />,
    );
    expect(screen.getByTestId("exposed-params-editor")).toBeInTheDocument();
    expect(screen.getByTestId("exposed-params-row-0")).toBeInTheDocument();
    expect(
      (screen.getByTestId("exposed-params-label-0") as HTMLInputElement).value,
    ).toBe("Foo");
  });

  it("lists node labels and lets the user remove one (with > 1 remaining)", () => {
    const config = makeConfig(
      [
        activityNode("n1", "Step 1"),
        activityNode("n2", "Step 2"),
        activityNode("n3", "Step 3"),
      ],
      { g1: { label: "Group 1", nodeIds: ["n1", "n2", "n3"] } },
    );
    const { spy } = mountWithSpy(config, "g1");

    const list = screen.getByTestId("group-settings-node-list");
    expect(within(list).getByText("Step 1")).toBeInTheDocument();
    expect(within(list).getByText("Step 2")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("group-settings-remove-node-n2"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
    expect(next.nodeGroups?.g1.nodeIds).toEqual(["n1", "n3"]);
    // Nodes themselves were not touched.
    expect(next.nodes.n2).toBeDefined();
  });

  it("removing the last remaining node deletes the group entirely (after confirm)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const config = makeConfig(
        [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
        { g1: { label: "Group 1", nodeIds: ["n1"] } },
      );
      const { spy } = mountWithSpy(config, "g1");

      fireEvent.click(screen.getByTestId("group-settings-remove-node-n1"));

      expect(confirmSpy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      expect(next.nodeGroups?.g1).toBeUndefined();
      // The node itself stays.
      expect(next.nodes.n1).toBeDefined();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// US-044 Scenario 5 — removing a group member prunes its exposedParams and
// surfaces the prune via a Mantine notifications.show toast.
// ---------------------------------------------------------------------------

describe("GroupNodeSettings — US-044 Scenario 5: prunes exposedParams on member removal", () => {
  it("drops any exposedParams entry whose nodeId references the removed node and shows a toast", () => {
    const showSpy = vi.spyOn(notifications, "show");
    try {
      const exposedParams: ExposedParam[] = [
        { label: "Keep", path: "nodes.n1.a", type: "string", nodeId: "n1" },
        { label: "Drop1", path: "nodes.n2.b", type: "string", nodeId: "n2" },
        { label: "Drop2", path: "nodes.n2.c", type: "number", nodeId: "n2" },
      ];
      const config = makeConfig(
        [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
        {
          g1: {
            label: "Group 1",
            nodeIds: ["n1", "n2"],
            exposedParams,
          },
        },
      );

      const { spy } = mountWithSpy(config, "g1");

      fireEvent.click(screen.getByTestId("group-settings-remove-node-n2"));

      expect(spy).toHaveBeenCalled();
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updatedGroup = next.nodeGroups?.g1;
      expect(updatedGroup).toBeDefined();
      expect(updatedGroup?.nodeIds).toEqual(["n1"]);

      const updatedParams = updatedGroup?.exposedParams ?? [];
      // Only the "Keep" row referencing n1 should survive.
      expect(updatedParams).toHaveLength(1);
      expect(updatedParams[0].label).toBe("Keep");
      expect(updatedParams[0].nodeId).toBe("n1");
      // No surviving row should reference n2.
      expect(updatedParams.some((p) => p.nodeId === "n2")).toBe(false);

      // Toast surfaced with the dropped count + the node label.
      expect(showSpy).toHaveBeenCalledTimes(1);
      const toast = showSpy.mock.calls[0][0];
      expect(toast.title).toBe("Exposed parameter dropped");
      expect(toast.message).toContain("2");
      expect(toast.message).toContain("Step 2");
    } finally {
      showSpy.mockRestore();
    }
  });

  it("does NOT show a toast when no exposedParams reference the removed node", () => {
    const showSpy = vi.spyOn(notifications, "show");
    try {
      const exposedParams: ExposedParam[] = [
        { label: "Keep", path: "nodes.n1.a", type: "string", nodeId: "n1" },
      ];
      const config = makeConfig(
        [activityNode("n1", "Step 1"), activityNode("n2", "Step 2")],
        {
          g1: {
            label: "Group 1",
            nodeIds: ["n1", "n2"],
            exposedParams,
          },
        },
      );

      const { spy } = mountWithSpy(config, "g1");

      fireEvent.click(screen.getByTestId("group-settings-remove-node-n2"));

      expect(spy).toHaveBeenCalled();
      const next = spy.mock.lastCall?.[0] as GraphWorkflowConfig;
      const updatedGroup = next.nodeGroups?.g1;
      expect(updatedGroup?.nodeIds).toEqual(["n1"]);
      expect(updatedGroup?.exposedParams).toHaveLength(1);

      expect(showSpy).not.toHaveBeenCalled();
    } finally {
      showSpy.mockRestore();
    }
  });
});
