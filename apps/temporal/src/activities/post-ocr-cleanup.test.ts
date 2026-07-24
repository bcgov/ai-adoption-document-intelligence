jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

import type { OcrPayloadRef } from "../ocr-payload-ref";
import * as ocrPayloadRef from "../ocr-payload-ref";
import type { OCRResult } from "../types";
import { postOcrCleanup } from "./post-ocr-cleanup";

const DOC_ID = "doc-cleanup-test";
const cleanedBodies = new Map<string, OCRResult>();

function cleanedFromRef(result: { cleanedResult: OcrPayloadRef }): OCRResult {
  const body = cleanedBodies.get(result.cleanedResult.blobPath);
  if (!body) {
    throw new Error(
      `missing cleaned body for ${result.cleanedResult.blobPath}`,
    );
  }
  return body;
}

describe("postOcrCleanup activity", () => {
  beforeEach(() => {
    cleanedBodies.clear();
    jest
      .spyOn(ocrPayloadRef, "resolveGroupIdForOcr")
      .mockResolvedValue("gtestgroupidfortests01");
    jest
      .spyOn(ocrPayloadRef, "persistOcrArtifactRef")
      .mockImplementation(async (_groupId, documentId, _file, body) => {
        const ref: OcrPayloadRef = {
          documentId,
          blobPath: `gtestgroupidfortests01/ocr/${documentId}/cleaned-result.json`,
          storage: "blob",
          status: "succeeded",
        };
        cleanedBodies.set(ref.blobPath, body as OCRResult);
        return ref;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("cleans unicode and encoding artifacts", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Hello\u00A0World\u2013test\u201CHello\u201D",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });

    expect(cleanedFromRef(result).extractedText).toBe(
      'Hello World-test"Hello"',
    );
  });

  it("removes hyphenation at line breaks", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "This is a docu- \nment with hyphen-\nation.",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });
    const cleaned = cleanedFromRef(result).extractedText;

    expect(cleaned).toContain("document");
    expect(cleaned).toContain("hyphenation");
  });

  it("normalizes date separators", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Date: 12 . 31 . 2024",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });

    expect(cleanedFromRef(result).extractedText).toContain("12/31/2024");
  });

  it("fixes common OCR number errors", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Total: 1O5.O0",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });

    expect(cleanedFromRef(result).extractedText).toContain("105.00");
  });

  it("cleans text in pages, paragraphs, and tables", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Hello\u00A0World",
              confidence: 0.99,
              polygon: [],
              span: { offset: 0, length: 11 },
            },
          ],
          lines: [
            {
              content: "Hello\u00A0World",
              polygon: [],
              spans: [{ offset: 0, length: 11 }],
            },
          ],
          spans: [{ offset: 0, length: 11 }],
        },
      ],
      paragraphs: [
        {
          content: "Para\u2013graph",
          role: "text",
          boundingRegions: [],
          spans: [{ offset: 0, length: 9 }],
        },
      ],
      tables: [
        {
          rowCount: 1,
          columnCount: 1,
          cells: [
            {
              rowIndex: 0,
              columnIndex: 0,
              content: "1O5",
              boundingRegions: [],
              spans: [{ offset: 0, length: 3 }],
            },
          ],
          boundingRegions: [],
          spans: [{ offset: 0, length: 3 }],
        },
      ],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });
    const cleaned = cleanedFromRef(result);

    expect(cleaned.pages[0].words[0].content).toBe("Hello World");
    expect(cleaned.pages[0].lines[0].content).toBe("Hello World");
    expect(cleaned.paragraphs[0].content).toBe("Para-graph");
    expect(cleaned.tables[0].cells[0].content).toBe("105");
  });

  it("cleans text in key-value pairs", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [
        {
          key: {
            content: "Name\u00A0Key",
            boundingRegions: [],
            spans: [{ offset: 0, length: 8 }],
          },
          value: {
            content: "Value\u2013Text",
            boundingRegions: [],
            spans: [{ offset: 9, length: 10 }],
          },
          confidence: 0.95,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await postOcrCleanup({ ocrResult, documentId: DOC_ID });
    const cleaned = cleanedFromRef(result);

    expect(cleaned.keyValuePairs[0].key.content).toBe("Name Key");
    expect(cleaned.keyValuePairs[0].value?.content).toBe("Value-Text");
  });

  it("returns original result if cleanup fails", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const brokenResult = {
      ...ocrResult,
      pages: null as unknown as typeof ocrResult.pages,
    };

    const result = await postOcrCleanup({
      ocrResult: brokenResult,
      documentId: DOC_ID,
    });

    expect(cleanedFromRef(result)).toEqual(brokenResult);
  });

  it("does not modify original ocrResult object", async () => {
    const originalText = "Hello\u00A0World";
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: originalText,
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    await postOcrCleanup({ ocrResult, documentId: DOC_ID });

    expect(ocrResult.extractedText).toBe(originalText);
  });
});
