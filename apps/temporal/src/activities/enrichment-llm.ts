/**
 * Azure OpenAI integration for LLM-based OCR enrichment.
 * Builds prompts and parses structured responses (corrected values + summary of changes).
 */
import axios from "axios";
import type { EnrichmentChange } from "../types";

const DEFAULT_API_VERSION = "2024-12-01-preview";

/**
 * Strip all backslash characters from a string. Used for message content sent to
 * the Azure OpenAI API so that JSON serialization cannot produce any escape sequence
 * that strict parsers (jiter / Pydantic v2) reject as "Invalid escape".
 */
export function stripBackslashes(s: string): string {
  return s.replace(/\\/g, "");
}

/**
 * Replace newlines and other control chars that become \n, \r, \t in JSON.
 * The Azure API parser rejects these escape sequences at certain positions;
 * replacing with space avoids them in the serialized body.
 */
function stripNewlinesAndControl(s: string): string {
  return s
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/\f/g, " ")
    .replace(/\b/g, " ");
}

/**
 * Redact common PII-like patterns in text to avoid triggering Azure's PII
 * redaction service (which can return 503 when unavailable). Applied only to
 * the extracted-text context we send; field values are left as-is so the model
 * can still return corrections.
 */
export function redactPiiInText(s: string): string {
  return s
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{3}\b/g, "[SIN]")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
    .replace(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
    .replace(/\$\s*[\d,]+\.?\d*/g, "[AMOUNT]");
}

export interface LowConfidenceField {
  fieldKey: string;
  value: string;
  expectedType: string;
  confidence: number;
}

export interface LlmEnrichmentRequest {
  extractedText: string;
  fields: LowConfidenceField[];
}

export interface LlmEnrichmentResponse {
  correctedValues: Record<string, string>;
  summary: string;
  changes: Array<{
    fieldKey: string;
    originalValue: string;
    correctedValue: string;
    reason: string;
  }>;
}

/**
 * Build the system message for the enrichment LLM.
 */
export function buildEnrichmentSystemMessage(): string {
  return `You are an expert at correcting and improving document data extracted by OCR (optical character recognition).
Your task is to fix obvious OCR errors, normalize formats, and fill in or correct values when the original extraction has low confidence.
You must respond with valid JSON only. Do not include markdown code fences or any text outside the JSON.`;
}

/**
 * Build the user message containing document context and fields to improve.
 * Backslashes are stripped from extractedText and field keys/values only so that
 * the embedded fieldsJson (from JSON.stringify) keeps valid \" escapes and the
 * outer payload serialization cannot produce invalid escape sequences.
 */
export function buildEnrichmentUserMessage(
  request: LlmEnrichmentRequest,
): string {
  const safeExtractedText = stripBackslashes(request.extractedText);
  const fieldsJson = JSON.stringify(
    request.fields.map((f) => ({
      fieldKey: stripBackslashes(f.fieldKey),
      currentValue: stripBackslashes(f.value),
      expectedType: stripBackslashes(f.expectedType),
      confidence: f.confidence,
    })),
    null,
    2,
  );
  return `Below is the full text extracted from the document (for context), followed by a list of fields that need improvement.

## Extracted document text
${safeExtractedText}

## Fields to correct or improve
These fields have low OCR confidence. For each field, provide a corrected or improved value. If the current value is already correct, you may return it unchanged. Explain briefly what you changed and why.

${fieldsJson}

Respond with a single JSON object with this exact structure (no other text):
{
  "correctedValues": { "<fieldKey>": "<corrected value>", ... },
  "summary": "A short human-readable summary of the changes you made (e.g. 'Corrected date format for Date field; fixed digit confusion in Amount.')",
  "changes": [
    { "fieldKey": "<key>", "originalValue": "<before>", "correctedValue": "<after>", "reason": "<why>" }
  ]
}`;
}

/**
 * Parse the LLM response content into LlmEnrichmentResponse.
 * Handles optional markdown code fences and trims whitespace.
 */
export function parseEnrichmentResponse(
  content: string,
): LlmEnrichmentResponse {
  let raw = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = raw.match(fence);
  if (match) raw = match[1].trim();
  const parsed = JSON.parse(raw) as {
    correctedValues?: Record<string, string>;
    summary?: string;
    changes?: Array<{
      fieldKey: string;
      originalValue: string;
      correctedValue: string;
      reason: string;
    }>;
  };
  return {
    correctedValues: parsed.correctedValues ?? {},
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    changes: Array.isArray(parsed.changes)
      ? parsed.changes.map((c) => ({
          fieldKey: String(c.fieldKey ?? ""),
          originalValue: String(c.originalValue ?? ""),
          correctedValue: String(c.correctedValue ?? ""),
          reason: String(c.reason ?? ""),
        }))
      : [],
  };
}

/**
 * Call Azure OpenAI chat completions API and return parsed enrichment response.
 */
export async function callAzureOpenAI(
  request: LlmEnrichmentRequest,
  deployment: string,
  options: {
    endpoint: string;
    apiKey: string;
    apiVersion?: string;
    /** When true, redact PII in extracted text to avoid triggering Azure PII redaction (503) */
    redactPii?: boolean;
  },
): Promise<LlmEnrichmentResponse> {
  const {
    endpoint,
    apiKey,
    apiVersion = DEFAULT_API_VERSION,
    redactPii = false,
  } = options;
  const base = endpoint.replace(/\/$/, "");
  const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;

  const requestToUse = redactPii
    ? { ...request, extractedText: redactPiiInText(request.extractedText) }
    : request;

  const systemMessage = buildEnrichmentSystemMessage();
  const userMessage = buildEnrichmentUserMessage(requestToUse);

  // Avoid \n, \r, \t etc. in the body — the API parser rejects them at position 3239
  const safeSystemMessage = stripNewlinesAndControl(systemMessage);
  const safeUserMessage = stripNewlinesAndControl(userMessage);

  const payload = {
    messages: [
      { role: "system" as const, content: safeSystemMessage },
      { role: "user" as const, content: safeUserMessage },
    ],
    response_format: { type: "json_object" as const },
    max_completion_tokens: 4096,
  };

  const bodyString = JSON.stringify(payload);

  let response: {
    data: { choices?: Array<{ message?: { content?: string } }> };
  };
  try {
    // Send the pre-serialized JSON string (not the object) so we control exactly what is sent
    response = await axios.post(url, bodyString, {
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      timeout: 60000,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const detail =
        typeof body === "object" ? JSON.stringify(body) : String(body ?? "");
      throw new Error(
        `Request failed with status code ${status}. Response: ${detail}`,
      );
    }
    throw err;
  }

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Azure OpenAI response missing choices[0].message.content");
  }
  return parseEnrichmentResponse(content);
}

/**
 * Convert LLM response changes to EnrichmentChange[] with source 'llm'.
 */
export function llmChangesToEnrichmentChanges(
  changes: LlmEnrichmentResponse["changes"],
): EnrichmentChange[] {
  return changes.map((c) => ({
    fieldKey: c.fieldKey,
    originalValue: c.originalValue,
    correctedValue: c.correctedValue,
    reason: c.reason,
    source: "llm" as const,
  }));
}
