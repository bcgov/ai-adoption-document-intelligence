/**
 * Tests for `nodeLevelEdgeType` / `resolveRunOrderDrop` /
 * `runOrderRefusalMessage` — what a drag begun on a step's node-level dot may
 * become, and the sentence shown when it is refused.
 *
 * The Standard OCR pair is the reported one: Prepare File Data → Submit to
 * Azure OCR, already joined by the data wire that feeds the prepared file in.
 * A run-order wire drawn on top of it changes nothing.
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityNode,
  GraphEdge,
  SwitchNode,
} from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import {
  nodeLevelEdgeType,
  resolveRunOrderDrop,
  runOrderRefusalMessage,
} from "./run-order-drop";

function step(id: string, label: string): ActivityNode {
  return node<ActivityNode>({
    id,
    type: "activity",
    label,
    activityType: "document.split",
  });
}

function edge(
  id: string,
  source: string,
  target: string,
  type: GraphEdge["type"] = "normal",
): GraphEdge {
  return { id, source, target, type };
}

/** Three plain steps; `edges` decides how they are joined. */
function threeSteps(edges: GraphEdge[]) {
  return config({
    nodes: {
      a: step("a", "Step A"),
      b: step("b", "Step B"),
      c: step("c", "Step C"),
    },
    edges,
  });
}

/** Prepare File Data feeding Submit to Azure OCR, as the template wires it. */
function preparedFileFeedsSubmit() {
  return config({
    nodes: {
      prepareFileData: node<ActivityNode>({
        id: "prepareFileData",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
      }),
      submitOcr: node<ActivityNode>({
        id: "submitOcr",
        type: "activity",
        label: "Submit to Azure OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
      }),
    },
    edges: [edge("e2", "prepareFileData", "submitOcr")],
    ctx: { preparedFileData: { type: "object" } },
  });
}

describe("nodeLevelEdgeType", () => {
  it("makes a plain run-order edge from an ordinary step", () => {
    expect(nodeLevelEdgeType(threeSteps([]), "a", "out")).toBe("normal");
  });

  it("makes a branch from a switch", () => {
    const cfg = config({
      nodes: {
        route: node<SwitchNode>({ id: "route", type: "switch", cases: [] }),
        b: step("b", "Step B"),
      },
    });
    expect(nodeLevelEdgeType(cfg, "route", "out")).toBe("conditional");
  });

  it("makes an error path from the error handle, even on a switch", () => {
    const cfg = config({
      nodes: {
        route: node<SwitchNode>({ id: "route", type: "switch", cases: [] }),
        b: step("b", "Step B"),
      },
    });
    expect(nodeLevelEdgeType(threeSteps([]), "a", "error")).toBe("error");
    expect(nodeLevelEdgeType(cfg, "route", "error")).toBe("error");
  });
});

describe("resolveRunOrderDrop — wires that may be drawn", () => {
  it("allows a wire between two steps nothing joins", () => {
    expect(resolveRunOrderDrop(threeSteps([]), "a", "b", "normal")).toEqual({
      kind: "ok",
    });
  });

  it("allows a wire to a step that already runs later through another one", () => {
    // A → B → C, then A → C: harmless, and a real wire the author can see.
    const cfg = threeSteps([edge("ab", "a", "b"), edge("bc", "b", "c")]);
    expect(resolveRunOrderDrop(cfg, "a", "c", "normal")).toEqual({
      kind: "ok",
    });
  });

  it("allows a run-order wire alongside an error path between the same steps", () => {
    const cfg = threeSteps([edge("ab-err", "a", "b", "error")]);
    expect(resolveRunOrderDrop(cfg, "a", "b", "normal")).toEqual({
      kind: "ok",
    });
  });
});

