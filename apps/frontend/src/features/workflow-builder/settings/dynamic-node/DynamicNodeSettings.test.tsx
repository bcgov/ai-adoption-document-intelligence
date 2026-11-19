/**
 * Tests for `DynamicNodeSettings`, the settings body of a custom (`dyn.*`)
 * step, when the step's lineage has been deleted.
 *
 * A deleted lineage is listed nowhere and its script cannot be fetched; the
 * backend restores it when a new node is published under the same name. The
 * alert has to say that, since it is the only way back.
 */

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  GraphWorkflowConfig,
} from "../../../../types/workflow";
import { DynamicNodeSettings } from "./DynamicNodeSettings";

// The catalog has loaded and does not list the step's lineage: that is how
// the settings body knows the lineage was deleted.
vi.mock("../../dynamic-nodes/useActivityCatalog", () => ({
  useActivityCatalog: () => ({ entries: [], isLoading: false, error: null }),
}));

vi.mock("../../dynamic-nodes/useDynamicNode", () => ({
  useDynamicNode: () => ({ data: undefined, isLoading: false, error: null }),
}));

const node: ActivityNode = {
  id: "goneNode",
  type: "activity",
  label: "Deleted step",
  activityType: "dyn.demo-deleted-node",
};

const config: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "Deleted custom node" },
  entryNodeId: node.id,
  ctx: {},
  nodes: { [node.id]: node },
  edges: [],
};

function renderSettings() {
  return render(
    <MantineProvider>
      <DynamicNodeSettings
        node={node}
        config={config}
        onConfigChange={vi.fn()}
      />
    </MantineProvider>,
  );
}

describe("DynamicNodeSettings — a deleted custom step", () => {
  it("says that publishing a node with the same name brings it back", () => {
    renderSettings();

    const alert = screen.getByTestId("dynamic-node-settings-deleted-alert");
    expect(alert).toHaveTextContent("This dynamic node was deleted.");
    expect(alert).toHaveTextContent(
      "publish a new dynamic node named demo-deleted-node",
    );
    expect(alert).toHaveTextContent("New custom node in the Activity palette");
    expect(alert).toHaveTextContent(
      "New dynamic node on the Dynamic nodes page",
    );
    expect(alert).toHaveTextContent(
      "That restores it, with its version history continued.",
    );
    expect(alert).toHaveTextContent(
      "Otherwise, delete this step from the workflow.",
    );
  });

  it("does not send the author to the management page, which has no restore", () => {
    renderSettings();

    expect(
      screen.getByTestId("dynamic-node-settings-deleted-alert"),
    ).not.toHaveTextContent(/management page/i);
  });
});
