import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import type { OCRResponse, PollResult } from "../types";

/**
 * Activity: Poll Azure Document Intelligence for OCR results
 * Returns status and full response if available
 */
export async function pollOCRResults(params: {
  apimRequestId: string;
  modelId: string;
}): Promise<PollResult> {
  const activityName = "pollOCRResults";
  const { apimRequestId, modelId } = params;
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === "true";

  console.log(
    JSON.stringify({
      activity: activityName,
      event: "start",
      apimRequestId,
      modelId,
      useMock,
      timestamp: new Date().toISOString(),
    }),
  );

  // Mock mode for testing
  if (useMock) {
    const mockResponse: OCRResponse = {
      status: "succeeded",
      createdDateTime: new Date().toISOString(),
      lastUpdatedDateTime: new Date().toISOString(),
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: modelId || "prebuilt-layout",
        content: "Mock OCR content for testing\nLine 2\nLine 3",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            unit: "inch",
            words: [],
            lines: [],
            spans: [{ offset: 0, length: 50 }],
          },
        ],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
      },
    };

    console.log(
      JSON.stringify({
        activity: activityName,
        event: "complete_mock",
        apimRequestId,
        status: "succeeded",
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      status: "succeeded",
      response: mockResponse,
    };
  }

  if (!endpoint || !apiKey) {
    console.error(
      JSON.stringify({
        activity: activityName,
        event: "error",
        apimRequestId,
        modelId,
        error: "missing_credentials",
        message: "Azure Document Intelligence credentials not configured",
        timestamp: new Date().toISOString(),
      }),
    );
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.",
    );
  }

  if (!apimRequestId || typeof apimRequestId !== "string") {
    console.error(
      JSON.stringify({
        activity: activityName,
        event: "error",
        apimRequestId,
        modelId,
        error: "invalid_apim_request_id",
        message: "APIM Request ID not available for polling",
        timestamp: new Date().toISOString(),
      }),
    );
    throw new Error("APIM Request ID not available for polling");
  }

  const normalizedModelId = modelId || "prebuilt-layout";

  try {
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      endpoint,
      { key: apiKey },
      {
        credentials: {
          apiKeyHeaderName: "api-key",
        },
      },
    );

    // Poll for results
    const response = await client
      .path(
        "/documentModels/{modelId}/analyzeResults/{resultId}",
        normalizedModelId,
        apimRequestId,
      )
      .get();

    if (isUnexpected(response)) {
      console.error(
        JSON.stringify({
          activity: activityName,
          event: "error",
          apimRequestId,
          error: "azure_api_error",
          status: response.status,
          body: response.body,
          timestamp: new Date().toISOString(),
        }),
      );
      throw new Error(`Failed to poll OCR results. Status: ${response.status}`);
    }

    const responseBody = response.body as OCRResponse;

    if (!responseBody) {
      console.error(
        JSON.stringify({
          activity: activityName,
          event: "error",
          apimRequestId,
          error: "empty_response_body",
          message: "Empty response from Azure OCR polling endpoint",
          timestamp: new Date().toISOString(),
        }),
      );
      throw new Error("Empty response from Azure OCR polling endpoint");
    }

    const status = responseBody.status || "unknown";
    console.log(
      JSON.stringify({
        activity: activityName,
        event: "complete",
        apimRequestId,
        status,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      status: status as "running" | "succeeded" | "failed",
      response: responseBody,
    };
  } catch (error) {
    const errorDetails: Record<string, unknown> = {
      activity: activityName,
      event: "error",
      apimRequestId,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };

    if (error instanceof Error && error.stack) {
      errorDetails.stack = error.stack;
    }

    console.error(JSON.stringify(errorDetails));
    throw error;
  }
}
