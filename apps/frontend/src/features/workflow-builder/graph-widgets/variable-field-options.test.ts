import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  expandVariableOptions,
  resolveValuePathKind,
  splitKnownBase,
} from "./variable-field-options";

// Minimal config: one ctx key kind-tagged OcrResult (built-in kind with a
// field schema), one kindless object key.
const config = {
  ctx: {
    ocrResult: { type: "object", kind: "OcrResult" },
    untyped: { type: "object" },
  },
  nodes: {},
  edges: [],
} as unknown as GraphWorkflowConfig;

const groups = [{ group: "Workflow context", items: ["ocrResult", "untyped"] }];

describe("splitKnownBase", () => {
  it("longest-prefix matches at dot boundaries and strips a leading ctx.", () => {
    const keys = ["ocrResult", "__auto.n1.result"];
    expect(splitKnownBase("ocrResult", keys)).toEqual({
      base: "ocrResult",
      rest: [],
    });
    expect(splitKnownBase("ctx.ocrResult.status", keys)).toEqual({
      base: "ocrResult",
      rest: ["status"],
    });
    expect(splitKnownBase("__auto.n1.result.status", keys)).toEqual({
      base: "__auto.n1.result",
      rest: ["status"],
    });
    expect(splitKnownBase("ocrResultX", keys)).toBeNull();
  });
});

describe("expandVariableOptions", () => {
  it("appends one level of field rows for kinded keys only", () => {
    const { groups: out, meta } = expandVariableOptions(groups, config, "");
    expect(out).toEqual([
      {
        group: "Workflow context",
        items: [
          "ocrResult",
          "ocrResult.documentId",
          "ocrResult.blobPath",
          "ocrResult.storage",
          "ocrResult.byteLength",
          "ocrResult.pageCount",
          "ocrResult.status",
          "untyped",
        ],
      },
    ]);
    expect(meta.get("ocrResult.status")).toEqual({
      type: "string",
      kind: undefined,
      required: false,
    });
    expect(meta.get("ocrResult.documentId")).toEqual({
      type: "string",
      kind: undefined,
      required: true,
    });
    expect(meta.has("untyped")).toBe(true); // base keys get meta too (kind undefined)
  });

  it("does not emit deeper rows for scalar fields regardless of input", () => {
    const { groups: out } = expandVariableOptions(
      groups,
      config,
      "ocrResult.status.",
    );
    // status is a string — no third level appears
    expect(out[0].items.some((i) => i.startsWith("ocrResult.status."))).toBe(
      false,
    );
  });

  it("free-typed unknown paths do not crash and add nothing", () => {
    const { groups: out } = expandVariableOptions(
      groups,
      config,
      "nonexistent.x.y",
    );
    expect(out[0].items).toContain("ocrResult");
  });

  it("expands TypedSegment ctx keys with the full inherited field chain", () => {
    const segConfig = {
      ctx: { currentSegment: { type: "object", kind: "TypedSegment" } },
      nodes: {},
      edges: [],
    } as unknown as GraphWorkflowConfig;
    const { groups: out, meta } = expandVariableOptions(
      [{ group: "Workflow context", items: ["currentSegment"] }],
      segConfig,
      "",
    );
    expect(out[0]?.items).toEqual([
      "currentSegment",
      "currentSegment.segmentIndex",
      "currentSegment.pageRange",
      "currentSegment.blobKey",
      "currentSegment.pageCount",
      "currentSegment.segmentType",
      "currentSegment.keywordMatch",
      "currentSegment.confidence",
    ]);
    // Anonymous nested object: field row exists but has no kind, so typing
    // deeper (pageRange.start) stays free-text with no drill rows.
    expect(meta.get("currentSegment.pageRange")).toEqual({
      type: "object",
      kind: undefined,
      required: true,
    });
  });
});

describe("resolveValuePathKind", () => {
  it("returns the base producer kind for a bare key and the leaf field kind for a drilled path", () => {
    expect(
      resolveValuePathKind("ocrResult", config, ["ocrResult", "untyped"]),
    ).toBe("OcrResult");
    // scalar leaf → no kind
    expect(
      resolveValuePathKind("ocrResult.status", config, [
        "ocrResult",
        "untyped",
      ]),
    ).toBeUndefined();
  });
});
