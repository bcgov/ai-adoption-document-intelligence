import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import axios from "axios";
import { createActivityLogger } from "../logger";
import type { OcrPayloadRef } from "../ocr-payload-ref";
import {
  isOcrPayloadRef,
  loadOcrResponseFromPort,
  makeOcrPayloadRef,
  requireDocumentId,
  resolveGroupIdForOcr,
  writeOcrPayloadBlob,
} from "../ocr-payload-ref";
import type { OCRResponse, OCRResult, OcrOutputFormat } from "../types";

function normalizeEndpoint(url: string | undefined): string {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Activity: Extract OCR results from Azure response (blob ref or legacy inline).
 */
export async function extractOCRResults(params: {
  apimRequestId: string;
  fileName: string;
  fileType: string;
  modelId: string;
  documentId: string;
  groupId?: string | null;
  outputFormat?: OcrOutputFormat;
  ocrResponse?: OCRResponse | OcrPayloadRef;
}): Promise<{ ocrResult: OcrPayloadRef; _metered_quantity?: number }> {
  const activityName = "extractOCRResults";
  const documentId = requireDocumentId(params);
  const {
    apimRequestId,
    fileName,
    fileType,
    modelId,
    outputFormat,
    ocrResponse,
  } = params;
  const log = createActivityLogger(activityName, { apimRequestId, documentId });
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

  log.info("Extract OCR results start", {
    event: "start",
    fileName,
    fileType,
    modelId,
  });

  try {
    let ocrResponseObj: OCRResponse | undefined;

    if (ocrResponse !== undefined && ocrResponse !== null) {
      ocrResponseObj = isOcrPayloadRef(ocrResponse)
        ? await loadOcrResponseFromPort(ocrResponse)
        : ocrResponse;
    }

    if (!ocrResponseObj) {
      if (!endpoint || !apiKey) {
        throw new Error(
          "Azure Document Intelligence credentials not configured.",
        );
      }
      const normalizedEndpoint = normalizeEndpoint(endpoint);
      const normalizedModelId = modelId || "prebuilt-layout";
      const url = `${normalizedEndpoint}/documentintelligence/documentModels/${normalizedModelId}/analyzeResults/${apimRequestId}?api-version=2024-11-30`;
      const response = await axios.get<OCRResponse>(url, {
        headers: { "api-key": apiKey },
      });
      ocrResponseObj = response.data;
    }

    if (!ocrResponseObj) {
      throw new Error("No OCR response available to extract results.");
    }

    const analyzeResult = ocrResponseObj.analyzeResult || {
      apiVersion: "",
      modelId: "",
      content: "",
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
    };

    const isMarkdown = outputFormat === "markdown";
    const azureContent = analyzeResult.content || "";

    const result: OCRResult = {
      success: ocrResponseObj.status === "succeeded",
      status: ocrResponseObj.status || "unknown",
      apimRequestId: apimRequestId || "",
      fileName: fileName || "document",
      fileType: fileType || "pdf",
      modelId: analyzeResult.modelId || modelId || "prebuilt-layout",
      extractedText: isMarkdown ? "" : azureContent,
      markdown: isMarkdown ? azureContent : undefined,
      contentFormat: isMarkdown ? "markdown" : "text",
      pages: analyzeResult.pages || [],
      tables: analyzeResult.tables || [],
      paragraphs: analyzeResult.paragraphs || [],
      keyValuePairs: analyzeResult.keyValuePairs || [],
      sections: analyzeResult.sections || [],
      figures: analyzeResult.figures || [],
      documents: analyzeResult.documents || [],
      processedAt: new Date().toISOString(),
    };

    const groupId = await resolveGroupIdForOcr(documentId, params.groupId);
    const { blobPath, byteLength } = await writeOcrPayloadBlob(
      groupId,
      documentId,
      "ocr-result.json",
      result,
    );

    log.info("Extract OCR results complete", {
      event: "complete",
      fileName,
      status: result.status,
      pagesCount: result.pages.length,
      byteLength,
    });

    return {
      ocrResult: makeOcrPayloadRef(
        documentId,
        blobPath,
        "succeeded",
        byteLength,
      ),
      _metered_quantity: result.pages.length,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error("Extract OCR results error", {
      event: "error",
      fileName,
      error: errorMessage,
      stack: getErrorStack(error),
    });
    throw error;
  }
}
