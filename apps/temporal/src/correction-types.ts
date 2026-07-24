/**
 * Shared types for OCR correction tools.
 *
 * Correction tools operate on the full OCRResult shape and return a corrected
 * copy plus change metadata. This module defines the common contract.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-02-ocr-correction-tools-and-nodes.md
 */

import type { OcrPayloadRef } from "./ocr-payload-ref";
import type { EnrichmentChange, OCRResult } from "./types";

/**
 * Result returned by every correction tool activity.
 */
export interface CorrectionResult {
  /** Fully corrected OCR result ref (blob-backed). */
  ocrResult: OcrPayloadRef;

  /** Granular list of changes applied (reuses EnrichmentChange for audit compatibility). */
  changes: EnrichmentChange[];

  /** Tool-specific metadata (e.g. number of words checked, confusion map id). */
  metadata?: Record<string, unknown>;
}

/**
 * Common parameters accepted by correction tool activities.
 */
export interface CorrectionToolParams {
  documentId: string;
  groupId?: string | null;
  /** OCR result ref or legacy inline (activities load from blob). */
  ocrResult: OCRResult | OcrPayloadRef;

  /** Optional restriction to specific field keys. When empty/undefined, all fields are processed. */
  fieldScope?: string[];
}

/**
 * Deep-copy an OCRResult so corrections don't mutate the original.
 */
export function deepCopyOcrResult(ocrResult: OCRResult): OCRResult {
  return JSON.parse(JSON.stringify(ocrResult));
}
