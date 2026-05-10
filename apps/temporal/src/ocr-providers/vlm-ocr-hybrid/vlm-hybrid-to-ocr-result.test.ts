/**
 * Unit tests for the VLM-hybrid → canonical OCRResult mapper.
 *
 * The mapper inherits the structured-fields path from the E04 mapper
 * (which already has its own test suite). The hybrid-specific
 * contracts to defend here:
 *
 *   1. `OCRResult.documents[0].docType` is `"vlm-ocr-hybrid"` (not E04's
 *      `"vlm-direct"`) — surfaces the engine identity to downstream
 *      consumers and to the analytics export.
 *   2. When a layoutResponse is supplied, `pages[]` / `paragraphs[]` /
 *      `tables[]` come from the layout (not the synthesised E04
 *      single-page summary).
 *   3. `extractedText` prefers the layout markdown over the
 *      field-summary string, so post-OCR cleanup sees real form text.
 *   4. With no layoutResponse, the mapper falls back gracefully to the
 *      E04 behaviour.
 */

import { describe, expect, it } from "@jest/globals";
import type { OCRResponse } from "../../types";
import type { VlmExtractionResponse } from "../vlm-direct/vlm-types";
import { vlmHybridExtractionToOcrResult } from "./vlm-hybrid-to-ocr-result";

const PAYLOAD: VlmExtractionResponse = {
  fields: { name: "John Smith", checkbox_school_yes: "selected" },
  source_quotes: { name: "John Smith", checkbox_school_yes: "[X] yes" },
};

const FIELD_DEFS = [
  { field_key: "name", field_type: "string" },
  { field_key: "checkbox_school_yes", field_type: "selectionMark" },
];

const CTX = {
  fileName: "test.jpg",
  fileType: "image",
  requestId: "req-1",
  modelId: "gpt-5.4",
};

const LAYOUT: OCRResponse = {
  status: "succeeded",
  analyzeResult: {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    content: "## SDPR Monthly Report\n\nApplicant Name: John Smith\n",
    pages: [
      {
        pageNumber: 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        words: [
          {
            content: "Applicant",
            polygon: [1, 1, 2, 1, 2, 1.2, 1, 1.2],
            confidence: 0.99,
            span: { offset: 0, length: 9 },
          },
        ],
        lines: [
          {
            content: "Applicant Name: John Smith",
            polygon: [1, 1, 5, 1, 5, 1.2, 1, 1.2],
            spans: [{ offset: 0, length: 26 }],
          },
        ],
        spans: [{ offset: 0, length: 26 }],
      },
    ],
    paragraphs: [
      {
        content: "Applicant Name: John Smith",
        boundingRegions: [
          { pageNumber: 1, polygon: [1, 1, 5, 1, 5, 1.2, 1, 1.2] },
        ],
        spans: [{ offset: 0, length: 26 }],
      },
    ],
    tables: [
      {
        rowCount: 1,
        columnCount: 2,
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            content: "Name",
            boundingRegions: [],
            spans: [],
          },
          {
            rowIndex: 0,
            columnIndex: 1,
            content: "John Smith",
            boundingRegions: [],
            spans: [],
          },
        ],
        boundingRegions: [],
        spans: [],
      },
    ],
    keyValuePairs: [],
    sections: [],
    figures: [],
  },
};

describe("vlmHybridExtractionToOcrResult", () => {
  it("sets docType to vlm-ocr-hybrid (distinct from E04's vlm-direct)", () => {
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
    });
    expect(result.documents?.[0]?.docType).toBe("vlm-ocr-hybrid");
  });

  it("populates pages, paragraphs, and tables from the layoutResponse", () => {
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
      layoutResponse: LAYOUT,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].lines).toHaveLength(1);
    expect(result.pages[0].lines[0].content).toBe("Applicant Name: John Smith");
    expect(result.pages[0].lines[0].polygon).toEqual([
      1, 1, 5, 1, 5, 1.2, 1, 1.2,
    ]);
    expect(result.pages[0].words).toHaveLength(1);
    expect(result.pages[0].words[0].content).toBe("Applicant");
    expect(result.paragraphs).toHaveLength(1);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].cells).toHaveLength(2);
  });

  it("uses the layout markdown for extractedText when present", () => {
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
      layoutResponse: LAYOUT,
    });
    expect(result.extractedText).toBe(
      "## SDPR Monthly Report\n\nApplicant Name: John Smith\n",
    );
  });

  it("falls back to E04 single-page summary when no layoutResponse is provided", () => {
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
    });
    expect(result.pages).toHaveLength(1);
    // E04 mapper produces synthesised page with width 612 (pixel).
    expect(result.pages[0].width).toBe(612);
    // extractedText is the E04 field-summary
    expect(result.extractedText).toContain("VLM-direct extraction summary");
  });

  it("preserves field type → AzureFieldValue mapping (selectionMark)", () => {
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
    });
    const fields = result.documents?.[0]?.fields ?? {};
    expect(fields.checkbox_school_yes?.type).toBe("selectionMark");
    expect(fields.checkbox_school_yes?.valueSelectionMark).toBe("selected");
    expect(fields.name?.type).toBe("string");
    expect(fields.name?.valueString).toBe("John Smith");
  });

  it("falls back to layout-empty (E04 path) when layoutResponse has empty pages", () => {
    const empty: OCRResponse = {
      status: "succeeded",
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-layout",
        content: "",
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
      },
    };
    const result = vlmHybridExtractionToOcrResult(PAYLOAD, CTX, {
      fieldDefs: FIELD_DEFS,
      layoutResponse: empty,
    });
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0].width).toBe(612);
  });
});
