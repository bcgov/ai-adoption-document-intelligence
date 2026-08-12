/**
 * Map a VLM-direct extraction response to the canonical `OCRResult` shape
 * used by downstream activities (`ocr.cleanup`, `ocr.checkConfidence`,
 * `ocr.storeResults`).
 *
 * Unlike OCR/CU paths, the VLM call returns:
 *   - structured fields (`{ fields, source_quotes }`),
 *   - no per-word polygons,
 *   - no markdown/text layer.
 *
 * The mapper:
 *   - Synthesises a one-page summary from the structured fields so
 *     `extractedText` is non-empty (downstream cleanup expects something).
 *   - Builds `documents[0].fields` (Azure-shape) + parallel
 *     `keyValuePairs` from the structured response, gated on the supplied
 *     `fieldDefs` (deterministic ordering, mirrors the CU mapper).
 *   - Synthesises per-field confidence from `source_quotes` presence:
 *     non-empty quote → 0.95; a *populated* value with no quote → 0.50;
 *     a genuinely-blank value with no quote stays at 0.95 (a correct empty
 *     extraction, not a low-confidence one). Page-level confidence is the
 *     mean of per-field confidences, so the default 0.95 threshold in
 *     `ocr.checkConfidence` fires when a populated value lacks evidence.
 */

import { extractAzureFieldDisplayValue } from "../../azure-ocr-field-display-value";
import type {
  AzureDocument,
  AzureDocumentFieldValue,
  KeyValuePair,
  Line,
  OCRResult,
  Page,
  Paragraph,
  Word,
} from "../../types";
import type { VlmExtractionResponse } from "./vlm-types";

/**
 * Confidence we assign when the VLM produced a non-empty source_quote for
 * a field. The 0.95 default in `ocr.checkConfidence` is the gate; this
 * keeps with-evidence fields above the line.
 */
const CONF_WITH_EVIDENCE = 0.95;

/**
 * Confidence we assign when the model produced a value but no source_quote
 * to back it. Placed deliberately under the gate so the HITL switch fires.
 * Only applies to populated values — a genuinely-blank field gets
 * CONF_WITH_EVIDENCE (see `evidenceConfidence`). Logged in SUMMARY.md as a
 * synthesised value (VLMs don't return per-field confidence natively).
 */
const CONF_NO_EVIDENCE = 0.5;

export interface VlmFieldDefRow {
  field_key: string;
  field_type: string;
  field_format?: string | null;
}

export interface VlmToOcrResultContext {
  fileName: string;
  fileType: string;
  requestId: string;
  modelId: string;
}

export interface VlmToOcrResultOptions {
  fieldDefs?: VlmFieldDefRow[];
}

const SELECTED_VALUES = new Set([
  "selected",
  "checked",
  "yes",
  "true",
  "1",
  "on",
]);
const UNSELECTED_VALUES = new Set([
  "unselected",
  "unchecked",
  "no",
  "false",
  "0",
  "off",
  "",
]);

function normalizeSelectionMark(raw: unknown): "selected" | "unselected" {
  if (raw === true) return "selected";
  if (raw === false) return "unselected";
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (SELECTED_VALUES.has(s)) return "selected";
    if (UNSELECTED_VALUES.has(s)) return "unselected";
  }
  return "unselected";
}

function rawToAzureFieldValue(
  raw: unknown,
  fieldType: string,
  confidence: number,
): AzureDocumentFieldValue {
  switch (fieldType) {
    case "number": {
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return {
          type: "number",
          content: String(raw),
          valueString: String(raw),
          valueNumber: raw,
          confidence,
        };
      }
      const s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
      const normalized = s.replace(/,/g, "").trim();
      const n = parseFloat(normalized);
      if (!Number.isNaN(n) && normalized !== "") {
        return {
          type: "number",
          content: s,
          valueString: String(n),
          valueNumber: n,
          confidence,
        };
      }
      return {
        type: "number",
        content: s,
        valueString: s,
        confidence,
      };
    }
    case "selectionMark": {
      const sel = normalizeSelectionMark(raw);
      return {
        type: "selectionMark",
        content: sel,
        valueString: sel,
        valueSelectionMark: sel,
        confidence,
      };
    }
    case "date": {
      const s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
      return {
        type: "date",
        content: s,
        valueString: s,
        valueDate: s,
        confidence,
      };
    }
    case "signature": {
      const s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
      return {
        type: "signature",
        content: s,
        valueString: s,
        confidence,
      };
    }
    default: {
      const s =
        typeof raw === "string"
          ? raw
          : raw == null
            ? ""
            : typeof raw === "number" || typeof raw === "boolean"
              ? String(raw)
              : JSON.stringify(raw);
      return {
        type: "string",
        content: s,
        valueString: s,
        confidence,
      };
    }
  }
}

function azureFieldToKeyValuePair(
  fieldKey: string,
  field: AzureDocumentFieldValue,
): KeyValuePair {
  const display = String(
    extractAzureFieldDisplayValue(field as Record<string, unknown>) ?? "",
  );
  return {
    key: { content: fieldKey, boundingRegions: [], spans: [] },
    value: { content: display, boundingRegions: [], spans: [] },
    confidence: typeof field.confidence === "number" ? field.confidence : 1,
  };
}

