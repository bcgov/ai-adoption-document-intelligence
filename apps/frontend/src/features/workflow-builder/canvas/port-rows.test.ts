/**
 * Tests for `computePortRows` / `estimateNodeHeight` — pure selectors that
 * turn a node's activity-catalog entry into per-port row models and roll
 * the row count up into an estimated card height.
 */
import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SourceNode,
  SwitchNode,
} from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import { deriveWires } from "./derive-wires";
import {
  ACTIVITY_BASE_HEIGHT,
  ACTIVITY_NODE_WIDTH,
  CONTROL_FLOW_NODE_HEIGHT,
  CONTROL_FLOW_NODE_WIDTH,
  computePortRows,
  estimateNodeHeight,
  estimateNodeWidth,
  PORT_ROW_HEIGHT,
  PORT_ROWS_TOP_MARGIN,
  rendersPerPortHandle,
  SOURCE_NODE_HEIGHT,
  SOURCE_NODE_WIDTH,
} from "./port-rows";

describe("computePortRows — Scenario 1: azureOcr.submit with no bindings", () => {
  it("derives the single required input row and the output rows", () => {
    const cfg = config({
      nodes: {
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
      },
    });

    const { inputs, outputs } = computePortRows(cfg, "B", []);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: "fileData",
      handleId: "in-fileData",
      kind: "PreparedFile",
      required: true,
      bound: false,
      needsSource: true,
    });
    expect(inputs[0].label.length).toBeGreaterThan(0);

    expect(outputs).toContainEqual(
      expect.objectContaining({
        name: "apimRequestId",
        handleId: "out-apimRequestId",
        bound: true,
        needsSource: false,
      }),
    );
  });
});

describe("computePortRows — Scenario 2: binding to a declared config.ctx key", () => {
  it("reports bound + fromCtx when no wire targets the port", () => {
    const cfg = config({
      nodes: {
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "docVar" }],
        }),
      },
      ctx: { docVar: { type: "string", isInput: true, kind: "Document" } },
    });

    const { inputs } = computePortRows(cfg, "B", []);
    const fileData = inputs.find((row) => row.name === "fileData");

    expect(fileData).toMatchObject({
      bound: true,
      fromCtx: "docVar",
      needsSource: false,
    });
  });
});

describe("computePortRows — Scenario 3: bound via a real data wire", () => {
  it("reports bound + needsSource:false with no fromCtx chip", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
        }),
      },
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
    });

    const wires = deriveWires(cfg);
    const { inputs } = computePortRows(cfg, "B", wires);
    const fileData = inputs.find((row) => row.name === "fileData");

    expect(fileData).toMatchObject({
      bound: true,
      needsSource: false,
    });
    expect(fileData?.fromCtx).toBeUndefined();
  });
});

describe("computePortRows — Scenario 4: non-activity node", () => {
  it("returns empty rows and the base height", () => {
    const cfg = config({
      nodes: {
        Sw: node<SwitchNode>({
          id: "Sw",
          type: "switch",
          cases: [],
        }),
      },
    });

    const { inputs, outputs } = computePortRows(cfg, "Sw", []);
    expect(inputs).toEqual([]);
    expect(outputs).toEqual([]);
    // Switch renders as the 180×180 control-flow diamond — no port rows.
    expect(estimateNodeHeight(cfg, "Sw")).toBe(CONTROL_FLOW_NODE_HEIGHT);
  });
});

describe("computePortRows — Scenario 5: estimateNodeHeight scales with the wider column", () => {
  it("azureOcr.extract (5 inputs / 1 output) sizes off the input column", () => {
    const cfg = config({
      nodes: {
        E: node<ActivityNode>({
          id: "E",
          type: "activity",
          activityType: "azureOcr.extract",
        }),
      },
    });

    const { inputs, outputs } = computePortRows(cfg, "E", []);
    expect(inputs).toHaveLength(5);
    expect(outputs).toHaveLength(1);
    // Calibrated against the rendered card: 177 + 6 + 5×22 = 293px, the
    // measured offsetHeight of azureOcr.extract on the seed workflows.
    expect(estimateNodeHeight(cfg, "E")).toBe(
      ACTIVITY_BASE_HEIGHT + PORT_ROWS_TOP_MARGIN + 5 * PORT_ROW_HEIGHT,
    );
    expect(estimateNodeHeight(cfg, "E")).toBe(293);
  });
});

