import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { ApplicationFailure } from "@temporalio/activity";
import { createActivityLogger } from "../logger";
import {
  makeOcrPayloadRef,
  requireDocumentId,
  resolveGroupIdForOcr,
  writeOcrPayloadBlob,
} from "../ocr-payload-ref";
import type { OCRResponse, PollResult } from "../types";

function throwFailedOcrResponse(responseBody: OCRResponse): never {
  const detail = responseBody.error?.message ?? "unknown error";
  const code = responseBody.error?.code;
  const suffix = code ? `${code}: ${detail}` : detail;

  throw ApplicationFailure.create({
    message: `Azure OCR analysis failed: ${suffix}`,
    nonRetryable: true,
    details: [responseBody],
  });
}

/**
 * Activity: Poll Azure Document Intelligence for OCR results.
 * Returns a lightweight OcrPayloadRef on port `ocrResponse` (no inline JSON in
 * history). The port name must match the `azureOcr.poll` catalog entry — see
 * `PollResult` in `../types`.
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
        ocrResponse: makeOcrPayloadRef(documentId, "", "running"),
      };
    }
    if (status === "failed") {
      throwFailedOcrResponse(body);
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
      ocrResponse: makeOcrPayloadRef(
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
    // Test seam: when MOCK_AZURE_OCR is on, an integration harness may supply a
    // specific analyze response via MOCK_AZURE_OCR_RESPONSE (JSON) so the real
    // downstream extract/gate run against a chosen payload; otherwise fall back
    // to a minimal canned response.
    const injected = process.env.MOCK_AZURE_OCR_RESPONSE;
    const mockResponse: OCRResponse = injected
      ? (JSON.parse(injected) as OCRResponse)
      : {
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
      ocrResponse: makeOcrPayloadRef(
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
        modelId: normalizedModelId,
        body: response.body,
      });
      // A 404 here almost always means this node is polling a DIFFERENT model
      // from the one Submit OCR analysed under: the analyze-result id is
      // scoped to its model, so `GET /documentModels/{other}/analyzeResults/{id}`
      // is a miss even though the submission succeeded. Say so — the bare
      // "Status: 404" sent a developer hunting through the engine for a
      // regression that was really a two-models-one-run mismatch.
      const hint =
        Number(response.status) === 404
          ? ` No analyze result "${apimRequestId}" under model "${normalizedModelId}". An analyze result belongs to the model it was submitted with, so check that this step polls the SAME model id the Submit OCR step used, and that AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points at the resource the document was submitted to. Azure also discards analyze results after 24 hours.`
          : "";
      throw new Error(
        `Failed to poll OCR results. Status: ${response.status}${hint}`,
      );
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
        ocrResponse: makeOcrPayloadRef(documentId, "", "running"),
      };
    }

    if (status === "failed") {
      throwFailedOcrResponse(responseBody);
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
      ocrResponse: makeOcrPayloadRef(
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
