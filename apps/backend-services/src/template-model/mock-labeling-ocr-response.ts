import type { AnalysisResponse } from "@/ocr/azure-types";

/** Minimal succeeded OCR payload for DOCUMENT_INTELLIGENCE_MODE=mock labeling flows. */
export function mockLabelingOcrAnalysisResponse(): AnalysisResponse {
  const now = new Date().toISOString();
  return {
    status: "succeeded",
    createdDateTime: now,
    lastUpdatedDateTime: now,
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "prebuilt-layout",
      stringIndexType: "textElements",
      content: "mock",
      pages: [],
      tables: [],
      paragraphs: [],
      styles: [],
      contentFormat: "text",
      sections: [],
      figures: [],
      keyValuePairs: [],
    },
  };
}
