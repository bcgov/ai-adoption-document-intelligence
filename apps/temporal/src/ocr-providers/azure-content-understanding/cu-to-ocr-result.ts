/**
 * Map an Azure Content Understanding analyze response to the canonical
 * `OCRResult` shape used by downstream activities.
 *
 * CU returns:
 *   - `result.contents[i].markdown` — OCR + layout markdown (one entry per
 *     input file; we send one input per call).
 *   - `result.contents[i].pages[]` — page dimensions when
 *     `config.returnDetails: true`.
 *   - `result.contents[i].fields` — structured field map. Each value
 *     carries `type`, `valueString` / `valueNumber` / `valueDate`, an
 *     optional `confidence` on [0, 1], and grounding spans / source
 *     descriptors.
 *
 * The mapper:
 *   - Synthesizes `Page[]` from `contents[0].pages` (or a 1-page fallback
 *     when missing).
 *   - Builds `extractedText` from `contents[*].markdown`.
 *   - Synthesizes one `Word` per page from the page's slice of the
 *     markdown so downstream activities (`ocr.cleanup`, confidence checks)
 *     have something to read. CU does not return per-word polygons; words
 *     are shaped like the Mistral fallback (empty polygon + page-level
 *     confidence).
 *   - Builds typed `documents[0].fields` (Azure-shape) and the parallel
 *     `keyValuePairs` array from `contents[0].fields`, gated on the
 *     supplied `fieldDefs` (same ordering convention as Mistral).
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
import type { CuAnalyzeResult, CuContentEntry, CuFieldValue } from "./cu-types";

export interface CuFieldDefRow {
  field_key: string;
  field_type: string;
  field_format?: string | null;
}

export interface CuToOcrResultContext {
  fileName: string;
  fileType: string;
  requestId: string;
  modelId: string;
}

export interface CuToOcrResultOptions {
  fieldDefs?: CuFieldDefRow[];
}

const SELECTED_CHECKBOX_VALUES = new Set([
  "selected",
  "checked",
  "yes",
  "true",
  "1",
  "on",
]);

const UNSELECTED_CHECKBOX_VALUES = new Set([
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
    if (SELECTED_CHECKBOX_VALUES.has(s)) return "selected";
    if (UNSELECTED_CHECKBOX_VALUES.has(s)) return "unselected";
    return "unselected";
  }
  return "unselected";
}

/**
 * CU returns the actual value either as a typed field (valueString,
 * valueNumber, valueDate) or — under some API versions — only as a
 * primitive in a `value` slot. This helper picks whichever is present.
 */
function rawValueFromCuField(field: CuFieldValue | undefined): unknown {
  if (!field) return undefined;
  if (field.valueString !== undefined) return field.valueString;
  if (field.valueNumber !== undefined) return field.valueNumber;
  if (field.valueInteger !== undefined) return field.valueInteger;
  if (field.valueBoolean !== undefined) return field.valueBoolean;
  if (field.valueDate !== undefined) return field.valueDate;
  if (field.valueTime !== undefined) return field.valueTime;
  if (field.valueJson !== undefined) return field.valueJson;
  // Some CU rollouts return `value` instead. Best-effort fallback only.
  if ("value" in field) return (field as unknown as { value: unknown }).value;
  return undefined;
}

function rawValueToAzureDocumentFieldValue(
  raw: unknown,
  fieldType: string,
  cuConfidence: number | undefined,
): AzureDocumentFieldValue {
  const confidence =
    typeof cuConfidence === "number" && Number.isFinite(cuConfidence)
      ? cuConfidence
      : 1;

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
        // Only emit valueDate when non-empty. An empty-string valueDate reads
        // as a populated value downstream (extractAzureFieldDisplayValue
        // prefers valueDate over content), so a blank date would look filled
        // in — mirror the numeric blank handling which omits valueNumber.
        ...(s.trim() !== "" ? { valueDate: s } : {}),
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
    key: {
      content: fieldKey,
      boundingRegions: [],
      spans: [],
    },
    value: {
      content: display,
      boundingRegions: [],
      spans: [],
    },
    confidence: typeof field.confidence === "number" ? field.confidence : 1,
  };
}

function pickPrimaryContent(result: CuAnalyzeResult): CuContentEntry | null {
  return result.contents?.[0] ?? null;
}

function pageWordsFromMarkdown(markdown: string, confidence: number): Word[] {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) return [];
  return [
    {
      content: trimmed,
      polygon: [],
      confidence,
      span: { offset: 0, length: trimmed.length },
    },
  ];
}

function pageLinesFromMarkdown(markdown: string): Line[] {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) return [];
  return [
    {
      content: trimmed,
      polygon: [],
      spans: [{ offset: 0, length: trimmed.length }],
    },
  ];
}

