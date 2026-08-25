/**
 * Tests for `resolveDataDropTarget` / `dataDropRefusalMessage` — what a drag
 * that STARTED on a data port is allowed to become when it is released on a
 * node-level run-order dot (review item D9).
 *
 * The reproduction that produced this module: Split Document → Run for each
 * item, drag begun on the violet **Segments** output and released on the
 * loop card's run-order dot. Before the fix that created a `normal` edge,
 * which renders as the grey dashed "Runs after" wire — a different kind of
 * connection from the one drawn, with nothing said. `loopTarget` below is
 * that exact pair.
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityNode,
  GraphWorkflowConfig,
  MapNode,
} from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import {
  dataDropRefusalMessage,
  resolveDataDropTarget,
} from "./data-drop-target";

/** `document.split` — its single output `segments` is `DocumentSegment[]`. */
function splitter(): ActivityNode {
  return node<ActivityNode>({
    id: "splitDoc",
    type: "activity",
    label: "Split Document",
    activityType: "document.split",
  });
}

function withTarget(target: GraphWorkflowConfig["nodes"][string]) {
  return config({
    nodes: { splitDoc: splitter(), [target.id]: target },
    entryNodeId: "splitDoc",
  });
}

/** Gallery stop 7's own pair: Split Document → Run for each item. */
function loopTarget(): GraphWorkflowConfig {
  return withTarget(
    node<MapNode>({
      id: "loopNode",
      type: "map",
      label: "Run for each item",
      collectionCtxKey: "",
      itemCtxKey: "",
      bodyEntryNodeId: "",
      bodyExitNodeId: "",
    }),
  );
}

describe("resolveDataDropTarget — a step with no data inputs at all", () => {
  it("refuses the Segments → Run for each item drop D9 reported", () => {
    const verdict = resolveDataDropTarget(
      loopTarget(),
      "splitDoc",
      "segments",
      "loopNode",
    );
    expect(verdict).toEqual({
      kind: "none",
      reason: "no-input-ports",
      sourceKind: "DocumentSegment[]",
    });
  });

  it("says so in words, and names the gesture that WOULD have worked", () => {
    const message = dataDropRefusalMessage(
      resolveDataDropTarget(loopTarget(), "splitDoc", "segments", "loopNode"),
      "Run for each item",
    );
    expect(message).toContain('"Run for each item" has no data inputs');
    expect(message).toContain("run-order dots");
  });
});

describe("resolveDataDropTarget — a step whose inputs all reject the kind", () => {
  it("distinguishes 'has none that fit' from 'has none at all'", () => {
    // `document.updateStatus` declares two inputs, both from the pointer
    // family (DocumentId / RequestId). Neither takes a segment list.
    const cfg = withTarget(
      node<ActivityNode>({
        id: "updateStatus",
        type: "activity",
        label: "Update Status",
        activityType: "document.updateStatus",
      }),
    );
    const verdict = resolveDataDropTarget(
      cfg,
      "splitDoc",
      "segments",
      "updateStatus",
    );
    expect(verdict).toEqual({
      kind: "none",
      reason: "no-compatible-port",
      sourceKind: "DocumentSegment[]",
    });
    expect(dataDropRefusalMessage(verdict, "Update Status")).toContain(
      "no input that accepts DocumentSegment (list)",
    );
  });
});

describe("resolveDataDropTarget — exactly one input can take it", () => {
  it("completes as the data edge that was aimed at", () => {
    // `ocr.storeResults`: documentId (DocumentId) and ocrResult (OcrResult)
    // both reject a segment list; `enrichmentSummary` is the `Artifact`
    // wildcard and accepts it. One candidate, so no guessing is involved.
    const cfg = withTarget(
      node<ActivityNode>({
        id: "storeResults",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
      }),
    );
    expect(
      resolveDataDropTarget(cfg, "splitDoc", "segments", "storeResults"),
    ).toEqual({
      kind: "port",
      port: { name: "enrichmentSummary", label: "Enrichment summary" },
    });
  });

  it("has no refusal message — nothing was refused", () => {
    const cfg = withTarget(
      node<ActivityNode>({
        id: "storeResults",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
      }),
    );
    expect(
      dataDropRefusalMessage(
        resolveDataDropTarget(cfg, "splitDoc", "segments", "storeResults"),
        "Store Results",
      ),
    ).toBeNull();
  });
});

describe("resolveDataDropTarget — more than one input can take it", () => {
  it("refuses rather than picking one, and names the candidates", () => {
    // `azureOcr.extract` has three `Artifact` wildcards among its inputs.
    // Choosing one for the user would be the same silent substitution D9
    // reported, in a nicer coat.
    const cfg = withTarget(
      node<ActivityNode>({
        id: "extract",
        type: "activity",
        label: "Extract OCR Results",
        activityType: "azureOcr.extract",
      }),
    );
    const verdict = resolveDataDropTarget(
      cfg,
      "splitDoc",
      "segments",
      "extract",
    );
    expect(verdict.kind).toBe("ambiguous");
    if (verdict.kind !== "ambiguous") throw new Error("unreachable");
    expect(verdict.ports.map((p) => p.name)).toEqual([
      "fileName",
      "fileType",
      "ocrResponse",
    ]);

    const message = dataDropRefusalMessage(verdict, "Extract OCR Results");
    expect(message).toContain("drop on the one you mean");
    expect(message).toContain('"File name"');
    expect(message).toContain('"OCR response"');
  });
});

describe("resolveDataDropTarget — only dots the card actually mounts count", () => {
  it("treats a control-flow card as having no inputs even mid-graph", () => {
    // `computePortRows` is the source of candidates, not the catalog, so a
    // port the user could not have dropped on is never returned as the
    // answer — the same guard the wire projection applies.
    const cfg = withTarget(
      node<MapNode>({
        id: "loopNode",
        type: "map",
        label: "Run for each item",
        collectionCtxKey: "segments",
        itemCtxKey: "currentSegment",
        bodyEntryNodeId: "",
        bodyExitNodeId: "",
      }),
    );
    expect(
      resolveDataDropTarget(cfg, "splitDoc", "segments", "loopNode").kind,
    ).toBe("none");
  });
});
