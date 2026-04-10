import { getErrorStack,
  getErrorMessage,
} from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { createActivityLogger } from "../logger";
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
  const log = createActivityLogger(activityName, { apimRequestId });
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === "true";

  log.info("Poll OCR results start", {
    event: "start",
    modelId,
    useMock,
  });

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

    log.info("Poll OCR results complete (mock)", {
      event: "complete_mock",
      status: "succeeded",
    });

    return {
      status: "succeeded",
      response: mockResponse,
    };
  }

  if (!endpoint || !apiKey) {
    log.error("Poll OCR results: missing credentials", {
      event: "error",
      modelId,
      error: "missing_credentials",
      message: "Azure Document Intelligence credentials not configured",
    });
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.",
    );
  }

  if (!apimRequestId || typeof apimRequestId !== "string") {
    log.error("Poll OCR results: invalid APIM Request ID", {
      event: "error",
      modelId,
      error: "invalid_apim_request_id",
      message: "APIM Request ID not available for polling",
    });
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
      log.error("Poll OCR results: Azure API error", {
        event: "error",
        error: "azure_api_error",
        status: response.status,
        body: response.body,
      });
      throw new Error(`Failed to poll OCR results. Status: ${response.status}`);
    }

    const responseBody = response.body as OCRResponse;

    if (!responseBody) {
      log.error("Poll OCR results: empty response body", {
        event: "error",
        error: "empty_response_body",
        message: "Empty response from Azure OCR polling endpoint",
      });
      throw new Error("Empty response from Azure OCR polling endpoint");
    }

    const status = responseBody.status || "unknown";
    log.info("Poll OCR results complete", {
      event: "complete",
      status,
    });

    return {
      status: status as "running" | "succeeded" | "failed",
      response: responseBody,
    };
  } catch (error) {
    log.error("Poll OCR results error", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
