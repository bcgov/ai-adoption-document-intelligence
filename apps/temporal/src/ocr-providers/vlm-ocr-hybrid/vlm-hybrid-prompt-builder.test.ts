/**
 * Unit tests for the VLM + OCR hybrid prompt builder.
 *
 * Two contracts to defend:
 *   1. The hybrid system prompt names the OCR pre-pass and tells the
 *      model to prefer the image when image and OCR text disagree —
 *      regression here breaks the trust hierarchy that makes E05's
 *      headline accuracy gain real.
 *   2. The strict-mode JSON Schema is identical to E04's (we delegate
 *      to `buildVlmExtractionRequest`); only the messages differ.
 */

import { describe, expect, it } from "@jest/globals";
import {
  __testInternals,
  buildVlmHybridExtractionRequest,
} from "./vlm-hybrid-prompt-builder";

const SDPR_FIELDS = [
  { field_key: "name", field_type: "string" as const },
  {
    field_key: "applicant_net_employment_income",
    field_type: "number" as const,
  },
  { field_key: "checkbox_school_yes", field_type: "selectionMark" as const },
  { field_key: "date", field_type: "date" as const, field_format: null },
];

describe("buildVlmHybridExtractionRequest", () => {
  it("returns null when no fields are provided", () => {
    expect(
      buildVlmHybridExtractionRequest({ fields: [], ocrMarkdown: "any" }),
    ).toBeNull();
  });

  it("returns the hybrid request shape with system + user prompts and schema", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "## Section 1\nApplicant Name: John Smith",
    });
    expect(req).not.toBeNull();
    expect(typeof req?.systemPrompt).toBe("string");
    expect(typeof req?.userPrompt).toBe("string");
    expect(req?.responseFormat?.name).toBe("sdpr_vlm_hybrid_extraction");
    expect(req?.responseFormat?.strict).toBe(true);
    expect(req?.fieldKeys).toEqual([
      "name",
      "applicant_net_employment_income",
      "checkbox_school_yes",
      "date",
    ]);
  });

  it("system prompt contains the hybrid trust-hierarchy instruction", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "anything",
    });
    expect(req?.systemPrompt).toContain("OCR text rendering");
    expect(req?.systemPrompt).toContain("image is the source of truth");
    expect(req?.systemPrompt).toMatch(
      /trust what you see in the image and ignore the OCR text/i,
    );
  });

  it("user prompt inlines the OCR markdown inside <ocr_text> delimiters", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "**Total**: $1,234.56",
    });
    expect(req?.userPrompt).toContain("<ocr_text>");
    expect(req?.userPrompt).toContain("**Total**: $1,234.56");
    expect(req?.userPrompt).toContain("</ocr_text>");
    expect(req?.userPrompt).toMatch(
      /When the image and the OCR text disagree, prefer the image/,
    );
  });

  it("falls back to a placeholder when ocrMarkdown is empty", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "",
    });
    expect(req?.userPrompt).toContain("(OCR text was empty)");
  });

  it("appends the user-supplied global instruction after the hybrid preamble", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "ocr",
      documentAnnotationPrompt:
        "Custom SDPR instruction about Applicant vs Spouse columns.",
    });
    const sys = req?.systemPrompt ?? "";
    const idxHybrid = sys.indexOf("source of truth");
    const idxCustom = sys.indexOf("Custom SDPR instruction");
    expect(idxHybrid).toBeGreaterThanOrEqual(0);
    expect(idxCustom).toBeGreaterThan(idxHybrid);
  });

  it("schema property shape mirrors E04 (strict, additionalProperties false, every key required)", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "ocr",
    });
    const root = req?.responseFormat?.schema;
    expect(root?.type).toBe("object");
    expect(root?.additionalProperties).toBe(false);
    expect(root?.required).toEqual(["fields", "source_quotes"]);
    const fieldsObj = root?.properties.fields;
    const quotesObj = root?.properties.source_quotes;
    expect(fieldsObj?.additionalProperties).toBe(false);
    expect(quotesObj?.additionalProperties).toBe(false);
    expect(fieldsObj?.required).toEqual([
      "name",
      "applicant_net_employment_income",
      "checkbox_school_yes",
      "date",
    ]);
    expect(quotesObj?.required).toEqual(fieldsObj?.required);
    expect(fieldsObj?.properties.applicant_net_employment_income).toEqual(
      expect.objectContaining({ type: ["number", "null"] }),
    );
    expect(fieldsObj?.properties.checkbox_school_yes).toEqual(
      expect.objectContaining({
        type: "string",
        enum: ["selected", "unselected"],
      }),
    );
  });

  it("schema name override survives", () => {
    const req = buildVlmHybridExtractionRequest({
      fields: SDPR_FIELDS,
      ocrMarkdown: "ocr",
      schemaName: "custom_hybrid_schema_name",
    });
    expect(req?.responseFormat?.name).toBe("custom_hybrid_schema_name");
  });

  it("internal preamble + directive constants exist (regression guard)", () => {
    expect(__testInternals.HYBRID_SYSTEM_PREAMBLE).toContain(
      "image is the source of truth",
    );
    expect(__testInternals.HYBRID_USER_DIRECTIVE).toContain("{{OCR_TEXT}}");
  });
});