function paragraphsFromMarkdown(markdown: string): Paragraph[] {
  const trimmed = markdown.trim();
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
 * Compute a global page-level confidence as the mean of per-field
 * confidences from CU's structured response. Falls back to 0.95 when no
 * confidences are present (matches Mistral's documented fallback so the
 * default 0.95 threshold in `ocr.checkConfidence` behaves consistently).
 */
function meanFieldConfidence(
  fields: Record<string, CuFieldValue> | undefined,
): number {
  if (!fields) return 0.95;
  const values = Object.values(fields)
    .map((f) => f.confidence)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return 0.95;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return mean;
}

/** Convert CU `result.contents[0]` to canonical pages + extracted text. */
function buildPages(
  primary: CuContentEntry | null,
  meanConfidence: number,
): { pages: Page[]; extractedText: string; paragraphs: Paragraph[] } {
  if (!primary) {
    return { pages: [], extractedText: "", paragraphs: [] };
  }
  const markdown = (primary.markdown ?? "").trim();
  const declaredPages = primary.pages ?? [];

  if (declaredPages.length > 0) {
    const pages: Page[] = declaredPages.map((p, idx) => {
      const pageNumber =
        typeof p.pageNumber === "number" ? p.pageNumber : idx + 1;
      const width = p.width ?? 612;
      const height = p.height ?? 792;
      const unit = (p.unit ?? "pixel") as Page["unit"];
      // CU exposes the markdown as one global blob; per-page slice via the
      // pages[i].spans offsets when present.
      let pageMarkdown = markdown;
      if (p.spans && p.spans.length > 0 && markdown.length > 0) {
        const slice = p.spans
          .map((s) => markdown.slice(s.offset, s.offset + s.length))
          .join("\n")
          .trim();
        if (slice.length > 0) pageMarkdown = slice;
      }
      return {
        pageNumber,
        width,
        height,
        unit,
        words: pageWordsFromMarkdown(pageMarkdown, meanConfidence),
        lines: pageLinesFromMarkdown(pageMarkdown),
        spans: [],
      };
    });
    return {
      pages,
      extractedText: markdown,
      paragraphs: paragraphsFromMarkdown(markdown),
    };
  }

  // No per-page metadata — synthesize a single page from the markdown.
  const fallbackPage: Page = {
    pageNumber: 1,
    width: 612,
    height: 792,
    unit: "pixel",
    words: pageWordsFromMarkdown(markdown, meanConfidence),
    lines: pageLinesFromMarkdown(markdown),
    spans: [],
  };
  return {
    pages: markdown.length > 0 ? [fallbackPage] : [],
    extractedText: markdown,
    paragraphs: paragraphsFromMarkdown(markdown),
  };
}

function fieldsToDocumentsAndKeyValuePairs(
  cuFields: Record<string, CuFieldValue> | undefined,
  fieldDefs: CuFieldDefRow[],
): {
  documents: AzureDocument[] | undefined;
  keyValuePairs: KeyValuePair[];
} {
  if (!fieldDefs.length || !cuFields) {
    // No template schema; build pairs from whatever CU returned, treating
    // each value as a string. (Same semantics as the Mistral fallback.)
    if (!cuFields) return { documents: undefined, keyValuePairs: [] };
    const keyValuePairs: KeyValuePair[] = Object.entries(cuFields).map(
      ([k, v]) => {
        const value = String(rawValueFromCuField(v) ?? "");
        return {
          key: { content: k, boundingRegions: [], spans: [] },
          value: { content: value, boundingRegions: [], spans: [] },
          confidence: typeof v.confidence === "number" ? v.confidence : 1,
        };
      },
    );
    return { documents: undefined, keyValuePairs };
  }

  const fields: Record<string, AzureDocumentFieldValue> = {};
  for (const def of fieldDefs) {
    const key = def.field_key.trim();
    if (!key) continue;
    const cuField = cuFields[key];
    const raw = rawValueFromCuField(cuField);
    fields[key] = rawValueToAzureDocumentFieldValue(
      raw,
      def.field_type,
      cuField?.confidence,
    );
  }
  const keyValuePairs = Object.entries(fields).map(([k, v]) =>
    azureFieldToKeyValuePair(k, v),
  );
  const documents: AzureDocument[] = [
    {
      docType: "azure-content-understanding",
      fields,
      confidence: 1,
    },
  ];
  return { documents, keyValuePairs };
}

/**
 * Map a CU analyze response to a canonical `OCRResult`.
 */
export function cuAnalyzeResultToOcrResult(
  result: CuAnalyzeResult,
  ctx: CuToOcrResultContext,
  options?: CuToOcrResultOptions,
): OCRResult {
  const primary = pickPrimaryContent(result);
  const cuFields = primary?.fields;
  const meanConfidence = meanFieldConfidence(cuFields);
  const { pages, extractedText, paragraphs } = buildPages(
    primary,
    meanConfidence,
  );
  const fieldDefs = options?.fieldDefs ?? [];
  const { documents, keyValuePairs } = fieldsToDocumentsAndKeyValuePairs(
    cuFields,
    fieldDefs,
  );

  return {
    success: true,
    status: "succeeded",
    apimRequestId: ctx.requestId,
    fileName: ctx.fileName,
    fileType: ctx.fileType as OCRResult["fileType"],
    modelId: ctx.modelId || result.analyzerId || "",
    extractedText,
    pages,
    tables: [],
    paragraphs,
    keyValuePairs,
    ...(documents ? { documents } : {}),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}
