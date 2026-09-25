/**
 * Tests for `ExposedParamsEditor` (US-044).
 *
 * Each `describe` block corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-044-exposed-params-editor.md.
 *
 * The component edits a list of `ExposedParam` rows. The underlying
 * `ExposedParam.type` union is `"string" | "number" | "boolean" | "select"
 * | "duration"` — the editor surfaces a subset (`string`, `number`,
 * `boolean`, `select`) per the story spec; the user-facing label for
 * `select` is "Enum" so it lines up with the spec's wording.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  ExposedParam,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../../types/workflow";
import { ExposedParamsEditor } from "./ExposedParamsEditor";

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

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

interface MountOptions {
  initial: ExposedParam[];
  nodeIds: string[];
  config: GraphWorkflowConfig;
}

function mountWithSpy({ initial, nodeIds, config }: MountOptions) {
  const spy = vi.fn<(next: ExposedParam[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<ExposedParam[]>(initial);
    return (
      <ExposedParamsEditor
        value={value}
        nodeIds={nodeIds}
        config={config}
        onChange={(next) => {
          spy(next);
          setValue(next);
        }}
      />
    );
  }

  const utils = renderEditor(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: List shell with Add and 4 row inputs present
// ---------------------------------------------------------------------------

describe("ExposedParamsEditor — Scenario 1: list shell + add + row inputs", () => {
  it("renders the empty-state line when value is empty plus an Add button", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);

    renderEditor(
      <ExposedParamsEditor
        value={[]}
        nodeIds={["n1", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("exposed-params-editor")).toBeInTheDocument();
    expect(screen.getByText(/no exposed parameters/i)).toBeInTheDocument();
    expect(screen.getByTestId("exposed-params-editor-add")).toBeInTheDocument();
  });

  it("clicking Add adds a fresh row with label, nodeId, paramPath, and type inputs", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);

    const { spy } = mountWithSpy({
      initial: [],
      nodeIds: ["n1", "n2"],
      config,
    });

    fireEvent.click(screen.getByTestId("exposed-params-editor-add"));

    expect(spy).toHaveBeenCalled();
    const added = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(added).toHaveLength(1);

    const row = screen.getByTestId("exposed-params-row-0");
    expect(row).toBeInTheDocument();
    expect(
      within(row).getByTestId("exposed-params-label-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("exposed-params-node-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("exposed-params-path-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("exposed-params-type-0"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Edits propagate via onChange
// ---------------------------------------------------------------------------

describe("ExposedParamsEditor — Scenario 2: edits propagate", () => {
  it("editing label fires onChange with the updated label", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      { label: "Initial", path: "n1.params.x", type: "string" },
    ];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    const labelInput = screen.getByTestId(
      "exposed-params-label-0",
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Renamed" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].label).toBe("Renamed");
    expect(next[0].path).toBe("n1.params.x");
    expect(next[0].type).toBe("string");
  });

  it("editing param path fires onChange with the updated path", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      { label: "L", path: "n1.params.x", type: "string" },
    ];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    const pathInput = screen.getByTestId(
      "exposed-params-path-0",
    ) as HTMLInputElement;
    fireEvent.change(pathInput, { target: { value: "n1.params.y" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].path).toBe("n1.params.y");
  });

  it("editing nodeId via the Select fires onChange with the new node id", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    const nodeSelect = screen.getByTestId("exposed-params-node-0");
    fireEvent.click(nodeSelect);

    // Click the option whose visible text is the n2 label.
    const options = screen.getAllByText("Step 2");
    fireEvent.click(options[options.length - 1]);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].nodeId).toBe("n2");
  });

  it("editing type via the Select fires onChange with the new type", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    const typeSelect = screen.getByTestId("exposed-params-type-0");
    fireEvent.click(typeSelect);

    const options = screen.getAllByText("Number");
    fireEvent.click(options[options.length - 1]);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].type).toBe("number");
  });

  it("removing a row drops it from the value array", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      { label: "A", path: "n1.x", type: "string" },
      { label: "B", path: "n2.y", type: "number" },
    ];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    fireEvent.click(screen.getByTestId("exposed-params-remove-0"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next).toHaveLength(1);
    expect(next[0].label).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: type=enum reveals options[] editor; toggling away hides it
// ---------------------------------------------------------------------------

describe("ExposedParamsEditor — Scenario 3: enum reveals options sub-editor", () => {
  it("renders options[] sub-editor when type === 'select'", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      {
        label: "L",
        path: "p",
        type: "select",
        options: ["alpha", "beta"],
      },
    ];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["n1", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("exposed-params-options-0")).toBeInTheDocument();
    expect(
      (screen.getByTestId("exposed-params-options-0-0") as HTMLInputElement)
        .value,
    ).toBe("alpha");
    expect(
      (screen.getByTestId("exposed-params-options-0-1") as HTMLInputElement)
        .value,
    ).toBe("beta");
  });

  it("hides the options[] editor when type !== 'select'", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["n1", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByTestId("exposed-params-options-0")).toBeNull();
  });

  it("switching to enum from a non-enum type defaults options to []", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1", "n2"], config });

    const typeSelect = screen.getByTestId("exposed-params-type-0");
    fireEvent.click(typeSelect);

    const options = screen.getAllByText("Enum");
    fireEvent.click(options[options.length - 1]);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].type).toBe("select");
    expect(next[0].options).toEqual([]);
  });

  it("supports adding and removing options inside the sub-editor", () => {
    const config = makeConfig([activityNode("n1", "Step 1")]);
    const initial: ExposedParam[] = [
      { label: "L", path: "p", type: "select", options: ["first"] },
    ];
    const { spy } = mountWithSpy({ initial, nodeIds: ["n1"], config });

    fireEvent.click(screen.getByTestId("exposed-params-options-0-add"));

    expect(spy).toHaveBeenCalled();
    let next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].options).toEqual(["first", ""]);

    fireEvent.click(screen.getByTestId("exposed-params-options-0-remove-0"));
    next = spy.mock.lastCall?.[0] as ExposedParam[];
    expect(next[0].options).toEqual([""]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: nodeId Select restricted to group members
// ---------------------------------------------------------------------------

describe("ExposedParamsEditor — Scenario 4: nodeId Select scoped to nodeIds", () => {
  it("only shows ids in `nodeIds` and uses each node's label as the visible text", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
      activityNode("n3", "Step 3 — not in group"),
    ]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["n1", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("exposed-params-node-0"));

    // Members appear as options (visible labels).
    expect(screen.getAllByText("Step 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Step 2").length).toBeGreaterThan(0);
    // Non-members must NOT appear.
    expect(screen.queryByText("Step 3 — not in group")).toBeNull();
  });

  it("falls back to the raw id when a member's node has no label", () => {
    const labellessNode: ActivityNode = {
      id: "no_label",
      type: "activity",
      label: "",
      activityType: "test.noop",
    };
    const config = makeConfig([labellessNode, activityNode("n2", "Step 2")]);
    const initial: ExposedParam[] = [{ label: "L", path: "p", type: "string" }];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["no_label", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("exposed-params-node-0"));
    expect(screen.getAllByText("no_label").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: rows referencing a node not in nodeIds render with stale-warning
// ---------------------------------------------------------------------------

describe("ExposedParamsEditor — Scenario 5: stale row warning", () => {
  it("renders a stale-warning when a row's nodeId is not in nodeIds", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      { label: "L", path: "p", type: "string", nodeId: "n2" },
    ];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["n1"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    // The row still renders so the user can fix the reference.
    expect(screen.getByTestId("exposed-params-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("exposed-params-stale-0")).toBeInTheDocument();
  });

  it("does NOT render a stale warning when nodeId IS in nodeIds", () => {
    const config = makeConfig([
      activityNode("n1", "Step 1"),
      activityNode("n2", "Step 2"),
    ]);
    const initial: ExposedParam[] = [
      { label: "L", path: "p", type: "string", nodeId: "n1" },
    ];

    renderEditor(
      <ExposedParamsEditor
        value={initial}
        nodeIds={["n1", "n2"]}
        config={config}
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByTestId("exposed-params-stale-0")).toBeNull();
  });
});
