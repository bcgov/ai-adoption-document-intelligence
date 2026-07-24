import {
  buildFlatConfidenceMapFromCtx,
  buildFlatPredictionMapFromCtx,
} from "../azure-ocr-field-display-value";
import { type OcrPayloadRef, readOcrPayloadBlob } from "../ocr-payload-ref";
import type { OCRResult } from "../types";

export interface BenchmarkFlattenPredictionInput {
  cleanedResultRef?: OcrPayloadRef;
  ocrResultRef?: OcrPayloadRef;
}

export interface BenchmarkFlattenPredictionOutput {
  predictionData: Record<string, unknown>;
  confidenceData: Record<string, number | null>;
}

/**
 * Build flat benchmark prediction/confidence maps from OCR blob refs (not workflow ctx).
 */
export async function benchmarkFlattenPredictionFromRefs(
  input: BenchmarkFlattenPredictionInput,
): Promise<BenchmarkFlattenPredictionOutput> {
  const ref = input.cleanedResultRef ?? input.ocrResultRef;
  if (!ref) {
    return { predictionData: {}, confidenceData: {} };
  }

  const ocrResult = await readOcrPayloadBlob<OCRResult>(ref);
  const ctx = {
    cleanedResult: ocrResult,
    ocrResult,
  };

  return {
    predictionData: buildFlatPredictionMapFromCtx(ctx),
    confidenceData: buildFlatConfidenceMapFromCtx(ctx),
  };
}
