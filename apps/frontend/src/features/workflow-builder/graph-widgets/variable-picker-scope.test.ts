import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { buildVariableOptions } from "./VariablePicker";
import { expandVariableOptions } from "./variable-field-options";

/**
 * A map over `document.splitAndClassify` segments: the loop body (bodyStart →
 * mid → bodyEnd) can reference the per-item `currentSegment`, whose element
 * kind is `TypedSegment`. The item key lives on the map node, not on ctx or an
 * activity output, so it is only offered to nodes INSIDE the body — and its
 * fields drill through the map-item unwrap.
 */
const config = {
  schemaVersion: "1.0",
  metadata: { name: "loop-scope" },
  entryNodeId: "split",
  ctx: {},
  nodes: {
    split: {
      id: "split",
      type: "activity",
      activityType: "document.splitAndClassify",
      label: "Split & classify",
      outputs: [{ port: "segments", ctxKey: "segs" }],
    },
    map1: {
      id: "map1",
      type: "map",
      collectionCtxKey: "segs",
      itemCtxKey: "currentSegment",
      indexCtxKey: "segIndex",
      bodyEntryNodeId: "bodyStart",
      bodyExitNodeId: "bodyEnd",
    },
    bodyStart: {
      id: "bodyStart",
      type: "activity",
      activityType: "ocr.cleanup",
      label: "Body start",
    },
    mid: {
      id: "mid",
      type: "activity",
      activityType: "ocr.cleanup",
      label: "Mid",
    },
    bodyEnd: {
      id: "bodyEnd",
      type: "activity",
      activityType: "segment.combineResult",
      label: "Body end",
    },
  },
  edges: [
    { id: "e1", source: "split", target: "map1", type: "normal" },
    { id: "e2", source: "bodyStart", target: "mid", type: "normal" },
    { id: "e3", source: "mid", target: "bodyEnd", type: "normal" },
  ],
} as unknown as GraphWorkflowConfig;

describe("buildVariableOptions — loop variables in scope", () => {
  it("offers a map's item + index vars to nodes inside its body", () => {
    for (const nodeId of ["bodyStart", "mid", "bodyEnd"]) {
      const groups = buildVariableOptions(config, nodeId);
      const loop = groups.find((g) => g.group === "Loop variables");
      expect(loop, `loop group for ${nodeId}`).toBeDefined();
      expect(loop?.items).toEqual(["currentSegment", "segIndex"]);
    }
  });

  it("does NOT offer the item var to a node outside the body", () => {
    const groups = buildVariableOptions(config, "split");
    expect(groups.some((g) => g.group === "Loop variables")).toBe(false);
    expect(groups.flatMap((g) => g.items)).not.toContain("currentSegment");
  });

  it("omits loop vars when no current node is given (scope unknown)", () => {
    const groups = buildVariableOptions(config);
    expect(groups.some((g) => g.group === "Loop variables")).toBe(false);
  });
});

describe("expandVariableOptions — a body node drills the TypedSegment item", () => {
  it("enumerates the item's fields through the map-item unwrap", () => {
    const base = buildVariableOptions(config, "mid");
    const { groups, meta } = expandVariableOptions(base, config, "");
    const items = groups.flatMap((g) => g.items);
    expect(items).toEqual(
      expect.arrayContaining([
        "currentSegment",
        "currentSegment.segmentIndex",
        "currentSegment.pageRange",
        "currentSegment.blobKey",
        "currentSegment.pageCount",
        "currentSegment.segmentType",
        "currentSegment.keywordMatch",
        "currentSegment.confidence",
      ]),
    );
    expect(meta.get("currentSegment.confidence")).toEqual({
      type: "number",
      kind: undefined,
      required: true,
    });
  });
});
