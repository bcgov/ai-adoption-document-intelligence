/**
 * Tests for MapNodeSettings (US-005).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-005-map-node-settings.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("MapNodeSettings — Scenario 3: body pickers list nodes", () => {
  it("entry picker lists all nodes; exit picker lists nodes reachable from the entry", () => {
    const initial = mapNode("m1", "Per-Item");
    const config = makeConfig([
      initial,
      activity("a1", "Body Entry"),
      activity("a2", "Middle"),
      activity("a3", "Body Exit"),
    ]);
    // A linear body a1 → a2 → a3 so, once a1 is the entry, a2 and a3 are
    // reachable and therefore offered as exit candidates.
    config.edges = [
      { id: "e0", source: "a1", target: "a2", type: "normal" },
      { id: "e1", source: "a2", target: "a3", type: "normal" },
    ];

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
  it("editing itemCtxKey fires onConfigChange with the full MapNode carrying the new value and other fields unchanged", async () => {
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

    // D7 — free-text settings fields draft locally and commit on a quiet
    // period (or blur/unmount) instead of once per character, so the commit
    // is asserted through `waitFor` rather than synchronously.
    await waitFor(() => expect(spy).toHaveBeenCalled());
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

// ---------------------------------------------------------------------------
// Body reachability warnings (surface the runtime single-exit constraint)
// ---------------------------------------------------------------------------

describe("MapNodeSettings — body reachability warnings", () => {
  /**
   * A branching body: switch `sw` fans to three leaves; only `poll` is the
   * designated exit. `child` and `approve` dead-end before the exit.
   */
  function branchingConfig(exit: string): GraphWorkflowConfig {
    const m = mapNode("m1", "Per-Item", {
      bodyEntryNodeId: "sw",
      bodyExitNodeId: exit,
    });
    const nodes: GraphNode[] = [
      m,
      { id: "sw", type: "switch", label: "Route", cases: [] },
      activity("child", "Child OCR"),
      activity("poll", "Wait until condition"),
      activity("approve", "Approve"),
    ];
    const config = makeConfig(nodes);
    config.edges = [
      { id: "e0", source: "sw", target: "child", type: "conditional" },
      { id: "e1", source: "sw", target: "poll", type: "conditional" },
      { id: "e2", source: "sw", target: "approve", type: "conditional" },
    ];
    return config;
  }

  it("warns that branches dead-end before the exit, naming them", () => {
    const config = branchingConfig("poll");
    renderSettings(
      <MapNodeSettings
        node={config.nodes.m1 as MapNode}
        config={config}
        onConfigChange={() => undefined}
      />,
    );
    const warning = screen.getByTestId("map-body-deadend-warning");
    expect(warning).toHaveTextContent("Child OCR");
    expect(warning).toHaveTextContent("Approve");
    // Not the unreachable-exit variant.
    expect(
      screen.queryByTestId("map-body-exit-unreachable"),
    ).not.toBeInTheDocument();
  });

  it("shows no warning when every branch reconverges on the exit", () => {
    const m = mapNode("m1", "Per-Item", {
      bodyEntryNodeId: "sw",
      bodyExitNodeId: "merge",
    });
    const config = makeConfig([
      m,
      { id: "sw", type: "switch", label: "Route", cases: [] },
      activity("left", "Left"),
      activity("right", "Right"),
      activity("merge", "Merge"),
    ]);
    config.edges = [
      { id: "e0", source: "sw", target: "left", type: "conditional" },
      { id: "e1", source: "sw", target: "right", type: "conditional" },
      { id: "e2", source: "left", target: "merge", type: "normal" },
      { id: "e3", source: "right", target: "merge", type: "normal" },
    ];
    renderSettings(
      <MapNodeSettings
        node={config.nodes.m1 as MapNode}
        config={config}
        onConfigChange={() => undefined}
      />,
    );
    expect(
      screen.queryByTestId("map-body-deadend-warning"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("map-body-exit-unreachable"),
    ).not.toBeInTheDocument();
  });

  it("restricts the body-exit picker to nodes reachable from the entry", () => {
    // `store` is unreachable from the switch entry, so it must not be offered
    // as an exit. `poll` (reachable) must be.
    const m = mapNode("m1", "Per-Item", {
      bodyEntryNodeId: "sw",
      bodyExitNodeId: "",
    });
    const config = makeConfig([
      m,
      { id: "sw", type: "switch", label: "Route", cases: [] },
      activity("poll", "Wait until condition"),
      activity("store", "Store Results"),
    ]);
    config.edges = [
      { id: "e0", source: "sw", target: "poll", type: "conditional" },
    ];
    renderSettings(
      <MapNodeSettings
        node={config.nodes.m1 as MapNode}
        config={config}
        onConfigChange={() => undefined}
      />,
    );
    const exitPicker = screen.getByTestId("map-node-settings-body-exit");
    fireEvent.click(exitPicker);
    // Scope to the open exit dropdown's options (closed pickers keep their
    // option text in the DOM, so a bare text query would match the unrestricted
    // entry picker).
    const exitLabels = screen
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    expect(exitLabels.some((t) => t.includes("Wait until condition"))).toBe(
      true,
    );
    // `store` is not reachable from the entry → not offered as an exit.
    expect(exitLabels.some((t) => t.includes("Store Results"))).toBe(false);
  });
});

