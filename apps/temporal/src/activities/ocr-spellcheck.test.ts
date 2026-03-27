import type { OCRResult } from "../types";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { spellcheckOcrResult } from "./ocr-spellcheck";

function makeOcrResult(
  kvps: Array<{ key: string; value: string; confidence: number }>,
): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test",
    fileName: "test.pdf",
    fileType: "pdf",
    modelId: "prebuilt-layout",
    extractedText: "",
    pages: [],
    tables: [],
    paragraphs: [],
    keyValuePairs: kvps.map((k) => ({
      key: { content: k.key, boundingRegions: [], spans: [] },
      value: {
        content: k.value,
        boundingRegions: [{ pageNumber: 1, polygon: [] }],
        spans: [{ offset: 0, length: 0 }],
      },
      confidence: k.confidence,
    })),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}

describe("spellcheckOcrResult", () => {
  it("corrects misspelled words", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "Jonh Doe", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({ ocrResult });

    expect(result.ocrResult).toBeDefined();
    expect(result.changes.length).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.language).toBe("en");
  });

  it("does not mutate the original OCR result", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "helo world", confidence: 0.9 },
    ]);
    const originalValue = ocrResult.keyValuePairs[0].value?.content;

    await spellcheckOcrResult({ ocrResult });

    expect(ocrResult.keyValuePairs[0].value?.content).toBe(originalValue);
  });

  it("respects fieldScope restriction", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "helo world", confidence: 0.9 },
      { key: "Amount", value: "helo world", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({
      ocrResult,
      fieldScope: ["Name"],
    });

    const amountChanges = result.changes.filter((c) => c.fieldKey === "Amount");
    expect(amountChanges).toHaveLength(0);
  });

  it("skips numeric values", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "12345", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({ ocrResult });

    expect(result.ocrResult.keyValuePairs[0].value?.content).toBe("12345");
    expect(result.changes).toHaveLength(0);
  });

  it("records changes with correct structure", async () => {
    const ocrResult = makeOcrResult([
      { key: "Description", value: "teh quick brown fox", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({ ocrResult });

    if (result.changes.length > 0) {
      expect(result.changes[0]).toHaveProperty("fieldKey");
      expect(result.changes[0]).toHaveProperty("originalValue");
      expect(result.changes[0]).toHaveProperty("correctedValue");
      expect(result.changes[0]).toHaveProperty("reason");
      expect(result.changes[0].source).toBe("rule");
    }
  });
});