/**
 * A field the model returned as empty (null/undefined or blank string) is
 * "no value" — extracting nothing where the form is blank is a correct
 * outcome, not a low-confidence one.
 */
function isBlankRawValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string") return raw.trim().length === 0;
  return false;
}

/**
 * Synthesised per-field confidence. A non-empty `source_quote` is evidence →
 * high confidence. With no quote, only a *populated* value is suspicious
 * (the model produced a value it can't point to); a genuinely-blank field
 * (no value, no quote) is a correct extraction and must stay above the gate,
 * otherwise every legitimately-empty cell would falsely trip HITL review.
 */
function evidenceConfidence(
  quote: string | undefined,
  rawValue: unknown,
): number {
  if (typeof quote === "string" && quote.trim().length > 0) {
    return CONF_WITH_EVIDENCE;
  }
  return isBlankRawValue(rawValue) ? CONF_WITH_EVIDENCE : CONF_NO_EVIDENCE;
}

function extractedTextFromFields(
  fields: Record<string, unknown>,
  sourceQuotes: Record<string, string>,
): string {
  const keys = Object.keys(fields);
  if (keys.length === 0) return "";
  const lines: string[] = ["VLM-direct extraction summary"];
  for (const k of keys) {
    const v = fields[k];
    const value =
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    const quote = sourceQuotes[k]?.trim() ?? "";
    lines.push(`- ${k}: ${value}${quote ? `  (evidence: ${quote})` : ""}`);
  }
  return lines.join("\n");
}

function pageWords(text: string, confidence: number): Word[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {
      content: trimmed,
      polygon: [],
      confidence,
      span: { offset: 0, length: trimmed.length },
    },
  ];
}

function pageLines(text: string): Line[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {
      content: trimmed,
      polygon: [],
      spans: [{ offset: 0, length: trimmed.length }],
    },
  ];
}

function paragraphs(text: string): Paragraph[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {
      content: trimmed,
      boundingRegions: [],
      spans: [{ offset: 0, length: trimmed.length }],
    },
  ];
}

/**
 * Map a VLM `{ fields, source_quotes }` payload to a canonical OCRResult.
 * The mapper requires `fieldDefs` (the ordered template schema) — without
 * it, we cannot disambiguate field types, so the fields land as strings.
 * Pass an empty array (or omit) to fall back to that string-only path.
 */
export function vlmExtractionToOcrResult(
  payload: VlmExtractionResponse,
  ctx: VlmToOcrResultContext,
  options?: VlmToOcrResultOptions,
): OCRResult {
  const fieldDefs = options?.fieldDefs ?? [];
  const sourceQuotes = payload.source_quotes ?? {};
  const fieldRaw = payload.fields ?? {};

  let documents: AzureDocument[] | undefined;
  const keyValuePairs: KeyValuePair[] = [];
  const perFieldConfidences: number[] = [];

  if (fieldDefs.length > 0) {
    const azureFields: Record<string, AzureDocumentFieldValue> = {};
    for (const def of fieldDefs) {
      const key = def.field_key.trim();
      if (!key) continue;
      const conf = evidenceConfidence(sourceQuotes[key], fieldRaw[key]);
      perFieldConfidences.push(conf);
      const value = rawToAzureFieldValue(fieldRaw[key], def.field_type, conf);
      azureFields[key] = value;
      keyValuePairs.push(azureFieldToKeyValuePair(key, value));
    }
    documents = [
      {
        docType: "vlm-direct",
        fields: azureFields,
        confidence: 1,
      },
    ];
  } else {
    for (const [k, v] of Object.entries(fieldRaw)) {
      const conf = evidenceConfidence(sourceQuotes[k], v);
      perFieldConfidences.push(conf);
      const value = String(v ?? "");
      keyValuePairs.push({
        key: { content: k, boundingRegions: [], spans: [] },
        value: { content: value, boundingRegions: [], spans: [] },
        confidence: conf,
      });
    }
  }

  const meanConfidence =
    perFieldConfidences.length > 0
      ? perFieldConfidences.reduce((a, b) => a + b, 0) /
        perFieldConfidences.length
      : CONF_WITH_EVIDENCE;

  const extractedText = extractedTextFromFields(fieldRaw, sourceQuotes);
  const page: Page = {
    pageNumber: 1,
    width: 612,
    height: 792,
    unit: "pixel",
    words: pageWords(extractedText, meanConfidence),
    lines: pageLines(extractedText),
    spans: [],
  };

  return {
    success: true,
    status: "succeeded",
    apimRequestId: ctx.requestId,
    fileName: ctx.fileName,
    fileType: ctx.fileType as OCRResult["fileType"],
    modelId: ctx.modelId,
    extractedText,
    pages: extractedText.length > 0 ? [page] : [],
    tables: [],
    paragraphs: paragraphs(extractedText),
    keyValuePairs,
    ...(documents ? { documents } : {}),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}

export const __testInternals = {
  CONF_WITH_EVIDENCE,
  CONF_NO_EVIDENCE,
  evidenceConfidence,
};
