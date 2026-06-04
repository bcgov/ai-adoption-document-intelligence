import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { createActivityLogger } from "../logger";
import {
  makeOcrPayloadRef,
  requireDocumentId,
  resolveGroupIdForOcr,
  writeOcrPayloadBlob,
} from "../ocr-payload-ref";
import type { OCRResponse, PollResult } from "../types";

/**
 * Activity: Poll Azure Document Intelligence for OCR results.
 * Returns a lightweight OcrPayloadRef on port `response` (no inline JSON in history).
 */
export async function pollOCRResults(params: {
  apimRequestId: string;
  modelId: string;
  documentId: string;
  groupId?: string | null;
  __benchmarkOcrCache?: { ocrResponse?: OCRResponse };
}): Promise<PollResult> {
  const activityName = "pollOCRResults";
  const documentId = requireDocumentId(params);
  const { apimRequestId, modelId } = params;
  const log = createActivityLogger(activityName, { apimRequestId, documentId });
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === "true";

  const cache = params.__benchmarkOcrCache;
  if (cache?.ocrResponse) {
    const body = cache.ocrResponse;
    const status = body.status || "unknown";
    log.info("Poll OCR results skipped (benchmark OCR cache replay)", {
      event: "benchmark_cache_skip",
      status,
    });
    if (status === "running") {
      return {
        status: "running",
        response: makeOcrPayloadRef(documentId, "", "running"),
      };
    }
    if (status === "failed") {
      return {
        status: "failed",
        response: makeOcrPayloadRef(documentId, "", "failed"),
      };
    }
    const groupId = await resolveGroupIdForOcr(documentId, params.groupId);
    const { blobPath, byteLength } = await writeOcrPayloadBlob(
      groupId,
      documentId,
      "azure-response.json",
      body,
    );
    return {
      status: "succeeded",
      response: makeOcrPayloadRef(
        documentId,
        blobPath,
        "succeeded",
        byteLength,
      ),
    };
  }

  log.info("Poll OCR results start", {
    event: "start",
    modelId,
    useMock,
  });

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

    const groupId = await resolveGroupIdForOcr(documentId, params.groupId);
    const { blobPath, byteLength } = await writeOcrPayloadBlob(
      groupId,
      documentId,
      "azure-response.json",
      mockResponse,
    );

    log.info("Poll OCR results complete (mock)", {
      event: "complete_mock",
      status: "succeeded",
    });

    return {
      status: "succeeded",
      response: makeOcrPayloadRef(
        documentId,
        blobPath,
        "succeeded",
        byteLength,
      ),
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
      throw new Error("Empty response from Azure OCR polling endpoint");
    }

    const status = responseBody.status || "unknown";
    log.info("Poll OCR results complete", {
      event: "complete",
      status,
      alertType: "azure_ocr_poll",
    });

    if (status === "running") {
      return {
        status: "running",
        response: makeOcrPayloadRef(documentId, "", "running"),
      };
    }

    if (status === "failed") {
      return {
        status: "failed",
        response: makeOcrPayloadRef(documentId, "", "failed"),
      };
    }

    const groupId = await resolveGroupIdForOcr(documentId, params.groupId);
    const { blobPath, byteLength } = await writeOcrPayloadBlob(
      groupId,
      documentId,
      "azure-response.json",
      responseBody,
    );

    return {
      status: "succeeded",
      response: makeOcrPayloadRef(
        documentId,
        blobPath,
        "succeeded",
        byteLength,
      ),
    };
  } catch (error) {
    log.error("Poll OCR results error", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
      alertType: "azure_ocr_poll",
    });
    throw error;
  }
}
