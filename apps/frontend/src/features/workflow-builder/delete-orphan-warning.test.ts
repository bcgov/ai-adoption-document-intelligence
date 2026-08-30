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

/**
 * prep (one output) → one or more consumers reading the same key.
 *
 * `entryNodeId` is pinned to a dedicated `start` node rather than defaulting
 * to `prep`, so these fixtures exercise the ORPHAN message alone. Deleting the
 * entry node adds a promotion clause (G-039), which has its own describe block
 * below — keeping the two apart is what lets each set of assertions stay exact.
 */
function graph(consumerIds: string[], ctxKey = "preparedFile") {
  const nodes: Nodes = {
    start: activity("start", "Start", "file.prepare"),
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
      'Deleted "Prepare File" — 1 variable lost its source; 1 step reads it.',
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
      'Deleted "Prepare File" — 2 variables lost their source; 3 steps read them.',
    );
  });

  it("counts a step once even when it reads two orphaned variables", () => {
    const cfg = makeConfig(
      {
        start: activity("start", "Start", "file.prepare"),
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
      'Deleted "Prepare File" — 2 variables lost their source; 1 step reads them.',
    );
  });

  it("says '2 steps' rather than naming one when several nodes are deleted", () => {
    const cfg = graph(["ocr"]);
    cfg.nodes.other = activity("other", "Other", "file.prepare");
    expect(
      describeOrphanedDelete(cfg, new Set(["prep", "other"]))?.message,
    ).toBe("Deleted 2 steps — 1 variable lost its source; 1 step reads it.");
  });

  it("carries the ctx keys to prune", () => {
    const cfg = graph(["ocr"]);
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.ctxKeys).toEqual([
      "preparedFile",
    ]);
  });

  it("still reports an auto key even though there is no declaration to prune", () => {
    const cfg = graph(["ocr"], "__auto.prep.preparedData");
    cfg.ctx = {};
    const described = describeOrphanedDelete(cfg, new Set(["prep"]));
    expect(described?.message).toContain("1 variable lost its source");
    expect(described?.ctxKeys).toEqual(["__auto.prep.preparedData"]);
  });

  it("falls back to the node id when the deleted node has no label", () => {
    const cfg = graph(["ocr"]);
    cfg.nodes.prep = { ...cfg.nodes.prep, label: "" } as Nodes[string];
    expect(describeOrphanedDelete(cfg, new Set(["prep"]))?.message).toContain(
      'Deleted "prep"',
    );
  });
});

/**
 * G-039 — deleting the entry step silently promoted whichever node happened to
 * be first in the record. That is a change to where the workflow STARTS, and
 * it was reported nowhere.
 */
describe("describeOrphanedDelete — entry-node promotion (G-039)", () => {
  it("reports the promotion even when nothing is orphaned", () => {
    const cfg = graph([]);
    cfg.entryNodeId = "prep";
    const warning = describeOrphanedDelete(cfg, new Set(["prep"]));
    expect(warning?.message).toContain("that was the starting step");
    expect(warning?.message).toContain('"Start" now starts the workflow');
    expect(warning?.ctxKeys).toEqual([]);
  });

  it("names the node the delete will actually adopt", () => {
    const cfg = graph([]);
    cfg.entryNodeId = "prep";
    const warning = describeOrphanedDelete(cfg, new Set(["prep"]));
    expect(warning?.promotedEntryNodeId).toBe("start");
  });

  it("prefers a source node over an arbitrary survivor", () => {
    const cfg = makeConfig({
      prep: activity("prep", "Prepare File", "file.prepare"),
      later: activity("later", "Later", "azureOcr.submit"),
      intake: {
        id: "intake",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
      } as Nodes[string],
    });
    cfg.entryNodeId = "prep";
    expect(
      describeOrphanedDelete(cfg, new Set(["prep"]))?.promotedEntryNodeId,
    ).toBe("intake");
  });

  it("prefers a survivor with no inbound edges over one with them", () => {
    const cfg = makeConfig({
      prep: activity("prep", "Prepare File", "file.prepare"),
      downstream: activity("downstream", "Downstream", "azureOcr.submit"),
      root: activity("root", "Root", "file.prepare"),
    });
    cfg.entryNodeId = "prep";
    cfg.edges = [
      { id: "e1", source: "root", target: "downstream", type: "normal" },
    ];
    // `downstream` comes first in the record but has an inbound edge, so it
    // cannot be a starting step — `root` is the only real root.
    expect(
      describeOrphanedDelete(cfg, new Set(["prep"]))?.promotedEntryNodeId,
    ).toBe("root");
  });

  it("says so when nothing is left to start from", () => {
    const cfg = makeConfig({
      only: activity("only", "Only", "file.prepare"),
    });
    const warning = describeOrphanedDelete(cfg, new Set(["only"]));
    expect(warning?.message).toContain("nothing is left to start from");
    expect(warning?.promotedEntryNodeId).toBe("");
  });

  it("adds the promotion clause to an orphan message rather than replacing it", () => {
    const cfg = graph(["ocr"]);
    cfg.entryNodeId = "prep";
    const message = describeOrphanedDelete(cfg, new Set(["prep"]))?.message;
    expect(message).toContain("1 variable lost its source");
    expect(message).toContain("that was the starting step");
  });

  it("stays silent about promotion when the entry node survives", () => {
    const warning = describeOrphanedDelete(graph(["ocr"]), new Set(["prep"]));
    expect(warning?.message).not.toContain("starting step");
    expect(warning?.promotedEntryNodeId).toBeUndefined();
  });
});
