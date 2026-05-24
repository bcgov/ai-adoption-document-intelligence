/**
 * Tests for `sortVariablesByCompatibility` (US-097).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-097-variable-picker-dim-tooltip.md.
 */

import { describe, expect, it } from "vitest";
import {
  sortVariablesByCompatibility,
  type VariablePickerEntry,
} from "./variable-picker-utils";

const seg1: VariablePickerEntry = {
  id: "seg1",
  label: "seg1",
  ctxKey: "seg1",
  producerKind: "Segment",
};
const seg2: VariablePickerEntry = {
  id: "seg2",
  label: "seg2",
  ctxKey: "seg2",
  producerKind: "Segment<Table>",
};
const docA: VariablePickerEntry = {
  id: "docA",
  label: "docA",
  ctxKey: "docA",
  producerKind: "Document",
};
const ocrX: VariablePickerEntry = {
  id: "ocrX",
  label: "ocrX",
  ctxKey: "ocrX",
  producerKind: "OcrResult",
};
const legacy: VariablePickerEntry = {
  id: "legacy",
  label: "legacy",
  ctxKey: "legacy",
  // producerKind intentionally omitted — legacy/unknown wildcard producer.
};

describe("sortVariablesByCompatibility — Scenario 1: compatible-first split", () => {
  it("places Segment + Segment<Table> in compatible and Document + OcrResult in incompatible against Segment", () => {
    const result = sortVariablesByCompatibility(
      [seg1, seg2, docA, ocrX],
      "Segment",
    );

    expect(result.compatible.map((e) => e.id)).toEqual(["seg1", "seg2"]);
    expect(result.incompatible.map((e) => e.id)).toEqual(["docA", "ocrX"]);
  });

  it("preserves caller-supplied input order within each bucket", () => {
    const result = sortVariablesByCompatibility(
      [ocrX, docA, seg2, seg1],
      "Segment",
    );

    expect(result.compatible.map((e) => e.id)).toEqual(["seg2", "seg1"]);
    expect(result.incompatible.map((e) => e.id)).toEqual(["ocrX", "docA"]);
  });
});

describe("sortVariablesByCompatibility — Scenario 2: incompatible reason format", () => {
  it("emits the exact tooltip text `<producerKind> — incompatible with this port (expects <consumerKind>)` for each incompatible entry", () => {
    const result = sortVariablesByCompatibility([seg1, docA, ocrX], "Segment");

    expect(result.reasons.get("docA")).toBe(
      "Document — incompatible with this port (expects Segment)",
    );
    expect(result.reasons.get("ocrX")).toBe(
      "OcrResult — incompatible with this port (expects Segment)",
    );
  });

  it("does not emit reasons for compatible entries", () => {
    const result = sortVariablesByCompatibility([seg1, seg2, docA], "Segment");

    expect(result.reasons.has("seg1")).toBe(false);
    expect(result.reasons.has("seg2")).toBe(false);
    expect(result.reasons.has("docA")).toBe(true);
  });
});

describe("sortVariablesByCompatibility — Scenario 3: expectedKind undefined → flat list", () => {
  it("returns every variable in the compatible bucket with empty reasons + empty incompatible", () => {
    const result = sortVariablesByCompatibility(
      [seg1, docA, ocrX, legacy],
      undefined,
    );

    expect(result.compatible.map((e) => e.id)).toEqual([
      "seg1",
      "docA",
      "ocrX",
      "legacy",
    ]);
    expect(result.incompatible).toHaveLength(0);
    expect(result.reasons.size).toBe(0);
  });
});

describe("sortVariablesByCompatibility — Scenario 4: producer kind unknown → compatible", () => {
  it("treats an entry with no producerKind as the Artifact wildcard and places it in the compatible bucket", () => {
    const result = sortVariablesByCompatibility([legacy], "Document");

    expect(result.compatible.map((e) => e.id)).toEqual(["legacy"]);
    expect(result.incompatible).toHaveLength(0);
    expect(result.reasons.has("legacy")).toBe(false);
  });

  it("keeps a legacy variable in compatible alongside typed compatibles", () => {
    const result = sortVariablesByCompatibility(
      [legacy, docA, seg1],
      "Document",
    );

    expect(result.compatible.map((e) => e.id)).toEqual(["legacy", "docA"]);
    expect(result.incompatible.map((e) => e.id)).toEqual(["seg1"]);
  });
});
