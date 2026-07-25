import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { describeOrphanedDelete } from "./delete-orphan-warning";

type Nodes = GraphWorkflowConfig["nodes"];

function makeConfig(nodes: Nodes, ctx: GraphWorkflowConfig["ctx"] = {}) {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: [],
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx,
  } as GraphWorkflowConfig;
}

function activity(
  id: string,
  label: string,
  activityType: string,
  extra: Record<string, unknown> = {},
): Nodes[string] {
  return {
    id,
    type: "activity",
    label,
    activityType,
    ...extra,
  } as Nodes[string];
}

/** prep (one output) → one or more consumers reading the same key. */
function graph(consumerIds: string[], ctxKey = "preparedFile") {
  const nodes: Nodes = {
    prep: activity("prep", "Prepare File", "file.prepare", {
      outputs: [{ port: "preparedData", ctxKey }],
    }),
  };
  for (const id of consumerIds) {
    nodes[id] = activity(id, id.toUpperCase(), "azureOcr.submit", {
      inputs: [{ port: "fileData", ctxKey }],
    });
  }
  return makeConfig(nodes, { [ctxKey]: { type: "object" } });
}

describe("describeOrphanedDelete", () => {
  it("returns null when the delete orphans nothing", () => {
    const cfg = graph([]);
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))).toBeNull();
  });

  it("returns null for an empty removal set", () => {
    expect(describeOrphanedDelete(graph(["ocr"]), new Set())).toBeNull();
  });

  it("names the deleted step and counts variables and readers", () => {
    const cfg = graph(["ocr"]);
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.message).toBe(
      'Deleting "Prepare File" leaves 1 variable without a source; 1 step reads it. Continue?',
    );
  });

  it("pluralises both counts", () => {
    const cfg = graph(["a", "b"]);
    cfg.nodes.prep = activity("prep", "Prepare File", "file.prepare", {
      outputs: [
        { port: "preparedData", ctxKey: "preparedFile" },
        { port: "sizeBytes", ctxKey: "sizeBytes" },
      ],
    });
    cfg.nodes.c = activity("c", "C", "azureOcr.poll", {
      inputs: [{ port: "apimRequestId", ctxKey: "sizeBytes" }],
    });
    cfg.ctx = {
      preparedFile: { type: "object" },
      sizeBytes: { type: "number" },
    };
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.message).toBe(
      'Deleting "Prepare File" leaves 2 variables without a source; 3 steps read them. Continue?',
    );
  });

  it("counts a step once even when it reads two orphaned variables", () => {
    const cfg = makeConfig(
      {
        prep: activity("prep", "Prepare File", "file.prepare", {
          outputs: [
            { port: "preparedData", ctxKey: "k1" },
            { port: "sizeBytes", ctxKey: "k2" },
          ],
        }),
        ocr: activity("ocr", "OCR", "azureOcr.poll", {
          inputs: [
            { port: "apimRequestId", ctxKey: "k1" },
            { port: "modelId", ctxKey: "k2" },
          ],
        }),
      },
      { k1: { type: "object" }, k2: { type: "number" } },
    );
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.message).toBe(
      'Deleting "Prepare File" leaves 2 variables without a source; 1 step reads them. Continue?',
    );
  });

  it("says 'these steps' rather than naming one when several nodes are deleted", () => {
    const cfg = graph(["ocr"]);
    cfg.nodes.other = activity("other", "Other", "file.prepare");
    expect(
      describeOrphanedDelete(cfg, new Set(["prep", "other"]))?.message,
    ).toBe(
      "Deleting these 2 steps leaves 1 variable without a source; 1 step reads it. Continue?",
    );
  });

  it("carries the ctx keys to prune", () => {
    const cfg = graph(["ocr"]);
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.ctxKeys).toEqual([
      "preparedFile",
    ]);
  });

  it("still warns for an auto key even though there is no declaration to prune", () => {
    const cfg = graph(["ocr"], "__auto.prep.preparedData");
    cfg.ctx = {};
    const described = describeOrphanedDelete(cfg, new Set(["prep"]));
    expect(described?.message).toContain("1 variable without a source");
    expect(described?.ctxKeys).toEqual(["__auto.prep.preparedData"]);
  });

  it("falls back to the node id when the deleted node has no label", () => {
    const cfg = graph(["ocr"]);
    cfg.nodes.prep = { ...cfg.nodes.prep, label: "" } as Nodes[string];
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.message).toContain(
      'Deleting "prep"',
    );
  });
});