/**
 * G-071 — the body-entry picker had no filter at all, so it offered node types
 * that cannot be a per-item entry. A `source` runs once at intake, a `join`
 * exists to follow a loop, and a `humanGate` inside a body is refused outright
 * by G-070 — offering it would be offering a guaranteed Save error.
 */
describe("MapNodeSettings — G-071 body-entry picker filter", () => {
  function configWithEveryType(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      entryNodeId: "m",
      ctx: { segments: { type: "array" }, currentSegment: { type: "object" } },
      edges: [],
      nodes: {
        m: {
          id: "m",
          type: "map",
          label: "Loop",
          collectionCtxKey: "segments",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        },
        work: {
          id: "work",
          type: "activity",
          label: "Work",
          activityType: "azureOcr.submit",
        },
        intake: {
          id: "intake",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
        },
        collect: {
          id: "collect",
          type: "join",
          label: "Collect",
          sourceMapNodeId: "m",
          strategy: "all",
          resultsCtxKey: "results",
        },
        approve: {
          id: "approve",
          type: "humanGate",
          label: "Approve",
          signal: { name: "approve" },
          timeout: "PT1H",
          onTimeout: "fail",
        },
        inner: {
          id: "inner",
          type: "map",
          label: "Inner loop",
          collectionCtxKey: "segments",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "work",
          bodyExitNodeId: "work",
        },
      },
    } as unknown as GraphWorkflowConfig;
  }

  function openEntryPicker() {
    const picker = screen.getByTestId("map-node-settings-body-entry");
    fireEvent.click(picker);
  }

  it("offers an ordinary activity", () => {
    mountWithSpy(configWithEveryType(), "m");
    openEntryPicker();
    expect(screen.getByRole("option", { name: /Work/ })).toBeInTheDocument();
  });

  it("does not offer a source node", () => {
    mountWithSpy(configWithEveryType(), "m");
    openEntryPicker();
    expect(screen.queryByRole("option", { name: /Upload/ })).toBeNull();
  });

  it("does not offer a join node", () => {
    mountWithSpy(configWithEveryType(), "m");
    openEntryPicker();
    expect(screen.queryByRole("option", { name: /Collect/ })).toBeNull();
  });

  it("does not offer a human gate, which G-070 would refuse anyway", () => {
    mountWithSpy(configWithEveryType(), "m");
    openEntryPicker();
    expect(screen.queryByRole("option", { name: /Approve/ })).toBeNull();
  });

  it("still offers a nested loop — that shape is legitimate", () => {
    mountWithSpy(configWithEveryType(), "m");
    openEntryPicker();
    expect(
      screen.getByRole("option", { name: /Inner loop/ }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D7 — typing cost.
//
// The reviewer's step-7 case: "typing in the field is very laggy... updates
// are causing a lot of the page to re-render when it really shouldn't". Every
// keystroke used to replace the whole workflow config at page level, which
// re-runs the auto-wire resolver (an upstream graph walk per typed input port
// on every node), rewrites downstream bindings, changes the canvas's
// structural fingerprint and re-projects every card.
//
// This counts the mechanism rather than the feel: config writes per burst, and
// renders of a stand-in for the expensive sibling that consumes the config.
// Wall-clock numbers from the running app are in the worklog.
// ---------------------------------------------------------------------------

describe("MapNodeSettings — D7: typing does not rewrite the config per character", () => {
  function mountWithCanvasProbe(
    initialConfig: GraphWorkflowConfig,
    mapNodeId: string,
  ) {
    const configWrites = vi.fn<(next: GraphWorkflowConfig) => void>();
    const probeRenders = { count: 0 };

    /** Stands in for the canvas: re-renders whenever `config` changes identity. */
    function CanvasProbe({ config }: { config: GraphWorkflowConfig }) {
      probeRenders.count += 1;
      return (
        <div data-testid="canvas-probe">{Object.keys(config.nodes).length}</div>
      );
    }

    function Wrapper() {
      const [config, setConfig] = useState<GraphWorkflowConfig>(initialConfig);
      const node = config.nodes[mapNodeId] as MapNode;
      return (
        <>
          <MapNodeSettings
            node={node}
            config={config}
            onConfigChange={(next) => {
              configWrites(next);
              setConfig(next);
            }}
          />
          <CanvasProbe config={config} />
        </>
      );
    }

    const utils = renderSettings(<Wrapper />);
    return { ...utils, configWrites, probeRenders };
  }

  it("a 10-character burst produces ONE config write and no canvas re-render until it commits", async () => {
    const config = makeConfig(
      [
        mapNode("m1", "Run for each item"),
        activity("a1", "Body Entry"),
        activity("a2", "Body Exit"),
      ],
      { documents: { type: "array" } },
    );
    const { configWrites, probeRenders } = mountWithCanvasProbe(config, "m1");

    const rendersBeforeTyping = probeRenders.count;
    const itemField = screen.getByTestId(
      "map-node-settings-item-ctx-key",
    ) as HTMLInputElement;

    const typed = "segmentXY"; // 9 chars + the 10th below
    for (let i = 1; i <= typed.length; i++) {
      fireEvent.change(itemField, { target: { value: typed.slice(0, i) } });
    }
    fireEvent.change(itemField, { target: { value: `${typed}!` } });

    // Mid-burst: the field shows everything typed and NOTHING has reached the
    // config. Before the fix this was 10 writes and 10 probe renders.
    expect(itemField.value).toBe("segmentXY!");
    expect(configWrites).not.toHaveBeenCalled();
    expect(probeRenders.count).toBe(rendersBeforeTyping);

    // ...and the burst commits exactly once when typing stops.
    await waitFor(() => expect(configWrites).toHaveBeenCalledTimes(1));
    expect(
      (configWrites.mock.lastCall?.[0].nodes.m1 as MapNode).itemCtxKey,
    ).toBe("segmentXY!");
    expect(probeRenders.count - rendersBeforeTyping).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D24 — "Why currentSegment? Is this what the node looks for, and if it's
// always this, why do we specify it?"
//
// The factual answer: the name is FREE (a fresh map node starts with an empty
// item key and nothing defaults it), but the `segment.<field>` shorthand in
// conditions is hard-wired to read `ctx.currentSegment`. Both halves have to
// be in the help text, or the reader concludes the field is ceremony.
// ---------------------------------------------------------------------------

describe("MapNodeSettings — D24: the item ctx key explains itself", () => {
  it("says the name is free AND names what currentSegment buys", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "m1",
      nodes: {
        m1: {
          id: "m1",
          type: "map",
          label: "Run for each item",
          collectionCtxKey: "documents",
          itemCtxKey: "",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        },
      },
      edges: [],
      ctx: { documents: { type: "array" } },
    };
    render(
      <MantineProvider>
        <MapNodeSettings
          node={config.nodes.m1 as MapNode}
          config={config}
          onConfigChange={vi.fn()}
        />
      </MantineProvider>,
    );

    const description = screen
      .getByTestId("map-node-settings-item-ctx-key")
      .closest(".mantine-InputWrapper-root")?.textContent;
    expect(description).toContain("Any name works");
    expect(description).toContain("segment.field shorthand");
    expect(description).toContain("always reads currentSegment");
  });
});
