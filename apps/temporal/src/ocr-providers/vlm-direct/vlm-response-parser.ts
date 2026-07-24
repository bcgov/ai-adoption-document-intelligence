import type { VlmExtractionResponse } from "./vlm-types";

/**
 * Parse a VLM structured-extraction response into a `VlmExtractionResponse`.
 *
 * Strict-mode `response_format` normally returns a clean JSON object, but the
 * parser tolerates the optional code-fence form too. Importantly it extracts
 * the **first** fenced block anywhere in the text (no end-of-string anchor),
 * so a trailing note after the closing ``` — e.g. ```` ```json\n{…}\n```\n\nDone. ````
 * — does not get fed verbatim (backticks and all) to `JSON.parse` and crash.
 *
 * Shared by both the VLM-direct (E04) and VLM+OCR-hybrid (E05) engines.
 */
export function parseVlmStructuredJson(content: string): VlmExtractionResponse {
  let raw = content.trim();
  const fence = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
  const match = raw.match(fence);
  if (match) raw = match[1].trim();
  const parsed = JSON.parse(raw) as Partial<VlmExtractionResponse>;
  if (!parsed.fields || typeof parsed.fields !== "object") {
    throw new Error(
      "VLM response missing `fields` object — strict mode appears not to be active.",
    );
  }
  if (!parsed.source_quotes || typeof parsed.source_quotes !== "object") {
    throw new Error(
      "VLM response missing `source_quotes` object — strict mode appears not to be active.",
    );
  }
  return {
    fields: parsed.fields as Record<string, string | number | null>,
    source_quotes: parsed.source_quotes as Record<string, string>,
  };
}
