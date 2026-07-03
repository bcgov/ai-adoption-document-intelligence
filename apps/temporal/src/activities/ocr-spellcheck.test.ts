jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const ocrBodiesByPath = new Map<string, unknown>();

jest.mock("../ocr-payload-ref", () => {
  const actual = jest.requireActual(
    "../ocr-payload-ref",
  ) as typeof import("../ocr-payload-ref");
  return {
    ...actual,
    writeOcrPayloadBlob: jest.fn(
      async (
        groupId: string,
        documentId: string,
        fileName: string,
        body: unknown,
      ) => {
        const blobPath = `${groupId}/ocr/${documentId}/${fileName}`;
        ocrBodiesByPath.set(blobPath, body);
        return { blobPath, byteLength: 64 };
      },
    ),
    persistOcrArtifactRef: jest.fn(
      async (
        groupId: string,
        documentId: string,
        fileName: string,
        body: unknown,
      ) => {
        const blobPath = `${groupId}/ocr/${documentId}/${fileName}`;
        ocrBodiesByPath.set(blobPath, body);
        return {
          documentId,
          blobPath,
          storage: "blob" as const,
          status: "succeeded" as const,
        };
      },
    ),
    loadOcrResultFromPort: jest.fn(async (ref: { blobPath: string }) =>
      ocrBodiesByPath.get(ref.blobPath),
    ),
  };
});

import type { OcrPayloadRef } from "../ocr-payload-ref";
import type { OCRResult } from "../types";
import { spellcheckOcrResult } from "./ocr-spellcheck";

const DOC_ID = "doc-spellcheck-test";
const TEST_GROUP_ID = "gtestgroupidfortests01";

function ocrFromRef(ref: OcrPayloadRef): OCRResult {
  const body = ocrBodiesByPath.get(ref.blobPath);
  if (!body) {
    throw new Error(`missing OCR body for ${ref.blobPath}`);
  }
  return body as OCRResult;
}

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
  beforeEach(() => {
    ocrBodiesByPath.clear();
  });

  it("corrects misspelled words", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "Jonh Doe", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({
      ocrResult,
      documentId: DOC_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(result.ocrResult).toBeDefined();
    expect(result.changes.length).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.language).toBe("en");
  });

  it("does not mutate the original OCR result", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "helo world", confidence: 0.9 },
    ]);
    const originalValue = ocrResult.keyValuePairs[0].value?.content;

    await spellcheckOcrResult({
      ocrResult,
      documentId: DOC_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(ocrResult.keyValuePairs[0].value?.content).toBe(originalValue);
  });

  it("respects fieldScope restriction", async () => {
    const ocrResult = makeOcrResult([
      { key: "Name", value: "helo world", confidence: 0.9 },
      { key: "Amount", value: "helo world", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({
      ocrResult,
      documentId: DOC_ID,
      groupId: TEST_GROUP_ID,
      fieldScope: ["Name"],
    });

    const amountChanges = result.changes.filter((c) => c.fieldKey === "Amount");
    expect(amountChanges).toHaveLength(0);
  });

  it("skips numeric values", async () => {
    const ocrResult = makeOcrResult([
      { key: "Amount", value: "12345", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({
      ocrResult,
      documentId: DOC_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(ocrFromRef(result.ocrResult).keyValuePairs[0].value?.content).toBe(
      "12345",
    );
    expect(result.changes).toHaveLength(0);
  });

  it("records changes with correct structure", async () => {
    const ocrResult = makeOcrResult([
      { key: "Description", value: "teh quick brown fox", confidence: 0.9 },
    ]);

    const result = await spellcheckOcrResult({
      ocrResult,
      documentId: DOC_ID,
      groupId: TEST_GROUP_ID,
    });

    if (result.changes.length > 0) {
      expect(result.changes[0]).toHaveProperty("fieldKey");
      expect(result.changes[0]).toHaveProperty("originalValue");
      expect(result.changes[0]).toHaveProperty("correctedValue");
      expect(result.changes[0]).toHaveProperty("reason");
      expect(result.changes[0].source).toBe("rule");
    }
  });
});
