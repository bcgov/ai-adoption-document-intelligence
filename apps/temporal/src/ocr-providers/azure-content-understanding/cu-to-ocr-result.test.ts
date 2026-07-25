import { describe, expect, it } from "@jest/globals";
import { cuAnalyzeResultToOcrResult } from "./cu-to-ocr-result";
import type { CuAnalyzeResult } from "./cu-types";

describe("cuAnalyzeResultToOcrResult", () => {
  it("returns a usable OCRResult when CU returned only markdown (no fields, no pages)", () => {
    const result: CuAnalyzeResult = {
      analyzerId: "test-analyzer",
      contents: [
        {
          path: "input1",
          markdown: "Hello world.",
        },
      ],
    };

    const ocr = cuAnalyzeResultToOcrResult(
      result,
      {
        fileName: "doc.jpg",
        fileType: "image",
        requestId: "req-1",
        modelId: "test-analyzer",
      },
      undefined,
    );

    expect(ocr.success).toBe(true);
    expect(ocr.modelId).toBe("test-analyzer");
    expect(ocr.extractedText).toBe("Hello world.");
    expect(ocr.pages).toHaveLength(1);
    expect(ocr.pages[0].words.length).toBeGreaterThan(0);
    expect(ocr.pages[0].words[0].confidence).toBeCloseTo(0.95, 5);
    expect(ocr.documents).toBeUndefined();
  });

  it("uses page-level metadata from contents[0].pages when present", () => {
    const result: CuAnalyzeResult = {
      contents: [
        {
          markdown: "page-one body",
          pages: [{ pageNumber: 1, width: 1000, height: 1500, unit: "pixel" }],
        },
      ],
    };

    const ocr = cuAnalyzeResultToOcrResult(result, {
      fileName: "doc.jpg",
      fileType: "image",
      requestId: "req-2",
      modelId: "x",
    });

    expect(ocr.pages).toHaveLength(1);
    expect(ocr.pages[0].width).toBe(1000);
    expect(ocr.pages[0].height).toBe(1500);
  });

  it("emits documents[0].fields and keyValuePairs when fieldDefs are supplied", () => {
    const result: CuAnalyzeResult = {
      contents: [
        {
          markdown: "doc",
          fields: {
            applicant_name: {
              type: "string",
              valueString: "Alice Liddell",
              confidence: 0.91,
            },
            applicant_employment_income: {
              type: "number",
              valueNumber: 1234.56,
              confidence: 0.84,
            },
            applicant_signed_date: {
              type: "date",
              valueDate: "2026-04-01",
              confidence: 0.99,
            },
            checkbox_yes: {
              type: "string",
              valueString: "selected",
              confidence: 0.97,
            },
          },
        },
      ],
    };

    const ocr = cuAnalyzeResultToOcrResult(
      result,
      {
        fileName: "doc.jpg",
        fileType: "image",
        requestId: "req-3",
        modelId: "y",
      },
      {
        fieldDefs: [
          { field_key: "applicant_name", field_type: "string" },
          { field_key: "applicant_employment_income", field_type: "number" },
          { field_key: "applicant_signed_date", field_type: "date" },
          { field_key: "checkbox_yes", field_type: "selectionMark" },
        ],
      },
    );

    expect(ocr.documents).toBeDefined();
    const doc = ocr.documents?.[0];
    expect(doc?.docType).toBe("azure-content-understanding");
    expect(doc?.fields.applicant_name.valueString).toBe("Alice Liddell");
    expect(doc?.fields.applicant_name.confidence).toBeCloseTo(0.91, 5);
    expect(doc?.fields.applicant_employment_income.valueNumber).toBeCloseTo(
      1234.56,
      5,
    );
    expect(doc?.fields.applicant_signed_date.valueDate).toBe("2026-04-01");
    expect(doc?.fields.checkbox_yes.valueSelectionMark).toBe("selected");
    expect(ocr.keyValuePairs).toHaveLength(4);
    const nameKv = ocr.keyValuePairs.find(
      (kv) => kv.key.content === "applicant_name",
    );
    expect(nameKv?.value?.content).toBe("Alice Liddell");
  });

  it("treats missing CU fields as blank using the template field type", () => {
    const result: CuAnalyzeResult = {
      contents: [
        {
          markdown: "doc",
          fields: {},
        },
      ],
    };
    const ocr = cuAnalyzeResultToOcrResult(
      result,
      {
        fileName: "doc.jpg",
        fileType: "image",
        requestId: "req-4",
        modelId: "z",
      },
      {
        fieldDefs: [
          { field_key: "applicant_name", field_type: "string" },
          { field_key: "applicant_employment_income", field_type: "number" },
          { field_key: "applicant_signed_date", field_type: "date" },
        ],
      },
    );
    expect(ocr.documents).toBeDefined();
    expect(ocr.documents?.[0].fields.applicant_name.valueString).toBe("");
    // Numeric field, blank → no valueNumber set, valueString is empty.
    expect(
      ocr.documents?.[0].fields.applicant_employment_income.valueNumber,
    ).toBeUndefined();
    // Date field, blank → no valueDate set (B6); else it reads as populated
    // downstream. valueString is empty.
    expect(
      ocr.documents?.[0].fields.applicant_signed_date.valueDate,
    ).toBeUndefined();
    expect(ocr.documents?.[0].fields.applicant_signed_date.valueString).toBe(
      "",
    );
  });

  it("normalises a CU number returned as a string into valueNumber", () => {
    const result: CuAnalyzeResult = {
      contents: [
        {
          fields: {
            applicant_employment_income: {
              valueString: "1,234.56",
              confidence: 0.7,
            },
          },
        },
      ],
    };
    const ocr = cuAnalyzeResultToOcrResult(
      result,
      {
        fileName: "doc.jpg",
        fileType: "image",
        requestId: "req-5",
        modelId: "z",
      },
      {
        fieldDefs: [
          { field_key: "applicant_employment_income", field_type: "number" },
        ],
      },
    );
    expect(
      ocr.documents?.[0].fields.applicant_employment_income.valueNumber,
    ).toBeCloseTo(1234.56, 5);
  });

  it("computes the page-level confidence as the mean of CU field confidences when present", () => {
    const result: CuAnalyzeResult = {
      contents: [
        {
          markdown: "x",
          fields: {
            f1: { confidence: 0.8 },
            f2: { confidence: 0.6 },
            f3: {},
          },
        },
      ],
    };
    const ocr = cuAnalyzeResultToOcrResult(result, {
      fileName: "x",
      fileType: "image",
      requestId: "r",
      modelId: "m",
    });
    expect(ocr.pages[0].words[0].confidence).toBeCloseTo(0.7, 5);
  });
});
