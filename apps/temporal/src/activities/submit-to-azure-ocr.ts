import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import * as fs from "fs";
import * as path from "path";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import type { PreparedFileData, SubmissionResult } from "../types";
import { createActivityLogger } from "../logger";

/**
 * Normalize endpoint URL by removing trailing slash.
 */
function normalizeEndpoint(url: string | undefined): string {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function readBlobData(blobKey: string): Promise<Buffer> {
  // If blobKey is an absolute path on disk (e.g. materialized by benchmark),
  // read directly from the filesystem instead of object storage.
  if (path.isAbsolute(blobKey)) {
    try {
      return await fs.promises.readFile(blobKey);
    } catch (_error) {
      throw new Error(`File not found on disk: "${blobKey}"`);
    }
  }

  const client = getBlobStorageClient();
  try {
    return await client.read(blobKey);
  } catch (_error) {
    throw new Error(`Blob not found: "${blobKey}"`);
  }
}

/**
 * Activity: Submit document to Azure Document Intelligence OCR API
 * Returns serializable response data with headers including apim-request-id
 */
export async function submitToAzureOCR(params: {
  fileData: PreparedFileData;
}): Promise<SubmissionResult> {
  const activityName = "submitToAzureOCR";
  const { fileData } = params;
  const log = createActivityLogger(activityName);
  const startTime = Date.now();
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === "true";

  log.info("Submit to Azure OCR start", {
    event: "start",
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    contentType: fileData.contentType,
    modelId: fileData.modelId,
    blobKey: fileData.blobKey,
    useMock,
  });

  // Mock mode for testing
  if (useMock) {
    const mockRequestId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = Date.now() - startTime;

    log.info("Submit to Azure OCR complete (mock)", {
      event: "complete_mock",
      apimRequestId: mockRequestId,
      durationMs: duration,
    });

    return {
      statusCode: 202,
      apimRequestId: mockRequestId,
      headers: {
        "apim-request-id": mockRequestId,
        "operation-location": `https://mock.azure.com/results/${mockRequestId}`,
      },
    };
  }

  if (!endpoint || !apiKey) {
    const duration = Date.now() - startTime;
    log.error("Submit to Azure OCR: missing credentials", {
      event: "error",
      error: "missing_credentials",
      message: "Azure Document Intelligence credentials not configured",
      durationMs: duration,
    });
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.",
    );
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const modelId = fileData.modelId || "prebuilt-layout";

  try {
    // Initialize Azure Document Intelligence client (SDK appends /documentintelligence to endpoint)
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      normalizedEndpoint,
      { key: apiKey },
      {
        credentials: {
          apiKeyHeaderName: "api-key",
        },
      },
    );

    const fileBuffer = await readBlobData(fileData.blobKey);

    // Build analyze options - only include features for prebuilt models
    const isPrebuiltModel =
      modelId.startsWith("prebuilt-") || modelId === "prebuilt-read";
    const features = isPrebuiltModel ? ["keyValuePairs"] : undefined;

    // Submit document for analysis using base64 encoding (APIM compatible)
    const initialResponse = await client
      .path("/documentModels/{modelId}:analyze", modelId)
      .post({
        contentType: "application/json",
        queryParameters: {
          features: features as string[] | undefined,
        },
        body: {
          base64Source: fileBuffer.toString("base64"),
        },
      });

    if (isUnexpected(initialResponse)) {
      const status = initialResponse.status;
      log.error("Submit to Azure OCR: API error", {
        event: "error",
        error: "azure_api_error",
        status,
        body: initialResponse.body,
      });
      const hint =
        Number(status) === 404
          ? ` Model "${modelId}" may not exist in this resource, or the model ID may be wrong. For custom models, use the exact model ID returned when the model was built (e.g. from GET documentModels or the build response). Verify AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points to the same resource where the model was created.`
          : "";
      throw new Error(
        `Failed to submit document to Azure OCR. Status: ${status}${hint}`,
      );
    }

    const statusCode = Number(initialResponse.status);
    const apimRequestId =
      initialResponse.headers["apim-request-id"] ||
      initialResponse.headers["Apim-Request-Id"] ||
      initialResponse.headers["APIM-Request-Id"] ||
      null;

    // Validate status code
    if (statusCode !== 202) {
      log.error("Submit to Azure OCR: unexpected status code", {
        event: "error",
        error: "unexpected_status_code",
        statusCode,
        expectedStatusCode: 202,
        responseBody: initialResponse.body,
      });
      throw new Error(
        `Failed to submit document to Azure OCR. Expected status code 202, got ${statusCode}`,
      );
    }

    if (!apimRequestId) {
      log.error("Submit to Azure OCR: missing APIM Request ID", {
        event: "error",
        error: "missing_apim_request_id",
        availableHeaders: Object.keys(initialResponse.headers),
      });
      throw new Error("APIM Request ID not found in response headers");
    }

    log.info("Submit to Azure OCR complete", {
      event: "complete",
      statusCode,
      apimRequestId,
    });

    // Return serializable result
    return {
      statusCode,
      apimRequestId: apimRequestId as string,
      headers: initialResponse.headers as Record<string, string | string[]>,
    };
  } catch (error) {
    log.error("Submit to Azure OCR error", {
      event: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
