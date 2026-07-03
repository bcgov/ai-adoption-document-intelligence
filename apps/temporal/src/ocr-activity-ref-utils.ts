import type { CorrectionResult } from "./correction-types";
import {
  isOcrPayloadRef,
  loadOcrResultFromPort,
  type OcrPayloadRef,
  persistOcrArtifactRef,
  resolveGroupIdForOcr,
} from "./ocr-payload-ref";
import type { OCRResult } from "./types";

export async function resolveOcrResultInput(params: {
  ocrResult: OCRResult | OcrPayloadRef;
  documentId: string;
  groupId?: string | null;
}): Promise<{ ocrResult: OCRResult; groupId: string }> {
  const groupId = await resolveGroupIdForOcr(params.documentId, params.groupId);
  const ocrResult = isOcrPayloadRef(params.ocrResult)
    ? await loadOcrResultFromPort(params.ocrResult, groupId)
    : params.ocrResult;
  return { ocrResult, groupId };
}

export async function toOcrResultPort(
  ocrResult: OCRResult,
  documentId: string,
  groupId: string,
  fileName = "ocr-result.json",
): Promise<{ ocrResult: OcrPayloadRef }> {
  const ref = await persistOcrArtifactRef(
    groupId,
    documentId,
    fileName,
    ocrResult,
  );
  return { ocrResult: ref };
}

export async function finalizeCorrectionResult(
  result: Omit<CorrectionResult, "ocrResult"> & { ocrResult: OCRResult },
  documentId: string,
  groupId: string,
): Promise<CorrectionResult> {
  const { ocrResult: ref } = await toOcrResultPort(
    result.ocrResult,
    documentId,
    groupId,
  );
  return { ...result, ocrResult: ref };
}
