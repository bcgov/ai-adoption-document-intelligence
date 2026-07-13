/**
 * Tests for `computePortRows` / `estimateNodeHeight` — pure selectors that
 * turn a node's activity-catalog entry into per-port row models and roll
 * the row count up into an estimated card height.
 */
import { describe, expect, it } from "vitest";
import type { ActivityNode, SwitchNode } from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import { deriveWires } from "./derive-wires";
import {
  computePortRows,
  estimateNodeHeight,
  NODE_BASE_HEIGHT,
  PORT_ROW_HEIGHT,
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
      kind: "Document",
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
    expect(estimateNodeHeight(cfg, "Sw")).toBe(NODE_BASE_HEIGHT);
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
    expect(estimateNodeHeight(cfg, "E")).toBe(
      NODE_BASE_HEIGHT + 5 * PORT_ROW_HEIGHT,
    );
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
