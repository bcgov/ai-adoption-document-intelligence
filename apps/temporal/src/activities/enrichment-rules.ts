/**
 * Generic enrichment rules for OCR results.
 * Applies type-aware rules (trimWhitespace, fixCharacterConfusion, normalizeDates, normalizeNumbers)
 * based on field schema from a LabelingProject.
 */

import type {
  AzureDocument,
  EnrichmentChange,
  KeyValuePair,
  OCRResult,
} from "../types";

/** Minimal field definition for rule engine (from LabelingProject.field_schema) */
export interface FieldDef {
  field_key: string;
  field_type: string;
  field_format?: string | null;
}

export type FieldMap = Record<string, { type: string; format?: string }>;

/**
 * Build a map of field_key -> { type, format } from field definitions.
 */
export function buildFieldMap(fieldDefinitions: FieldDef[]): FieldMap {
  const map: FieldMap = {};
  for (const fd of fieldDefinitions) {
    map[fd.field_key] = {
      type: fd.field_type,
      format: fd.field_format ?? undefined,
    };
  }
  return map;
}

/**
 * Trim leading/trailing whitespace from a string.
 * Records a change if the value actually changed.
 */
export function trimWhitespace(
  fieldKey: string,
  value: string,
): { value: string; change: EnrichmentChange | null } {
  if (value == null || typeof value !== "string")
    return { value: value ?? "", change: null };
  const trimmed = value.trim();
  if (trimmed === value) return { value: trimmed, change: null };
  return {
    value: trimmed,
    change: {
      fieldKey,
      originalValue: value,
      correctedValue: trimmed,
      reason: "Trimmed leading/trailing whitespace",
      source: "rule",
    },
  };
}

/** Common OCR character confusions: letter -> digit (for date/number contexts) */
const CONFUSION_MAP: Record<string, string> = {
  O: "0",
  o: "0",
  I: "1",
  l: "1",
  S: "5",
  s: "5",
  B: "8",
  G: "6",
  Z: "2",
  q: "9",
};

/** Month names and abbreviations to protect from character confusion in date fields (longest first) */
const MONTH_NAMES = [
  "September",
  "February",
  "November",
  "December",
  "October",
  "January",
  "August",
  "April",
  "March",
  "July",
  "June",
  "Sep",
  "Feb",
  "Nov",
  "Dec",
  "Oct",
  "Jan",
  "Aug",
  "Apr",
  "Mar",
  "Jul",
  "Jun",
  "May",
].sort((a, b) => b.length - a.length);

/**
 * For date fields, mask month names so fixCharacterConfusion does not alter them (e.g. S in "Sep" → 5).
 * Uses placeholders and restores originals after applying the confusion map.
 */
