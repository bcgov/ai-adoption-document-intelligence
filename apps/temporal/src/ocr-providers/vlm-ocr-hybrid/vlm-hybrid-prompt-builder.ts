/**
 * Build the messages + JSON Schema for an Azure OpenAI chat-completions
 * **VLM + OCR hybrid** extraction call (E05).
 *
 * Differs from the VLM-direct prompt builder (E04) only in that:
 *   - The user message is shaped as `[ocr_text, image]` with explicit
 *     delimiters and an instruction telling the model to **prefer the
 *     image over the OCR markdown when they conflict**. This is the
 *     trust hierarchy: image is ground truth; OCR markdown is auxiliary
 *     spatial / textual context to help the vision encoder.
 *   - The system message inherits E04's directive plus a hybrid-specific
 *     paragraph describing the OCR pre-pass and the expected
 *     disagreement-resolution rule.
 *
 * The strict JSON Schema (`{ fields, source_quotes }`) is **identical**
 * to E04 — we reuse `buildVlmExtractionRequest` from the vlm-direct
 * prompt builder for the response_format and override only the
 * messages.
 */

import {
  type BuildVlmRequestOptions,
  buildVlmExtractionRequest,
  type VlmExtractionRequest,
} from "../vlm-direct/vlm-prompt-builder";

const HYBRID_SYSTEM_PREAMBLE = `You are a document-extraction assistant. You will be given:
  1. An OCR text rendering of a form (Markdown extracted by Azure Document Intelligence).
  2. An image of the same form.

Use both inputs together. The OCR text is auxiliary context — it helps you locate fields and read structure. **The image is the source of truth.** When the OCR text and the image disagree on a value (digits, characters, checkboxes, signatures), trust what you see in the image and ignore the OCR text. Examples of common OCR errors to override: digit confusion (4 ↔ 9, 8 ↔ 3), missed punctuation, misread checkboxes, dropped/added zeros.

Read the image carefully and emit JSON conforming to the supplied schema. Be conservative: do not guess values that are not visibly present on the form.`;

const HYBRID_USER_DIRECTIVE = `Here is the OCR text for the form (Markdown):

<ocr_text>
{{OCR_TEXT}}
</ocr_text>

Now look at the form image (attached below) and extract the form's structured fields. For every field also emit a short verbatim source_quote (the exact text or label you used as evidence — taken from the image, even if the OCR text differs). If you cannot locate a field on the form, return the schema-appropriate empty value (null for numbers, "" for strings) and an empty source_quote. **When the image and the OCR text disagree, prefer the image.**`;

export interface HybridBuildOptions extends BuildVlmRequestOptions {
  /** OCR markdown text rendered from the prebuilt-layout response. */
  ocrMarkdown: string;
  /**
   * Optional override for the JSON schema name (defaults to
   * `sdpr_vlm_hybrid_extraction`).
   */
  schemaName?: string;
}

const DEFAULT_HYBRID_SCHEMA_NAME = "sdpr_vlm_hybrid_extraction";

/**
 * Build the chat-completions request shape for a VLM + OCR hybrid call.
 * Returns null when no fields are defined.
 *
 * The returned `userPrompt` already contains the OCR markdown inlined
 * inside `<ocr_text>` delimiters; the activity passes it as a single
 * text content part followed by the image_url part.
 */
export function buildVlmHybridExtractionRequest(
  options: HybridBuildOptions,
): VlmExtractionRequest | null {
  const base = buildVlmExtractionRequest({
    ...options,
    schemaName: options.schemaName ?? DEFAULT_HYBRID_SCHEMA_NAME,
  });
  if (!base) return null;

  const ocrMarkdown = options.ocrMarkdown ?? "";
  const trimmed = ocrMarkdown.trim();
  // E04's preamble applied verbatim was generic ("read the form image
  // carefully"); E05 needs an additional paragraph that names the OCR
  // pre-pass and the trust hierarchy. We *prepend* the hybrid preamble
  // and *append* the user-supplied global instruction after, so the
  // SDPR-specific rules (column conventions, blank-vs-zero, comma
  // thousands) survive verbatim from E04's iteration kit.
  const userInstruction = options.documentAnnotationPrompt?.trim();
  const systemPrompt = userInstruction
    ? `${HYBRID_SYSTEM_PREAMBLE}\n\n${userInstruction}`
    : HYBRID_SYSTEM_PREAMBLE;

  // The base builder returned a userPrompt without the OCR markdown.
  // For the hybrid path we replace it with the inlined-markdown
  // directive.
  const userPromptWithOcr = HYBRID_USER_DIRECTIVE.replace(
    "{{OCR_TEXT}}",
    trimmed.length > 0 ? trimmed : "(OCR text was empty)",
  );

  return {
    systemPrompt,
    userPrompt: userPromptWithOcr,
    responseFormat: base.responseFormat,
    fieldKeys: base.fieldKeys,
  };
}

export const __testInternals = {
  HYBRID_SYSTEM_PREAMBLE,
  HYBRID_USER_DIRECTIVE,
};
