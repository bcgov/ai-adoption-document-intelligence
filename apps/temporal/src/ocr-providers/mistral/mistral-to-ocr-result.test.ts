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
                {
                  text: "Hello",
                  confidence: 0.9,
                  start_index: 0,
                  bbox: {
                    top_left_x: 10,
                    top_left_y: 20,
                    bottom_right_x: 50,
                    bottom_right_y: 40,
                  },
                },
                {
                  text: "world",
                  confidence: 0.85,
                  start_index: 6,
                  bbox: {
                    top_left_x: 55,
                    top_left_y: 22,
                    bottom_right_x: 95,
                    bottom_right_y: 42,
                  },
                },
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
    // Polygons populated from per-word bbox in canonical 8-element form,
    // top-left clockwise: [x1,y1,x2,y1,x2,y2,x1,y2].
    expect(result.pages[0].words[0].polygon).toEqual([
      10, 20, 50, 20, 50, 40, 10, 40,
    ]);
    expect(result.pages[0].words[1].polygon).toEqual([
      55, 22, 95, 22, 95, 42, 55, 42,
    ]);
    expect(result.pages[0].unit).toBe("pixel");
    expect(result.keyValuePairs).toHaveLength(1);
    expect(result.keyValuePairs[0].key.content).toBe("field_a");
    expect(result.keyValuePairs[0].value?.content).toBe("x");
    expect(result.documents).toBeUndefined();
  });

  it("populates line polygons when line_confidence_scores include bbox", () => {
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
              line_confidence_scores: [
                {
                  text: "Hello world",
                  confidence: 0.88,
                  start_index: 0,
                  bbox: {
                    top_left_x: 10,
                    top_left_y: 20,
                    bottom_right_x: 95,
                    bottom_right_y: 42,
                  },
                },
              ],
            },
          },
        ],
        usage_info: { pages_processed: 1 },
      },
      {
        fileName: "doc.pdf",
        fileType: "pdf",
        requestId: "id-line",
        modelId: "mistral-ocr-latest",
      },
    );
    expect(result.pages[0].lines).toHaveLength(1);
    expect(result.pages[0].lines[0].polygon).toEqual([
      10, 20, 95, 20, 95, 42, 10, 42,
    ]);
  });

  it("leaves polygons empty when bbox data is absent (preserves prior behavior for legacy responses)", () => {
    const result = mistralOcrResponseToOcrResult(
      {
        model: "mistral-ocr-latest",
        pages: [
          {
            index: 0,
            markdown: "Hello",
            dimensions: { width: 100, height: 200, dpi: 72 },
            confidence_scores: {
              average_page_confidence_score: 0.9,
              minimum_page_confidence_score: 0.8,
              word_confidence_scores: [
                { text: "Hello", confidence: 0.9, start_index: 0 },
              ],
            },
          },
        ],
        usage_info: { pages_processed: 1 },
      },
      {
        fileName: "doc.pdf",
        fileType: "pdf",
        requestId: "id-no-bbox",
        modelId: "mistral-ocr-latest",
      },
    );
    expect(result.pages[0].words[0].polygon).toEqual([]);
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