describe("estimateNodeWidth — per-type card footprint (map-body box enclosure)", () => {
  it("returns the wide activity width for an activity card (so port-row cards aren't clipped)", () => {
    const cfg = config({
      nodes: {
        E: node<ActivityNode>({
          id: "E",
          type: "activity",
          activityType: "azureOcr.extract",
        }),
      },
    });
    expect(estimateNodeWidth(cfg, "E")).toBe(ACTIVITY_NODE_WIDTH);
  });

  it("returns the source width for a source node and the control-flow width otherwise", () => {
    const cfg = config({
      nodes: {
        Up: node<SourceNode>({
          id: "Up",
          type: "source",
          sourceType: "source.upload",
        }),
        Sw: node<SwitchNode>({ id: "Sw", type: "switch", cases: [] }),
      },
    });
    expect(estimateNodeWidth(cfg, "Up")).toBe(SOURCE_NODE_WIDTH);
    expect(estimateNodeWidth(cfg, "Sw")).toBe(CONTROL_FLOW_NODE_WIDTH);
    // Unknown id falls back to the compact control-flow width.
    expect(estimateNodeWidth(cfg, "missing")).toBe(CONTROL_FLOW_NODE_WIDTH);
  });

  it("returns the wide activity width for a pollUntil that renders port rows (G-016)", () => {
    const cfg = config({
      nodes: {
        P: node<PollUntilNode>({
          id: "P",
          type: "pollUntil",
          activityType: "azureOcr.submit",
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: true },
          },
          interval: "30s",
        }),
      },
    });
    expect(estimateNodeWidth(cfg, "P")).toBe(ACTIVITY_NODE_WIDTH);
  });
});

describe("computePortRows — Scenario 6: optional unbound input", () => {
  it("is unbound but does not need a source", () => {
    const cfg = config({
      nodes: {
        E: node<ActivityNode>({
          id: "E",
          type: "activity",
          activityType: "azureOcr.extract",
        }),
      },
    });

    const { inputs } = computePortRows(cfg, "E", []);
    const fileName = inputs.find((row) => row.name === "fileName");

    expect(fileName).toMatchObject({
      required: false,
      bound: false,
      needsSource: false,
    });
  });
});

describe("estimateNodeHeight — per-type routing (calibrated heights)", () => {
  it("sizes a pollUntil card from its port rows, not as a rectangle (G-016)", () => {
    const cfg = config({
      nodes: {
        P: node<PollUntilNode>({
          id: "P",
          type: "pollUntil",
          activityType: "azureOcr.submit",
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: true },
          },
          interval: "30s",
        }),
      },
    });

    // G-016: pollUntil wraps a real activity and now renders `<PortRows>`
    // on the control-flow rectangle chrome, so its height must scale with
    // the taller side's row count exactly as an activity card's does.
    // azureOcr.submit declares 1 input + 3 outputs → 3 rows.
    expect(estimateNodeHeight(cfg, "P")).toBe(
      CONTROL_FLOW_NODE_HEIGHT + PORT_ROWS_TOP_MARGIN + 3 * PORT_ROW_HEIGHT,
    );
  });

  it("still renders switch/map/join as control-flow rectangles", () => {
    const cfg = config({
      nodes: {
        S: node<SwitchNode>({ id: "S", type: "switch", cases: [] }),
        M: node<MapNode>({
          id: "M",
          type: "map",
          collectionCtxKey: "items",
          itemCtxKey: "item",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        }),
        J: node<JoinNode>({
          id: "J",
          type: "join",
          sourceMapNodeId: "M",
          strategy: "all",
          resultsCtxKey: "results",
        }),
      },
    });

    for (const id of ["S", "M", "J"]) {
      expect(estimateNodeHeight(cfg, id)).toBe(CONTROL_FLOW_NODE_HEIGHT);
      expect(estimateNodeWidth(cfg, id)).toBe(CONTROL_FLOW_NODE_WIDTH);
    }
  });

  it("sizes a catalog-less pollUntil at the bare control-flow height", () => {
    const cfg = config({
      nodes: {
        P: node<PollUntilNode>({
          id: "P",
          type: "pollUntil",
          activityType: "dyn.gone",
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: true },
          },
          interval: "30s",
        }),
      },
    });

    expect(estimateNodeHeight(cfg, "P")).toBe(CONTROL_FLOW_NODE_HEIGHT);
    // No rows → the card stays rectangle-narrow.
    expect(estimateNodeWidth(cfg, "P")).toBe(CONTROL_FLOW_NODE_WIDTH);
  });

  it("sizes source nodes with the slimmer source-card height", () => {
    const cfg = config({
      nodes: {
        S: node<SourceNode>({
          id: "S",
          type: "source",
          sourceType: "source.upload",
        }),
      },
    });

    expect(estimateNodeHeight(cfg, "S")).toBe(SOURCE_NODE_HEIGHT);
  });

  it("sizes a catalog-less (dyn.*) activity at the bare activity base", () => {
    const cfg = config({
      nodes: {
        D: node<ActivityNode>({
          id: "D",
          type: "activity",
          activityType: "dyn.custom-script",
        }),
      },
    });

    // No catalog entry → zero rows → no PortRows grid (and no 6px margin).
    expect(estimateNodeHeight(cfg, "D")).toBe(ACTIVITY_BASE_HEIGHT);
  });

  it("falls back to the control-flow height for unknown node ids", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
      },
    });

    expect(estimateNodeHeight(cfg, "missing")).toBe(CONTROL_FLOW_NODE_HEIGHT);
  });
});

