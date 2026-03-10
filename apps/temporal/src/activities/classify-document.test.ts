import type { OCRResult } from "../types";
import type {
  ClassificationRule,
  ClassifyDocumentInput,
} from "./classify-document";
import { classifyDocument } from "./classify-document";
import type { DocumentSegment } from "./split-document";

function makeOcrResult(text: string, keys: string[] = []): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "req-1",
    fileName: "file.pdf",
    fileType: "pdf",
    modelId: "prebuilt-layout",
    extractedText: text,
    pages: [],
    tables: [],
    paragraphs: text
      ? [
          {
            content: text,
            spans: [],
            boundingRegions: [],
          },
        ]
      : [],
    keyValuePairs: keys.map((key) => ({
      key: { content: key, boundingRegions: [], spans: [] },
      value: { content: "value", boundingRegions: [], spans: [] },
      confidence: 0.9,
    })),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}

const segment: DocumentSegment = {
  segmentIndex: 1,
  pageRange: { start: 1, end: 1 },
  blobKey: "documents/doc-1/segments/segment-001-pages-1-1.pdf",
  pageCount: 1,
};

describe("classifyDocument activity", () => {
  it("matches contains rule", async () => {
    const input: ClassifyDocumentInput = {
      ocrResult: makeOcrResult("INVOICE #123"),
      segment,
      classifierType: "rule-based",
      rules: [
        {
          name: "invoice",
          patterns: [{ field: "text", operator: "contains", value: "INVOICE" }],
          resultType: "invoice",
        },
      ],
    };

    const result = await classifyDocument(input);
    expect(result.segmentType).toBe("invoice");
    expect(result.matchedRule).toBe("invoice");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("supports matches and startsWith operators", async () => {
    const rules: ClassificationRule[] = [
      {
        name: "receipt-starts",
        patterns: [{ field: "text", operator: "startsWith", value: "Receipt" }],
        resultType: "receipt",
      },
      {
        name: "invoice-regex",
        patterns: [{ field: "text", operator: "matches", value: "INV-\\d{3}" }],
        resultType: "invoice",
      },
    ];

    const result = await classifyDocument({
      ocrResult: makeOcrResult("INV-123"),
      segment,
      classifierType: "rule-based",
      rules,
    });

    expect(result.segmentType).toBe("invoice");
    expect(result.matchedRule).toBe("invoice-regex");
  });

  it("evaluates rules in order", async () => {
    const rules: ClassificationRule[] = [
      {
        name: "first",
        patterns: [{ field: "text", operator: "contains", value: "FORM" }],
        resultType: "form",
      },
      {
        name: "second",
        patterns: [{ field: "text", operator: "contains", value: "FORM" }],
        resultType: "other",
      },
    ];

    const result = await classifyDocument({
      ocrResult: makeOcrResult("FORM 100"),
      segment,
      classifierType: "rule-based",
      rules,
    });

    expect(result.segmentType).toBe("form");
    expect(result.matchedRule).toBe("first");
  });

  it("returns unknown when no match", async () => {
    const result = await classifyDocument({
      ocrResult: makeOcrResult("nothing to see here"),
      segment,
      classifierType: "rule-based",
      rules: [
        {
          name: "invoice",
          patterns: [{ field: "text", operator: "contains", value: "INVOICE" }],
          resultType: "invoice",
        },
      ],
    });

    expect(result.segmentType).toBe("unknown");
    expect(result.matchedRule).toBeUndefined();
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("uses custom rules with keyValuePair.key", async () => {
    const result = await classifyDocument({
      ocrResult: makeOcrResult("text", ["Invoice Number"]),
      segment,
      classifierType: "rule-based",
      rules: [
        {
          name: "kvp-rule",
          patterns: [
            {
              field: "keyValuePair.key",
              operator: "contains",
              value: "Invoice",
            },
          ],
          resultType: "invoice",
        },
      ],
    });

    expect(result.segmentType).toBe("invoice");
    expect(result.matchedRule).toBe("kvp-rule");
  });
});