function applyCharacterConfusionForDate(value: string): string {
  const placeholders: string[] = [];
  let masked = value;
  for (const month of MONTH_NAMES) {
    const re = new RegExp(month.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    masked = masked.replace(re, () => {
      const placeholder = `\uE000${placeholders.length}\uE000`;
      placeholders.push(month);
      return placeholder;
    });
  }
  for (const [from, to] of Object.entries(CONFUSION_MAP)) {
    masked = masked.split(from).join(to);
  }
  placeholders.forEach((month, i) => {
    masked = masked.replace(`\uE000${i}\uE000`, month);
  });
  return masked;
}

/**
 * Fix common OCR character confusion (O/0, l/1, S/5, etc.) in date and number fields.
 * For date fields, month names (Jan, Sep, etc.) are protected so they are not altered.
 */
export function fixCharacterConfusion(
  fieldKey: string,
  value: string,
  fieldType: string,
): { value: string; change: EnrichmentChange | null } {
  if (value == null || typeof value !== "string" || !value)
    return { value: value ?? "", change: null };
  const corrected =
    fieldType === "date"
      ? applyCharacterConfusionForDate(value)
      : (() => {
          let s = value;
          for (const [from, to] of Object.entries(CONFUSION_MAP)) {
            s = s.split(from).join(to);
          }
          return s;
        })();
  if (corrected === value) return { value, change: null };
  return {
    value: corrected,
    change: {
      fieldKey,
      originalValue: value,
      correctedValue: corrected,
      reason: "Fixed common OCR character confusion (e.g. O→0, l→1)",
      source: "rule",
    },
  };
}

/**
 * Parse and normalize a date string. Tries common formats.
 * Returns ISO date (YYYY-MM-DD) when possible.
 */
export function normalizeDates(
  fieldKey: string,
  value: string,
  fieldFormat?: string,
): { value: string; change: EnrichmentChange | null } {
  if (value == null || typeof value !== "string" || !value.trim())
    return { value: value ?? "", change: null };
  const trimmed = value.trim();
  const parsed = parseDate(trimmed, fieldFormat);
  if (!parsed) return { value: trimmed, change: null };
  if (parsed === trimmed) return { value: trimmed, change: null };
  return {
    value: parsed,
    change: {
      fieldKey,
      originalValue: value,
      correctedValue: parsed,
      reason: "Normalized date to standard format",
      source: "rule",
    },
  };
}

function parseDate(input: string, _hint?: string): string | null {
  // ISO already
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (iso) {
    const [, y, m, d] = iso;
    if (parseInt(m!, 10) <= 12 && parseInt(d!, 10) <= 31)
      return `${y}-${m}-${d}`;
  }
  // MM/DD/YYYY or MM-DD-YYYY
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(
    input.replace(/\s/g, ""),
  );
  if (us) {
    const [, m, d, y] = us;
    const yy = y!.length === 2 ? `20${y}` : y!;
    const mm = m!.padStart(2, "0");
    const dd = d!.padStart(2, "0");
    if (parseInt(mm, 10) <= 12 && parseInt(dd, 10) <= 31)
      return `${yy}-${mm}-${dd}`;
  }
  // DD/MM/YYYY
  const eu = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(
    input.replace(/\s/g, ""),
  );
  if (eu) {
    const [, d, m, y] = eu;
    const yy = y!.length === 2 ? `20${y}` : y!;
    const mm = m!.padStart(2, "0");
    const dd = d!.padStart(2, "0");
    if (parseInt(mm, 10) <= 12 && parseInt(dd, 10) <= 31)
      return `${yy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Strip currency symbols and normalize decimal/thousands separators for number fields.
 */
export function normalizeNumbers(
  fieldKey: string,
  value: string,
): { value: string; change: EnrichmentChange | null } {
  if (value == null || typeof value !== "string" || !value.trim())
    return { value: value ?? "", change: null };
  const trimmed = value.trim();
  let normalized = trimmed
    .replace(/^[\s£$€¥,]+|[\s£$€¥,]+$/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");
  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return { value: trimmed, change: null };
  normalized = num.toString();
  if (normalized === trimmed) return { value: trimmed, change: null };
  return {
    value: normalized,
    change: {
      fieldKey,
      originalValue: value,
      correctedValue: normalized,
      reason: "Normalized number format (removed currency/separators)",
      source: "rule",
    },
  };
}

/**
 * Apply all generic rules to a single field value based on field type.
 * Returns the corrected value and optional change record.
 */
export function applyRulesToValue(
  fieldKey: string,
  value: string,
  fieldMap: FieldMap,
): { value: string; changes: EnrichmentChange[] } {
  const changes: EnrichmentChange[] = [];
  const info = fieldMap[fieldKey];
  const type = info?.type ?? "string";

  let current = value;

  const trim = trimWhitespace(fieldKey, current);
  current = trim.value;
  if (trim.change) changes.push(trim.change);

  if (type === "date") {
    const fix = fixCharacterConfusion(fieldKey, current, type);
    current = fix.value;
    if (fix.change) changes.push(fix.change);
    const norm = normalizeDates(fieldKey, current, info?.format);
    current = norm.value;
    if (norm.change) changes.push(norm.change);
  } else if (type === "number") {
    const fix = fixCharacterConfusion(fieldKey, current, type);
    current = fix.value;
    if (fix.change) changes.push(fix.change);
    const norm = normalizeNumbers(fieldKey, current);
    current = norm.value;
    if (norm.change) changes.push(norm.change);
  }

  return { value: current, changes };
}

/**
 * Get field key from a KeyValuePair (key.content).
 */
function getKvpKey(pair: KeyValuePair): string {
  return (pair.key?.content ?? "").trim();
}

/**
 * Get value from a KeyValuePair (value.content).
 */
function getKvpValue(pair: KeyValuePair): string {
  return (pair.value?.content ?? "").trim();
}

/**
 * Apply enrichment rules to OCR result keyValuePairs and optionally custom document fields.
 * Returns a new OCRResult and list of changes.
 */
export function applyRules(
  ocrResult: OCRResult,
  fieldMap: FieldMap,
): {
  ocrResult: OCRResult;
  changes: EnrichmentChange[];
  rulesApplied: string[];
} {
  const changes: EnrichmentChange[] = [];
  const rulesAppliedSet = new Set<string>(["trimWhitespace"]);

  const result: OCRResult = {
    ...ocrResult,
    keyValuePairs: ocrResult.keyValuePairs.map((pair) => {
      const key = getKvpKey(pair);
      const value = getKvpValue(pair);
      const { value: newValue, changes: fieldChanges } = applyRulesToValue(
        key,
        value,
        fieldMap,
      );
      changes.push(...fieldChanges);
      const emptyRegion = { pageNumber: 1, polygon: [] as number[] };
      const emptySpan = { offset: 0, length: 0 };
      return {
        ...pair,
        key: { ...pair.key, content: key },
        value: pair.value
          ? { ...pair.value, content: newValue }
          : {
              content: newValue,
              boundingRegions: [emptyRegion],
              spans: [emptySpan],
            },
      };
    }),
  };

  for (const c of changes) {
    if (c.reason.includes("character confusion"))
      rulesAppliedSet.add("fixCharacterConfusion");
    else if (c.reason.includes("date")) rulesAppliedSet.add("normalizeDates");
    else if (c.reason.includes("number"))
      rulesAppliedSet.add("normalizeNumbers");
  }
  const rulesApplied = Array.from(rulesAppliedSet);

  if (ocrResult.documents && ocrResult.documents.length > 0) {
    result.documents = ocrResult.documents.map((doc) => {
      const fields = { ...doc.fields };
      for (const [fieldKey, fieldData] of Object.entries(doc.fields)) {
        const content =
          (fieldData as { content?: string }).content ??
          (fieldData as { valueString?: string }).valueString ??
          "";
        const str =
          typeof content === "string" ? content : String(content ?? "");
        const { value: newValue, changes: fieldChanges } = applyRulesToValue(
          fieldKey,
          str,
          fieldMap,
        );
        changes.push(...fieldChanges);
        if (typeof fieldData === "object" && fieldData !== null) {
          (fields as Record<string, unknown>)[fieldKey] = {
            ...(fieldData as object),
            content: newValue,
          };
        }
      }
      return { ...doc, fields } as AzureDocument;
    });
  }

  return { ocrResult: result, changes, rulesApplied };
}

/**
 * Merge overlay key-value pairs into base. Overlay values override base by key.
 * Keys and values are trimmed. Result is a new array.
 */
export function mergeKeyValuePairs(
  base: KeyValuePair[],
  overlay: Array<{ key: string; value: string; confidence: number }>,
): KeyValuePair[] {
  const byKey = new Map<string, KeyValuePair>();
  const emptySpan = { offset: 0, length: 0 };
  const emptyRegion = { pageNumber: 1, polygon: [] };

  for (const pair of base) {
    const k = (pair.key?.content ?? "").trim();
    const v = (pair.value?.content ?? "").trim();
    if (!k) continue;
    byKey.set(k, {
      ...pair,
      key: { ...pair.key, content: k },
      value: pair.value
        ? { ...pair.value, content: v }
        : { content: v, boundingRegions: [], spans: [] },
    });
  }
  for (const item of overlay) {
    const k = item.key.trim();
    const v = item.value.trim();
    if (!k) continue;
    byKey.set(k, {
      key: { content: k, boundingRegions: [], spans: [] },
      value: { content: v, boundingRegions: [emptyRegion], spans: [emptySpan] },
      confidence: item.confidence,
    });
  }
  return Array.from(byKey.values());
}