describe("rendersPerPortHandle — per-port handle mount predicate", () => {
  it("is true only for catalog-declared ports on activity nodes", () => {
    const cfg = config({
      nodes: {
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
      },
    });

    expect(rendersPerPortHandle(cfg, "B", "fileData", "input")).toBe(true);
    expect(rendersPerPortHandle(cfg, "B", "apimRequestId", "output")).toBe(
      true,
    );
    // Wrong side — `fileData` is an input, not an output.
    expect(rendersPerPortHandle(cfg, "B", "fileData", "output")).toBe(false);
    // Stale binding to a port the entry does not declare (e.g. left over
    // after an activity-type swap).
    expect(rendersPerPortHandle(cfg, "B", "legacyPort", "input")).toBe(false);
  });

  it("is false for dyn.* (catalog-less) activity nodes", () => {
    const cfg = config({
      nodes: {
        D: node<ActivityNode>({
          id: "D",
          type: "activity",
          activityType: "dyn.custom-script",
          inputs: [{ port: "payload", ctxKey: "payload" }],
        }),
      },
    });

    expect(rendersPerPortHandle(cfg, "D", "payload", "input")).toBe(false);
  });

  it("renders per-port handles for a pollUntil node (G-016)", () => {
    const cfg = config({
      nodes: {
        P: node<PollUntilNode>({
          id: "P",
          type: "pollUntil",
          activityType: "azureOcr.submit",
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: true },
          },
          interval: "30s",
        }),
      },
    });

    // G-016: a pollUntil wraps a real catalog activity, so the same
    // catalog-declared ports the settings panel and the problems badge
    // already show must mount a draggable handle on the canvas.
    expect(rendersPerPortHandle(cfg, "P", "fileData", "input")).toBe(true);
    expect(rendersPerPortHandle(cfg, "P", "apimRequestId", "output")).toBe(
      true,
    );
    // Same guards as an activity: wrong side and undeclared ports stay false.
    expect(rendersPerPortHandle(cfg, "P", "fileData", "output")).toBe(false);
    expect(rendersPerPortHandle(cfg, "P", "legacyPort", "input")).toBe(false);
  });

  it("is false for control-flow nodes with no wrapped activity", () => {
    const cfg = config({
      nodes: {
        S: node<SwitchNode>({ id: "S", type: "switch", cases: [] }),
        P: node<PollUntilNode>({
          id: "P",
          type: "pollUntil",
          activityType: "dyn.gone",
          condition: {
            operator: "equals",
            left: { ref: "ctx.x" },
            right: { literal: true },
          },
          interval: "30s",
        }),
      },
    });

    expect(rendersPerPortHandle(cfg, "S", "anything", "input")).toBe(false);
    // A pollUntil whose wrapped type resolves no catalog entry mounts no
    // rows, exactly like a `dyn.*` activity.
    expect(rendersPerPortHandle(cfg, "P", "fileData", "input")).toBe(false);
    expect(rendersPerPortHandle(cfg, "missing", "fileData", "input")).toBe(
      false,
    );
  });
});