describe("resolveRunOrderDrop — wires that change nothing", () => {
  it("refuses a second run-order wire between the same two steps", () => {
    const cfg = threeSteps([edge("ab", "a", "b")]);
    expect(resolveRunOrderDrop(cfg, "a", "b", "normal")).toEqual({
      kind: "duplicate",
      edgeId: "ab",
    });
  });

  it("refuses a run-order wire where a data wire already sets the order", () => {
    expect(
      resolveRunOrderDrop(
        preparedFileFeedsSubmit(),
        "prepareFileData",
        "submitOcr",
        "normal",
      ),
    ).toEqual({ kind: "duplicate", edgeId: "e2" });
  });
});

describe("resolveRunOrderDrop — wires that would close a loop", () => {
  it("refuses a wire straight back to the step that runs first", () => {
    const cfg = threeSteps([edge("ab", "a", "b")]);
    expect(resolveRunOrderDrop(cfg, "b", "a", "normal")).toEqual({
      kind: "loop",
    });
  });

  it("refuses a wire back through a longer chain", () => {
    const cfg = threeSteps([edge("ab", "a", "b"), edge("bc", "b", "c")]);
    expect(resolveRunOrderDrop(cfg, "c", "a", "normal")).toEqual({
      kind: "loop",
    });
  });

  it("counts an error path as order, as the workflow validator does", () => {
    const cfg = threeSteps([edge("ab-err", "a", "b", "error")]);
    expect(resolveRunOrderDrop(cfg, "b", "a", "normal")).toEqual({
      kind: "loop",
    });
  });
});

describe("runOrderRefusalMessage", () => {
  it("says nothing about a wire that may be drawn", () => {
    expect(
      runOrderRefusalMessage(
        { kind: "ok" },
        threeSteps([]),
        "a",
        "b",
        "normal",
      ),
    ).toBeNull();
  });

  it("names the data wire that already sets the order", () => {
    const cfg = preparedFileFeedsSubmit();
    const verdict = resolveRunOrderDrop(
      cfg,
      "prepareFileData",
      "submitOcr",
      "normal",
    );
    expect(
      runOrderRefusalMessage(
        verdict,
        cfg,
        "prepareFileData",
        "submitOcr",
        "normal",
      ),
    ).toBe(
      '"Submit to Azure OCR" already runs after "Prepare File Data": the data wire between them sets the order.',
    );
  });

  it("names the run-order wire that is already there", () => {
    const cfg = threeSteps([edge("ab", "a", "b")]);
    const verdict = resolveRunOrderDrop(cfg, "a", "b", "normal");
    expect(runOrderRefusalMessage(verdict, cfg, "a", "b", "normal")).toBe(
      '"Step B" already runs after "Step A": a run-order wire already joins them.',
    );
  });

  it("says which way round the loop would go", () => {
    const cfg = threeSteps([edge("ab", "a", "b"), edge("bc", "b", "c")]);
    const verdict = resolveRunOrderDrop(cfg, "c", "a", "normal");
    expect(runOrderRefusalMessage(verdict, cfg, "c", "a", "normal")).toBe(
      'That would make a loop: "Step C" already runs after "Step A".',
    );
  });

  it("names a branch that already exists", () => {
    const cfg = config({
      nodes: {
        route: node<SwitchNode>({
          id: "route",
          type: "switch",
          label: "Needs review?",
          cases: [],
        }),
        b: step("b", "Step B"),
      },
      edges: [edge("rb", "route", "b", "conditional")],
    });
    const verdict = resolveRunOrderDrop(cfg, "route", "b", "conditional");
    expect(
      runOrderRefusalMessage(verdict, cfg, "route", "b", "conditional"),
    ).toBe('"Needs review?" already branches to "Step B".');
  });

  it("names an error path that already exists", () => {
    const cfg = threeSteps([edge("ab-err", "a", "b", "error")]);
    const verdict = resolveRunOrderDrop(cfg, "a", "b", "error");
    expect(runOrderRefusalMessage(verdict, cfg, "a", "b", "error")).toBe(
      '"Step A" already sends its errors to "Step B".',
    );
  });
});
