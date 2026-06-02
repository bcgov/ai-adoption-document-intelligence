import type { ClassificationResultDto } from "@/azure/dto/classification-result.dto";

/** HTTPS origin used when DOCUMENT_INTELLIGENCE_MODE=mock (no outbound calls). */
export const MOCK_DOCUMENT_INTELLIGENCE_ENDPOINT =
  "https://mock.documentintelligence.local";

const MOCK_CLASSIFY_OPERATION_ID = "mock-classify-operation";

export function buildMockClassificationOperationLocation(
  endpointBase: string,
): string {
  const base = endpointBase.replace(/\/$/, "");
  return `${base}/documentintelligence/analyzeResults/${MOCK_CLASSIFY_OPERATION_ID}`;
}

/** Minimal poll body compatible with `ClassificationResultDto` when cast from controller. */
export function mockClassificationPollResult(): ClassificationResultDto {
  const now = new Date().toISOString();
  return {
    status: "succeeded",
    createdDateTime: now,
    lastUpdatedDateTime: now,
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "mock-classifier",
      stringIndexType: "textElements",
      content: "",
      pages: [],
      documents: [],
      contentFormat: "text",
    },
  };
}
