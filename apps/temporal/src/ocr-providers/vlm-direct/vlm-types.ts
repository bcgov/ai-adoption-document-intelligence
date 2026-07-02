/**
 * Type definitions for the VLM-direct extraction path (E04).
 *
 * The activity sends one image plus a structured-output JSON Schema to an
 * Azure OpenAI chat-completions deployment (vision-capable; gpt-5.4 by
 * default for E04). The response is forced into a fixed shape via OpenAI's
 * `response_format: { type: "json_schema", strict: true }` mode:
 *
 *   {
 *     "fields":        { "<field_key>": <value>, ... },
 *     "source_quotes": { "<field_key>": "<quote-from-document>", ... }
 *   }
 *
 * `source_quotes` is required for every field as a hallucination guard
 * (per the brief). Empty string indicates the model could not locate
 * supporting text on the form — the mapper synthesises low confidence on
 * such fields so the HITL gate fires.
 */

/** The structured object the model is forced to return. */
export interface VlmExtractionResponse {
  fields: Record<string, string | number | null>;
  source_quotes: Record<string, string>;
}

/**
 * Wrapper persisted in `benchmark_ocr_cache` and replayed in tests. We keep
 * the model's raw chat-completions response next to the parsed payload so
 * downstream tests can re-derive an OCRResult deterministically.
 */
export interface VlmDirectRawResponse {
  /** Deployment that produced this response (e.g. `gpt-5.4`). */
  deployment: string;
  /** API version used (e.g. `2024-12-01-preview`). */
  apiVersion: string;
  /** End-to-end wallclock in ms (network + inference). */
  durationMs: number;
  /** Token usage as reported by the chat-completions endpoint. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** Parsed structured output. */
  parsed: VlmExtractionResponse;
  /**
   * Raw chat-completions response body — kept as a `Record<string, unknown>`
   * to avoid pinning every Azure OpenAI shape; tests can read from
   * `parsed` instead.
   */
  raw: Record<string, unknown>;
}
