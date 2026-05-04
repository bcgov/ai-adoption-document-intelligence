import { mistralOcrResponseToOcrResult } from "./mistral-to-ocr-result";

describe("mistralOcrResponseToOcrResult", () => {
  it("maps pages, extractedText, and document_annotation to keyValuePairs", () => {
    const result = mistralOcrResponseToOcrResult(
      {
        model: "mistral-ocr-latest",
        pages: [
          {
            index: 0,
            markdown: "Hello world",
            dimensions: { width: 100, height: 200, dpi: 72 },
            confidence_scores: {
              average_page_confidence_score: 0.9,
              minimum_page_confidence_score: 0.8,
              word_confidence_scores: [
                { text: "Hello", confidence: 0.9, start_index: 0 },
                { text: "world", confidence: 0.85, start_index: 6 },
              ],
            },
          },
        ],
        document_annotation: JSON.stringify({ field_a: "x" }),
        usage_info: { pages_processed: 1 },
      },
      {
        fileName: "doc.pdf",
        fileType: "pdf",
        requestId: "mistral-test-id",
        modelId: "mistral-ocr-latest",
      },
    );

    expect(result.success).toBe(true);
    expect(result.apimRequestId).toBe("mistral-test-id");
    expect(result.extractedText).toContain("Hello world");
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].words).toHaveLength(2);
    expect(result.keyValuePairs).toHaveLength(1);
    expect(result.keyValuePairs[0].key.content).toBe("field_a");
    expect(result.keyValuePairs[0].value?.content).toBe("x");
    expect(result.documents).toBeUndefined();
  });

  it("populates documents when fieldDefs align with template schema", () => {
    const result = mistralOcrResponseToOcrResult(
      {
        model: "mistral-ocr-latest",
        pages: [
          {
            index: 0,
            markdown: "x",
            dimensions: { width: 10, height: 10, dpi: 72 },
          },
        ],
        document_annotation: JSON.stringify({ field_a: "hello" }),
        usage_info: { pages_processed: 1 },
      },
      {
        fileName: "doc.pdf",
        fileType: "pdf",
        requestId: "id2",
        modelId: "mistral-ocr-latest",
      },
      {
        fieldDefs: [{ field_key: "field_a", field_type: "string" }],
      },
    );
    expect(result.documents?.[0].fields.field_a?.valueString).toBe("hello");
    expect(result.keyValuePairs[0].value?.content).toBe("hello");
  });
});
