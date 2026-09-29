/**
 * Unit tests for `computePreviewOutputs` (G-011).
 *
 * The projection used to emit `node.outputs?.[0]?.ctxKey` only. 13 of the
 * shipped catalog activities declare more than one output port
 * (`ocr.spellcheck` alone declares three), so every output after the first was
 * invisible during a run unless a data wire happened to be drawn from it.
 */

import { describe, expect, it } from "vitest";

import type { GraphWorkflowConfig } from "../../../types/workflow";
import { computePreviewOutputs } from "./preview-outputs";

function configWith(node: Record<string, unknown>): GraphWorkflowConfig {
  return {
    id: "wf",
    name: "wf",
    entryNodeId: "n1",
    ctx: {},
    nodes: { n1: node },
    edges: [],
  } as unknown as GraphWorkflowConfig;
}

describe("computePreviewOutputs", () => {
  it("returns every bound output, not just the first", () => {
    const outputs = computePreviewOutputs(
      configWith({
        id: "n1",
        type: "activity",
        label: "Spellcheck",
        activityType: "ocr.spellcheck",
        outputs: [
          { port: "correctedResult", ctxKey: "corrected" },
          { port: "corrections", ctxKey: "fixes" },
          { port: "metadata", ctxKey: "meta" },
        ],
      }),
      "n1",
    );

    expect(outputs.map((o) => o.port)).toEqual([
      "correctedResult",
      "corrections",
      "metadata",
    ]);
    expect(outputs.map((o) => o.ctxKey)).toEqual([
      "corrected",
      "fixes",
      "meta",
    ]);
  });

  it("takes the label and kind from the catalog's output descriptor", () => {
    const [first, second] = computePreviewOutputs(
      configWith({
        id: "n1",
        type: "activity",
        label: "Spellcheck",
        activityType: "ocr.spellcheck",
        outputs: [
          { port: "correctedResult", ctxKey: "corrected" },
          { port: "corrections", ctxKey: "fixes" },
        ],
      }),
      "n1",
    );

    expect(first.label).toBe("Corrected result");
    expect(first.kind).toBe("OcrResult");
    // The kind of output #2 can only come from the catalog: the cache row's
    // `outputKind` records the FIRST port's kind and nothing else.
    expect(second.kind).toBe("Artifact");
  });

  it("skips bindings with no ctxKey — there is nowhere to read them from", () => {
    const outputs = computePreviewOutputs(
      configWith({
        id: "n1",
        type: "activity",
        label: "Spellcheck",
        activityType: "ocr.spellcheck",
        outputs: [
          { port: "correctedResult", ctxKey: "" },
          { port: "corrections", ctxKey: "fixes" },
        ],
      }),
      "n1",
    );

    expect(outputs.map((o) => o.port)).toEqual(["corrections"]);
  });

  it("still yields bindings for an activity with no catalog entry", () => {
    const [only] = computePreviewOutputs(
      configWith({
        id: "n1",
        type: "activity",
        label: "Dynamic",
        activityType: "dyn.custom",
        outputs: [{ port: "result", ctxKey: "out" }],
      }),
      "n1",
    );

    expect(only).toEqual({
      port: "result",
      label: "result",
      ctxKey: "out",
      kind: undefined,
    });
  });

  it("returns an empty list for an unknown node or a node with no outputs", () => {
    const config = configWith({
      id: "n1",
      type: "activity",
      label: "Spellcheck",
      activityType: "ocr.spellcheck",
    });
    expect(computePreviewOutputs(config, "n1")).toEqual([]);
    expect(computePreviewOutputs(config, "missing")).toEqual([]);
  });
});
