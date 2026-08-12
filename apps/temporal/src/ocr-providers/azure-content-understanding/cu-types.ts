/**
 * Type definitions for Azure Content Understanding analyze responses.
 * Anchored to the documented shape from
 * https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/quickstart/use-rest-api
 *
 * Real responses captured during E03 fixture-capture step are stored at
 * `apps/temporal/src/__fixtures__/experiment-03/cu-response-1-81.json`.
 * If CU's response shape diverges from the types here, update both the
 * types and the mapper before claiming the run is correct (per E02's
 * runbook: "engine response shape may not match the brief's preamble").
 */

export interface CuFieldValue {
  /**
   * Semantic type of the field value. CU vocabulary:
   * `string | date | time | number | integer | boolean | array | object | json`.
   */
  type?: string;
  valueString?: string;
  valueNumber?: number;
  valueInteger?: number;
  valueBoolean?: boolean;
  valueDate?: string;
  valueTime?: string;
  valueArray?: CuFieldValue[];
  valueObject?: Record<string, CuFieldValue>;
  valueJson?: unknown;
  /** Confidence on [0, 1] when `estimateFieldSourceAndConfidence: true`. */
  confidence?: number;
  /** Grounding citations; `offset` and `length` index into the markdown content. */
  spans?: Array<{ offset: number; length: number }>;
  /**
   * Source descriptor like `"D(1,774.0000,72.0000,…)"` — page index +
   * polygon coordinates. Captures grounding location even when spans is
   * empty. Format and stability not guaranteed across API versions.
   */
  source?: string;
}

export interface CuContentEntry {
  /** Per-input identifier, e.g. `input1`. */
  path?: string;
  /** Markdown rendering of the OCR layer's extracted content. */
  markdown?: string;
  /** Per-page width/height/unit info — present when returnDetails=true. */
  pages?: Array<{
    pageNumber?: number;
    width?: number;
    height?: number;
    unit?: string;
    spans?: Array<{ offset: number; length: number }>;
  }>;
  /** Layout paragraphs/lines/words when returnDetails=true. Optional. */
  paragraphs?: Array<{
    content?: string;
    spans?: Array<{ offset: number; length: number }>;
  }>;
  /** Map of structured field-name → value (top-level extraction result). */
  fields?: Record<string, CuFieldValue>;
}

export interface CuAnalyzeResult {
  analyzerId?: string;
  apiVersion?: string;
  createdAt?: string;
  contents?: CuContentEntry[];
  /** Server-side warnings; surface in logs. */
  warnings?: Array<{ code?: string; message?: string }>;
}

/** GET /analyzerResults/{request-id} response shape (long-running operation). */
export interface CuAnalyzeOperation {
  id?: string;
  status?: "Running" | "Succeeded" | "Failed" | string;
  result?: CuAnalyzeResult;
  error?: { code?: string; message?: string };
}
