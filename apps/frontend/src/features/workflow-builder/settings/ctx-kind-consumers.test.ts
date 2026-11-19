/**
 * Tests for G-049's per-key impact read — the notice that tells an author
 * which inputs the kind they just picked no longer satisfies.
 */
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig, KindRef } from "../../../types/workflow";
import type { DynamicNodeCatalogEntry } from "../canvas/port-rows";
import {
  describeKindMismatch,
  findKindMismatchedConsumers,
} from "./ctx-kind-consumers";

/**
 * `myVal` is a declared workflow variable; `B`'s `ocrResult` input is PINNED
 * to it. `ocr.cleanup` declares that port as `OcrResult`, so the declaration's
 * kind decides whether the pin resolves or mismatches.
 */
function pinnedTo(kind: KindRef): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    entryNodeId: "B",
    nodes: {
      B: {
        id: "B",
        type: "activity",
        label: "Clean up",
        activityType: "ocr.cleanup",
        inputs: [{ port: "ocrResult", ctxKey: "myVal" }],
        metadata: { lockedInputPorts: ["ocrResult"] },
      },
    },
    edges: [],
    ctx: { myVal: { type: "object", kind, isInput: true } },
  };
}

describe("findKindMismatchedConsumers", () => {
  it("reports nothing while the declared kind satisfies the pinned port", () => {
    expect(findKindMismatchedConsumers(pinnedTo("OcrResult"), "myVal")).toEqual(
      [],
    );
  });

  it("names the node and port a retype broke", () => {
    expect(findKindMismatchedConsumers(pinnedTo("Document"), "myVal")).toEqual([
      {
        nodeId: "B",
        nodeLabel: "Clean up",
        port: "ocrResult",
        portLabel: expect.any(String),
      },
    ]);
  });

  it("does not attribute another key's mismatch to this one", () => {
    expect(
      findKindMismatchedConsumers(pinnedTo("Document"), "someOtherKey"),
    ).toEqual([]);
  });
});

describe("findKindMismatchedConsumers — dyn.* nodes via the merged catalog", () => {
  const dynEntry: DynamicNodeCatalogEntry = {
    activityType: "dyn.sentiment-scorer",
    inputs: [
      {
        name: "document",
        label: "Document",
        required: true,
        kind: "Document",
      },
    ],
    outputs: [{ name: "score", label: "Score", kind: "ValidationResult" }],
  };

  /** `D`'s `document` input is PINNED to `myVal`; the dyn entry wants `Document`. */
  function dynPinnedTo(kind: KindRef): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      entryNodeId: "D",
      nodes: {
        D: {
          id: "D",
          type: "activity",
          label: "Score it",
          activityType: "dyn.sentiment-scorer",
          inputs: [{ port: "document", ctxKey: "myVal" }],
          metadata: { lockedInputPorts: ["document"] },
        },
      },
      edges: [],
      ctx: { myVal: { type: "object", kind, isInput: true } },
    };
  }

  it("reports a dyn node's pinned input a retype broke", () => {
    expect(
      findKindMismatchedConsumers(dynPinnedTo("OcrResult"), "myVal", [
        dynEntry,
      ]),
    ).toEqual([
      {
        nodeId: "D",
        nodeLabel: "Score it",
        port: "document",
        portLabel: "Document",
      },
    ]);
  });

  it("reports nothing while the declared kind satisfies the dyn port", () => {
    expect(
      findKindMismatchedConsumers(dynPinnedTo("Document"), "myVal", [dynEntry]),
    ).toEqual([]);
  });

  it("fails soft without the merged-catalog entries — dyn ports are simply invisible", () => {
    expect(
      findKindMismatchedConsumers(dynPinnedTo("OcrResult"), "myVal"),
    ).toEqual([]);
  });
});

describe("describeKindMismatch", () => {
  it("agrees in number", () => {
    const one = [{ nodeId: "B", nodeLabel: "B", port: "p", portLabel: "P" }];
    expect(describeKindMismatch(one)).toBe(
      "1 input no longer accepts this kind",
    );
    expect(describeKindMismatch([...one, { ...one[0], nodeId: "C" }])).toBe(
      "2 inputs no longer accept this kind",
    );
  });
});
