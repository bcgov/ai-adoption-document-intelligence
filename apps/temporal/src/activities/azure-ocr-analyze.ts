import { createActivityLogger } from "../logger";
import type { OcrPayloadRef } from "../ocr-payload-ref";
import type { OCRResponse } from "../types";
import { pollUntilSettled } from "./azure-poll-loop";
import { extractOCRResults } from "./extract-ocr-results";
import { pollOCRResults } from "./poll-ocr-results";
import { prepareFileData } from "./prepare-file-data";
import { submitToAzureOCR } from "./submit-to-azure-ocr";
import { updateDocumentStatus } from "./update-document-status";

/** Submit id reported by `submitToAzureOCR` when a benchmark replay short-circuits it. */
const BENCHMARK_REPLAY_REQUEST_ID = "benchmark-ocr-cache";

export interface AnalyzeWithAzureOcrParams {
  documentId: string;
  groupId?: string | null;
  blobKey: string;
  fileName?: string;
  fileType?: "pdf" | "image";
  contentType?: string;
  modelId?: string;
  requestId?: string;
  locale?: string;
  pollIntervalSeconds?: number;
  maxWaitSeconds?: number;
  __benchmarkOcrCache?: { ocrResponse?: OCRResponse };
}

export interface AnalyzeWithAzureOcrResult {
  ocrResult: OcrPayloadRef;
  apimRequestId: string;
  _metered_quantity?: number;
}

/**
 * Activity: Extract text with Azure Document Intelligence in one step.
 *
 * Runs the same activities a granular workflow chains together
 * (`file.prepare` → `azureOcr.submit` → `document.updateStatus` →
 * `azureOcr.poll` until settled → `azureOcr.extract`) and returns the
 * structured OCR result. The granular activities stay registered, so existing
 * workflows are unaffected.
 *
 * @param params - Document reference, OCR model and optional poll timing.
 * @returns The OCR result reference, the Azure request id and the page count
 * used for billing.
 */
export async function analyzeWithAzureOcr(
  params: AnalyzeWithAzureOcrParams,
): Promise<AnalyzeWithAzureOcrResult> {
  const log = createActivityLogger("analyzeWithAzureOcr", {
    documentId: params.documentId,
    ...(params.requestId && { requestId: params.requestId }),
  });

  const { preparedData } = await prepareFileData({
    documentId: params.documentId,
    groupId: params.groupId,
    blobKey: params.blobKey,
    fileName: params.fileName,
    fileType: params.fileType,
    contentType: params.contentType,
    modelId: params.modelId,
    requestId: params.requestId,
  });

  const submission = await submitToAzureOCR({
    fileData: preparedData,
    groupId: params.groupId,
    locale: params.locale,
    __benchmarkOcrCache: params.__benchmarkOcrCache,
  });
  const { apimRequestId } = submission;

  if (apimRequestId !== BENCHMARK_REPLAY_REQUEST_ID && params.groupId) {
    await updateDocumentStatus({
      documentId: params.documentId,
      groupId: params.groupId,
      status: "ongoing_ocr",
      apimRequestId,
      requestId: params.requestId,
    });
  }

  const polled = await pollUntilSettled<
    Awaited<ReturnType<typeof pollOCRResults>>
  >(
    async () => {
      const result = await pollOCRResults({
        apimRequestId,
        modelId: preparedData.modelId,
        documentId: params.documentId,
        groupId: params.groupId,
        __benchmarkOcrCache: params.__benchmarkOcrCache,
      });
      return result.status === "running"
        ? { done: false }
        : { done: true, value: result };
    },
    {
      pollIntervalSeconds: params.pollIntervalSeconds,
      maxWaitSeconds: params.maxWaitSeconds,
      description: "Azure OCR to finish",
    },
  );

  const extracted = await extractOCRResults({
    apimRequestId,
    fileName: preparedData.fileName,
    fileType: preparedData.fileType,
    modelId: preparedData.modelId,
    documentId: params.documentId,
    groupId: params.groupId,
    ocrResponse: polled.ocrResponse,
  });

  log.info("Azure OCR analysis complete", { event: "complete", apimRequestId });

  return {
    ocrResult: extracted.ocrResult,
    apimRequestId,
    _metered_quantity: extracted._metered_quantity,
  };
}
