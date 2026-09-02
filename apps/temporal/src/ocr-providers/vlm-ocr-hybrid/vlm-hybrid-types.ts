/**
 * Type definitions for the VLM + OCR hybrid extraction path (E05).
 *
 * The hybrid activity:
 *   1. Receives a raw `prebuilt-layout` response (markdown content +
 *      per-line/per-word polygons) from the upstream
 *      `azureOcr.submit` → `azureOcr.poll` (outputFormat=markdown) steps,
 *      as a lightweight `OcrPayloadRef` resolved inside the activity.
 *   2. Renders the markdown into a per-page string suitable for the VLM
 *      prompt (with optional inline bbox annotations).
 *   3. Sends the document image AND the OCR markdown to an Azure OpenAI
 *      vision-capable chat-completions deployment with a strict JSON
 *      Schema response_format.
 *   4. Maps the response to a canonical `OCRResult`, reusing the upstream
 *      bbox info so word/line polygons survive into the OCRResult (which
 *      pure VLM-direct in E04 lacked).
 *
 * The structured output payload mirrors E04's shape verbatim
 * (`{ fields, source_quotes }`); the source_quotes is still populated as
 * a hallucination guard, although in the hybrid path the model is
 * additionally instructed to use the image as ground truth when it
 * disagrees with the OCR markdown.
 */

import type { VlmExtractionResponse } from "../vlm-direct/vlm-types";

/**
 * Wrapper persisted in `benchmark_ocr_cache` and replayed in tests. We
 * keep both legs of the hybrid response (the layout markdown payload
 * from prebuilt-layout AND the raw chat-completions response) so tests
 * can re-derive an OCRResult deterministically without touching the
 * network.
 */
export interface VlmHybridRawResponse {
  /** Deployment that produced the VLM response (e.g. `gpt-5.4`). */
  deployment: string;
  /** API version used for the VLM call (e.g. `2024-12-01-preview`). */
  apiVersion: string;
  /** End-to-end wallclock in ms (DI read + VLM call). */
  durationMs: number;
  /** Wallclock for the DI read leg only. */
  ocrDurationMs: number;
  /** Wallclock for the VLM call leg only. */
  vlmDurationMs: number;
  /** Token usage as reported by the chat-completions endpoint. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** Parsed structured output (same shape as E04). */
  parsed: VlmExtractionResponse;
  /**
   * Raw chat-completions response body — kept as a `Record<string, unknown>`
   * so we don't pin the Azure OpenAI shape; tests should read from
   * `parsed` instead.
   */
  raw: Record<string, unknown>;
  /**
   * The DI prebuilt-layout response we fed to the VLM call. Kept for
   * fixture replay + tests that exercise the OCR-to-markdown pipeline.
   */
  layoutResponse: import("../../types").OCRResponse;
  /**
   * Markdown rendering we sent to the VLM (post bbox annotation, if
   * `includeBboxAnnotations` was on). Captured for diagnostics.
   */
  ocrMarkdown: string;
}
