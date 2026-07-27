/**
 * Tests for G-049's per-key impact read — the notice that tells an author
 * which inputs the kind they just picked no longer satisfies.
 */
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig, KindRef } from "../../../types/workflow";
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
