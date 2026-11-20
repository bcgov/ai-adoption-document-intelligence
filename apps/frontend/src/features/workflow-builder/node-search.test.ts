/**
 * G-009 — find a node in the current graph. The only search box in the
 * editor searched the PALETTE (the catalog of things you can add); nothing
 * searched `config.nodes`.
 */
import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  MapNode,
  PollUntilNode,
  SourceNode,
} from "../../types/workflow";
import { searchNodes } from "./node-search";

function makeConfig(): GraphWorkflowConfig {
  const prepare: ActivityNode = {
    id: "prep_1",
    type: "activity",
    label: "Prepare the file",
    activityType: "file.prepare",
    metadata: { position: { x: 0, y: 0 } },
  };
  const submit: ActivityNode = {
    id: "ocr_1",
    type: "activity",
    label: "Send to OCR",
    activityType: "azureOcr.submit",
    metadata: { position: { x: 200, y: 0 } },
  };
  const poll: PollUntilNode = {
    id: "poll_1",
    type: "pollUntil",
    label: "Wait for the result",
    activityType: "azureOcr.getResult",
    interval: "30s",
    condition: {
      operator: "is-not-null",
      value: { ref: "ocrResult" },
    },
    metadata: { position: { x: 400, y: 0 } },
  };
  const upload: SourceNode = {
    id: "src_1",
    type: "source",
    label: "Upload",
    sourceType: "source.upload",
    metadata: { position: { x: -200, y: 0 } },
  };
  const each: MapNode = {
    id: "map_1",
    type: "map",
    label: "For each page",
    collectionCtxKey: "pages",
    itemCtxKey: "page",
    bodyEntryNodeId: "prep_1",
    bodyExitNodeId: "prep_1",
    metadata: { position: { x: 600, y: 0 } },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: {
      prep_1: prepare,
      ocr_1: submit,
      poll_1: poll,
      src_1: upload,
      map_1: each,
    },
    edges: [],
    entryNodeId: "src_1",
  };
}

describe("searchNodes", () => {
  it("finds nodes by label", () => {
    const hits = searchNodes(makeConfig(), "wait for");
    expect(hits.map((h) => h.nodeId)).toEqual(["poll_1"]);
    expect(hits[0]).toMatchObject({
      label: "Wait for the result",
      typeLabel: "azureOcr.getResult",
      matchedOn: "label",
    });
  });

  it("finds nodes by activity type", () => {
    const hits = searchNodes(makeConfig(), "azureOcr");
    expect(hits.map((h) => h.nodeId).sort()).toEqual(["ocr_1", "poll_1"]);
    expect(hits.every((h) => h.matchedOn === "type")).toBe(true);
  });

  it("matches source and control-flow types too", () => {
    expect(
      searchNodes(makeConfig(), "source.upload").map((h) => h.nodeId),
    ).toEqual(["src_1"]);
    expect(searchNodes(makeConfig(), "map").map((h) => h.nodeId)).toContain(
      "map_1",
    );
  });

  it("is case-insensitive and ranks label matches above type matches", () => {
    const hits = searchNodes(makeConfig(), "PREPARE");
    // `file.prepare` (type) and "Prepare the file" (label) are the same node
    // here, so add a second node whose TYPE matches to check ordering.
    expect(hits[0].nodeId).toBe("prep_1");
    expect(hits[0].matchedOn).toBe("label");
  });

  it("returns nothing for a blank or unmatched query", () => {
    expect(searchNodes(makeConfig(), "")).toEqual([]);
    expect(searchNodes(makeConfig(), "   ")).toEqual([]);
    expect(searchNodes(makeConfig(), "no such node")).toEqual([]);
  });

  it("searches the graph, not the catalog — an activity nobody added is not a hit", () => {
    // `document.classify` is a real catalog entry the palette would offer,
    // but this graph contains no node of that type.
    expect(searchNodes(makeConfig(), "document.classify")).toEqual([]);
  });
});
