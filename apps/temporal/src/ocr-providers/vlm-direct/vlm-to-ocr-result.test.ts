/**
 * Unit tests for the VLM-direct → OCRResult mapper.
 *
 * Covers vocabulary mapping (number/date/selectionMark/string),
 * evidence-based confidence synthesis (with-quote → 0.95, without → 0.5),
 * page synthesis from extracted fields, key-value pair generation,
 * and the no-fieldDefs fallback path.
 */

import { describe, expect, it } from "@jest/globals";
import { __testInternals, vlmExtractionToOcrResult } from "./vlm-to-ocr-result";
import type { VlmExtractionResponse } from "./vlm-types";

const CTX = {
  fileName: "1 81.jpg",
  fileType: "image",
  requestId: "test-req",
  modelId: "gpt-5.4",
};

function buildPayload(
  fields: Record<string, string | number | null>,
  quotes: Record<string, string>,
): VlmExtractionResponse {
  return { fields, source_quotes: quotes };
}

describe("vlmExtractionToOcrResult", () => {
  it("returns success=true and modelId set", () => {
    const r = vlmExtractionToOcrResult(buildPayload({}, {}), CTX);
    expect(r.success).toBe(true);
    expect(r.status).toBe("succeeded");
    expect(r.modelId).toBe("gpt-5.4");
    expect(r.fileName).toBe("1 81.jpg");
  });

  it("synthesises a single canonical page when there are fields", () => {
    const payload = buildPayload({ name: "Alex" }, { name: "Alex" });
    const r = vlmExtractionToOcrResult(payload, CTX, {
      fieldDefs: [{ field_key: "name", field_type: "string" }],
    });
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].pageNumber).toBe(1);
    expect(r.pages[0].words.length).toBe(1);
  });

  it("emits documents[0].docType = 'vlm-direct' when fieldDefs are supplied", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, { name: "Alex" }),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.documents).toBeDefined();
    expect(r.documents?.[0].docType).toBe("vlm-direct");
    expect(r.documents?.[0].fields.name.valueString).toBe("Alex");
  });

  it("number field: numeric value is preserved on valueNumber", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ amount: 1234.56 }, { amount: "$1,234.56" }),
      CTX,
      { fieldDefs: [{ field_key: "amount", field_type: "number" }] },
    );
    expect(r.documents?.[0].fields.amount.valueNumber).toBe(1234.56);
    expect(r.documents?.[0].fields.amount.type).toBe("number");
  });

  it("number field: null becomes a string-only blank value", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ amount: null }, { amount: "" }),
      CTX,
      { fieldDefs: [{ field_key: "amount", field_type: "number" }] },
    );
    const f = r.documents?.[0].fields.amount;
    expect(f?.type).toBe("number");
    expect(f?.valueNumber).toBeUndefined();
    expect(f?.valueString).toBe("");
  });

  it("date field: passes through as YYYY-MM-DD string on valueDate", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ date: "2014-09-06" }, { date: "06-SEP-2014" }),
      CTX,
      { fieldDefs: [{ field_key: "date", field_type: "date" }] },
    );
    expect(r.documents?.[0].fields.date.valueDate).toBe("2014-09-06");
    expect(r.documents?.[0].fields.date.type).toBe("date");
  });

  it("selectionMark field: selected/unselected normalisation", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload(
        { yes: "selected", no: "unselected" },
        { yes: "[X] Yes", no: "[ ] No" },
      ),
      CTX,
      {
        fieldDefs: [
          { field_key: "yes", field_type: "selectionMark" },
          { field_key: "no", field_type: "selectionMark" },
        ],
      },
    );
    expect(r.documents?.[0].fields.yes.valueSelectionMark).toBe("selected");
    expect(r.documents?.[0].fields.no.valueSelectionMark).toBe("unselected");
  });

  it("evidence-based confidence: non-empty source_quote → 0.95", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, { name: "Applicant: Alex" }),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.documents?.[0].fields.name.confidence).toBe(0.95);
  });

  it("evidence-based confidence: empty source_quote → 0.5", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, { name: "" }),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.documents?.[0].fields.name.confidence).toBe(0.5);
  });

  it("evidence-based confidence: whitespace-only source_quote → 0.5", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, { name: "   \t\n  " }),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.documents?.[0].fields.name.confidence).toBe(0.5);
  });

  it("evidence-based confidence: missing source_quote (undefined) → 0.5", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, {}),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.documents?.[0].fields.name.confidence).toBe(0.5);
  });

  it("page-level mean confidence is the mean of per-field confidences", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload(
        { a: "x", b: "y", c: "z", d: "w" },
        { a: "ev", b: "ev", c: "", d: "" }, // 2 with evidence, 2 without
      ),
      CTX,
      {
        fieldDefs: [
          { field_key: "a", field_type: "string" },
          { field_key: "b", field_type: "string" },
          { field_key: "c", field_type: "string" },
          { field_key: "d", field_type: "string" },
        ],
      },
    );
    // (0.95 + 0.95 + 0.5 + 0.5) / 4 = 0.725
    expect(r.pages[0].words[0].confidence).toBeCloseTo(0.725, 3);
  });

  it("evidenceConfidence: a quote always means high confidence", () => {
    expect(__testInternals.evidenceConfidence("anything", "value")).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
    // value irrelevant when a quote is present
    expect(__testInternals.evidenceConfidence("quote", "")).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
    expect(__testInternals.CONF_WITH_EVIDENCE).toBe(0.95);
    expect(__testInternals.CONF_NO_EVIDENCE).toBe(0.5);
  });

  it("evidenceConfidence: no quote penalises only a populated value", () => {
    // populated value, no quote -> suspicious
    expect(__testInternals.evidenceConfidence("", "1234.56")).toBe(
      __testInternals.CONF_NO_EVIDENCE,
    );
    expect(__testInternals.evidenceConfidence(undefined, 42)).toBe(
      __testInternals.CONF_NO_EVIDENCE,
    );
    // genuinely-blank value, no quote -> correct empty extraction, stays high
    expect(__testInternals.evidenceConfidence("", "")).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
    expect(__testInternals.evidenceConfidence("", "   ")).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
    expect(__testInternals.evidenceConfidence(undefined, null)).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
    expect(__testInternals.evidenceConfidence("", undefined)).toBe(
      __testInternals.CONF_WITH_EVIDENCE,
    );
  });

  it("emits keyValuePairs for every field def (in order)", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ a: "x", b: "y" }, { a: "qa", b: "qb" }),
      CTX,
      {
        fieldDefs: [
          { field_key: "a", field_type: "string" },
          { field_key: "b", field_type: "string" },
        ],
      },
    );
    expect(r.keyValuePairs).toHaveLength(2);
    expect(r.keyValuePairs[0].key.content).toBe("a");
    expect(r.keyValuePairs[1].key.content).toBe("b");
  });

  it("no-fieldDefs fallback: still produces keyValuePairs from raw payload", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ x: "hello" }, { x: "yo" }),
      CTX,
    );
    expect(r.documents).toBeUndefined();
    expect(r.keyValuePairs).toHaveLength(1);
    expect(r.keyValuePairs[0].key.content).toBe("x");
    expect(r.keyValuePairs[0].value?.content).toBe("hello");
    expect(r.keyValuePairs[0].confidence).toBe(0.95);
  });

  it("extractedText includes the field's source_quote (evidence) when present", () => {
    const r = vlmExtractionToOcrResult(
      buildPayload({ name: "Alex" }, { name: "Applicant: Alex" }),
      CTX,
      { fieldDefs: [{ field_key: "name", field_type: "string" }] },
    );
    expect(r.extractedText).toContain("name: Alex");
    expect(r.extractedText).toContain("Applicant: Alex");
  });

  it("returns no pages when there are no fields and no quotes", () => {
    const r = vlmExtractionToOcrResult(buildPayload({}, {}), CTX);
    expect(r.pages).toEqual([]);
  });
});
