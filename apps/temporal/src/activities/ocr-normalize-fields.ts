/**
 * Activity: Field normalization correction tool
 *
 * Applies deterministic normalization to OCR fields: whitespace cleanup,
 * digit/date canonicalization, and consistent formatting. Operates on the
 * full OCR result shape.
 *
 * Optional **`documentType`** (LabelingProject id) loads `field_schema` from the
 * database so rule sets follow **`field_type`** (`string`, `number`, `date`, etc.),
 * matching enrichment behavior. Without it, behavior is unchanged (all rules +
 * key-based heuristics).
 *
 * This complements ocr.cleanup (which is model-agnostic text-level normalization)
 * by operating at the field value level with stricter canonicalization rules.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-02-ocr-correction-tools-and-nodes.md
 */

import { extractAzureFieldDisplayValue } from "../azure-ocr-field-display-value";
import type {
  CorrectionResult,
  CorrectionToolParams,
} from "../correction-types";
import { deepCopyOcrResult } from "../correction-types";
import {
  digitsOnly,
  isDateLikeFieldKey,
  isIdentifierLikeFieldKey,
  shouldCoerceDateFieldNoiseToEmpty,
  tryCanonicalDateString,
} from "../form-field-normalization";
import { createActivityLogger } from "../logger";
import type { EnrichmentChange, OCRResult } from "../types";
import type { FieldMap } from "./enrichment-rules";
import { loadFieldMapFromProject } from "./field-schema-loader";

interface NormalizerRule {
  id: string;
  label: string;
  fn: (value: string) => string;
}

export type EmptyValueCoercionMode = "none" | "blank" | "null";

interface NormalizeFieldsParams extends CorrectionToolParams {
  /** LabelingProject id — loads field_schema for type-aware rule selection (same as enrichResults `documentType`). */
  documentType?: string;
  enabledRules?: string[];
  disabledRules?: string[];
  normalizeFullResult?: boolean;
  normalizeWhitespace?: boolean;
  normalizeDigitGrouping?: boolean;
  normalizeDateSeparators?: boolean;
  /**
   * After normalization, coerce Azure field shapes that resolve to an empty display value.
   * `blank` sets `content` (and clears typed slots) so flattening yields `""`; `null` sets `content` to JSON null.
   * Default `none` leaves values unchanged (flattening may yield `null` for missing slots).
   * Applies to **all** fields present in the OCR result (not gated by `fieldScope`; use `fieldScope` for rules only).
   */
  emptyValueCoercion?: EmptyValueCoercionMode;
}

/** Rule ids allowed per Prisma FieldType (intersected with activity `enabledRules` / `disabledRules`). */
function ruleIdsForSchemaFieldType(fieldType: string): Set<string> {
  const base = new Set(["unicode", "whitespace", "dehyphenation"]);
  switch (fieldType) {
    case "number":
      return new Set([
        ...base,
        "digitGrouping",
        "commaThousands",
        "currencySpacing",
        "dateSeparators",
      ]);
    case "date":
      return new Set([...base, "dateSeparators", "currencySpacing"]);
    case "selectionMark":
      return new Set(["unicode", "whitespace"]);
    case "string":
    case "signature":
    default:
      return base;
  }
}

function rulesForSchemaField(
  baseRules: NormalizerRule[],
  schemaFieldType: string | undefined,
): NormalizerRule[] {
  if (!schemaFieldType) return baseRules;
  const allowed = ruleIdsForSchemaFieldType(schemaFieldType);
  return baseRules.filter((r) => allowed.has(r.id));
}

function normalizeUnicode(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u2028/g, "\n")
    .replace(/\u2029/g, "\n\n")
    .replace(/[\u2000-\u200A]/g, " ")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00AD/g, "");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[\t\r]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function normalizeDehyphenation(value: string): string {
  return value
    .replace(/([a-zA-Z])-\s+([a-z])/g, "$1$2")
    .replace(/([a-zA-Z])-\n\s*([a-z])/g, "$1$2")
    .replace(/([a-zA-Z])-\s{2,}([a-z])/g, "$1$2");
}

function normalizeDigitGrouping(value: string): string {
  return value.replace(/(\d)\s+(?=\d{3}(?:\s|$|\D))/g, "$1");
}

function normalizeCommaThousands(value: string): string {
  return value.replace(/\b\d{1,3}(?:,\s?\d{3})+(?:\.\d+)?\b/g, (match) =>
    match.replace(/,\s?/g, ""),
  );
}

function normalizeDateSeparators(value: string): string {
  return value.replace(/^(\d{1,2})[.\s](\d{1,2})[.\s](\d{2,4})$/, "$1/$2/$3");
}

function normalizeCurrencySpacing(value: string): string {
  return value
    .replace(/([£$€¥])\s*(\d)/g, "$1$2")
    .replace(/(\d)\s*([£$€¥])/g, "$1$2");
}

const BUILT_IN_RULES: NormalizerRule[] = [
  {
    id: "unicode",
    label: "Normalized unicode and encoding artifacts",
    fn: normalizeUnicode,
  },
  { id: "whitespace", label: "Normalized whitespace", fn: normalizeWhitespace },
  {
    id: "dehyphenation",
    label: "Normalized dehyphenation",
    fn: normalizeDehyphenation,
  },
  {
    id: "digitGrouping",
    label: "Normalized digit grouping",
    fn: normalizeDigitGrouping,
  },
  {
    id: "commaThousands",
    label: "Normalized comma thousands separators",
    fn: normalizeCommaThousands,
  },
  {
    id: "dateSeparators",
    label: "Normalized date separators",
    fn: normalizeDateSeparators,
  },
  {
    id: "currencySpacing",
    label: "Normalized currency spacing",
    fn: normalizeCurrencySpacing,
  },
];

const NUMERIC_RULE_IDS = new Set([
  "digitGrouping",
  "commaThousands",
  "dateSeparators",
  "currencySpacing",
]);

function looksLikeNumericOrMoney(value: string): boolean {
  return /^[\d,.\s$€£¥%+-]+$/.test(value);
}

function isFieldInScope(
  fieldKey: string,
  fieldScope: string[] | undefined,
): boolean {
  if (!fieldScope || fieldScope.length === 0) return true;
  return fieldScope.includes(fieldKey);
}

function isEmptyDisplayForCoercion(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function clearAzureFieldTypedSlots(fd: Record<string, unknown>): void {
  delete fd.valueNumber;
  delete fd.valueInteger;
  delete fd.valueDate;
  delete fd.valueTime;
  delete fd.valueCurrency;
  delete fd.valueSelectionMark;
  delete fd.valueString;
}

/**
 * Align empty Azure field shapes with ground truth conventions (`""` vs JSON null).
 * Runs on every field in the OCR result — not restricted by `fieldScope` (rules use `fieldScope` separately).
 */
function applyEmptyValueCoercionToOcrResult(
  result: OCRResult,
  mode: "blank" | "null",
  changes: EnrichmentChange[],
): void {
  for (const kvp of result.keyValuePairs) {
    const key = (kvp.key?.content ?? "").trim();
    if (!key) continue;
    const val = kvp.value;
    if (!val) continue;
    const c = val.content;
    const empty =
      c === undefined ||
      c === null ||
      (typeof c === "string" && c.trim() === "");
    if (!empty) continue;

    const before =
      c === undefined || c === null
        ? ""
        : typeof c === "string"
          ? c
          : String(c);
    val.content = mode === "blank" ? "" : (null as unknown as string);
    changes.push({
      fieldKey: key,
      originalValue: before,
      correctedValue: mode === "blank" ? "" : "null",
      reason:
        mode === "blank"
          ? "Coerced empty key-value field to blank string"
          : "Coerced empty key-value field to null content",
      source: "rule",
    });
  }

  if (!result.documents) return;

  for (const doc of result.documents) {
    for (const [fieldKey, fieldData] of Object.entries(doc.fields)) {
      const fd = fieldData as Record<string, unknown>;
      const display = extractAzureFieldDisplayValue(fd);
      if (!isEmptyDisplayForCoercion(display)) continue;

      const before =
        display === null || display === undefined
          ? ""
          : typeof display === "string"
            ? display
            : String(display);

      clearAzureFieldTypedSlots(fd);
      if (mode === "blank") {
        fd.content = "";
      } else {
        fd.content = null;
      }
      changes.push({
        fieldKey,
        originalValue: before,
        correctedValue: mode === "blank" ? "" : "null",
        reason:
          mode === "blank"
            ? "Coerced empty document field to blank string"
            : "Coerced empty document field to null content",
        source: "rule",
      });
    }
  }
}

/**
 * Key- and schema-aware canonicalization (digits-only IDs, calendar dates).
 * Runs after generic rules so whitespace and separators are already cleaned.
 */
function applySemanticFieldShape(
  fieldKey: string,
  value: string,
  changes: EnrichmentChange[],
  schemaFieldType?: string,
): string {
  if (!value || typeof value !== "string") return value;

  if (isIdentifierLikeFieldKey(fieldKey) && /\d/.test(value)) {
    const compact = digitsOnly(value);
    if (compact.length > 0 && compact !== value) {
      changes.push({
        fieldKey,
        originalValue: value,
        correctedValue: compact,
        reason: "Canonicalized identifier digits",
        source: "rule",
      });
      return compact;
    }
  }

  const treatAsDate =
    schemaFieldType === "date" || isDateLikeFieldKey(fieldKey);
  if (treatAsDate) {
    const canonical = tryCanonicalDateString(value);
    if (canonical !== null) {
      if (canonical !== value) {
        changes.push({
          fieldKey,
          originalValue: value,
          correctedValue: canonical,
          reason: "Canonicalized date field",
          source: "rule",
        });
      }
      return canonical;
    }
    if (shouldCoerceDateFieldNoiseToEmpty(value)) {
      changes.push({
        fieldKey,
        originalValue: value,
        correctedValue: "",
        reason: "Cleared date-field OCR noise",
        source: "rule",
      });
      return "";
    }
  }

  return value;
}

function resolveActiveRules(params: NormalizeFieldsParams): NormalizerRule[] {
  const byId = new Map(BUILT_IN_RULES.map((rule) => [rule.id, rule]));
  const enabled = params.enabledRules?.length
    ? params.enabledRules
        .map((id) => byId.get(id))
        .filter((r): r is NormalizerRule => Boolean(r))
    : [...BUILT_IN_RULES];

  const disabledIds = new Set(params.disabledRules ?? []);
  if (params.normalizeWhitespace === false) disabledIds.add("whitespace");
  if (params.normalizeDigitGrouping === false) disabledIds.add("digitGrouping");
  if (params.normalizeDateSeparators === false)
    disabledIds.add("dateSeparators");

  return enabled.filter((rule) => !disabledIds.has(rule.id));
}

function applyRules(
  value: string,
  fieldKey: string,
  rules: NormalizerRule[],
  changes: EnrichmentChange[],
  onlyNumericRules = false,
): string {
  let current = value;
  for (const rule of rules) {
    if (onlyNumericRules && !NUMERIC_RULE_IDS.has(rule.id)) {
      continue;
    }
    const normalized = rule.fn(current);
    if (normalized !== current) {
      changes.push({
        fieldKey,
        originalValue: current,
        correctedValue: normalized,
        reason: rule.label,
        source: "rule",
      });
      current = normalized;
    }
  }
  return current;
}

function applyToFullResult(
  result: OCRResult,
  rules: NormalizerRule[],
  changes: EnrichmentChange[],
): void {
  result.extractedText = applyRules(
    result.extractedText,
    "__extractedText",
    rules,
    changes,
  );

  result.pages = result.pages.map((page) => ({
    ...page,
    words: page.words.map((word) => ({
      ...word,
      content: applyRules(word.content, "__pageWord", rules, changes),
    })),
    lines: page.lines.map((line) => ({
      ...line,
      content: applyRules(line.content, "__pageLine", rules, changes),
    })),
  }));

  result.paragraphs = result.paragraphs.map((para) => ({
    ...para,
    content: applyRules(para.content, "__paragraph", rules, changes),
  }));

  result.tables = result.tables.map((table) => ({
    ...table,
    cells: table.cells.map((cell) => ({
      ...cell,
      content: applyRules(cell.content, "__tableCell", rules, changes),
    })),
  }));

  result.sections = result.sections.map((section) => ({
    ...section,
    content: applyRules(section.content, "__section", rules, changes),
  }));

  result.figures = result.figures.map((figure) => ({
    ...figure,
    content: applyRules(figure.content, "__figure", rules, changes),
  }));
}

/**
 * Field normalization correction activity.
 * Applies deterministic formatting normalization across field values.
 */
export async function normalizeOcrFields(
  params: NormalizeFieldsParams,
): Promise<CorrectionResult> {
  const log = createActivityLogger("normalizeOcrFields");
  const { ocrResult, fieldScope, documentType } = params;
  const rules = resolveActiveRules(params);
  const normalizeFullResult = params.normalizeFullResult === true;
  const emptyValueCoercion: EmptyValueCoercionMode =
    params.emptyValueCoercion ?? "none";

  let fieldMap: FieldMap | null = null;
  if (documentType?.trim()) {
    try {
      fieldMap = await loadFieldMapFromProject(documentType.trim());
    } catch (err) {
      log.error("Normalize fields: failed to load field schema", {
        event: "schema_load_error",
        documentType,
        error: err instanceof Error ? err.message : String(err),
      });
      fieldMap = null;
    }
  }

  log.info("Normalize fields start", {
    event: "start",
    fileName: ocrResult.fileName,
    enabledRules: rules.map((r) => r.id),
    normalizeFullResult,
    fieldScope,
    documentType: documentType ?? null,
    schemaFieldCount: fieldMap ? Object.keys(fieldMap).length : 0,
    emptyValueCoercion,
  });

  const result = deepCopyOcrResult(ocrResult);
  const changes: EnrichmentChange[] = [];

  const applyNormalization = (fieldKey: string, value: string): string => {
    if (!value || typeof value !== "string") return value;
    const inScope = isFieldInScope(fieldKey, fieldScope);
    const schemaRow = fieldMap?.[fieldKey];
    const rulesThisField =
      fieldMap && schemaRow
        ? rulesForSchemaField(rules, schemaRow.type)
        : rules;

    let out: string;
    if (!fieldMap) {
      if (inScope) {
        out = applyRules(value, fieldKey, rules, changes);
      } else if (looksLikeNumericOrMoney(value)) {
        out = applyRules(value, fieldKey, rules, changes, true);
      } else {
        out = value;
      }
    } else {
      if (inScope) {
        out = applyRules(value, fieldKey, rulesThisField, changes);
      } else if (looksLikeNumericOrMoney(value)) {
        out = applyRules(value, fieldKey, rules, changes, true);
      } else {
        out = value;
      }
    }

    const runSemantic =
      inScope ||
      isIdentifierLikeFieldKey(fieldKey) ||
      isDateLikeFieldKey(fieldKey) ||
      (fieldMap && schemaRow?.type === "date");
    if (runSemantic) {
      out = applySemanticFieldShape(fieldKey, out, changes, schemaRow?.type);
    }
    return out;
  };

  for (const kvp of result.keyValuePairs) {
    const key = (kvp.key?.content ?? "").trim();
    if (!key) continue;
    if (kvp.value?.content) {
      kvp.value.content = applyNormalization(key, kvp.value.content);
    }
  }

  if (result.documents) {
    for (const doc of result.documents) {
      for (const [fieldKey, fieldData] of Object.entries(doc.fields)) {
        const fd = fieldData as {
          content?: string;
          valueString?: string;
          valueNumber?: number;
          valueInteger?: number;
        };
        const rawContent =
          typeof fd.content === "string" ? fd.content : undefined;
        const rawValueString =
          typeof fd.valueString === "string" ? fd.valueString : undefined;
        /** Prefer non-empty content; Azure often mirrors the display string in `valueString`, and `extractAzureFieldDisplayValue` prefers `valueString` over `content`. */
        const source =
          rawContent !== undefined && rawContent.length > 0
            ? rawContent
            : rawValueString;
        if (!source || typeof source !== "string") continue;
        const out = applyNormalization(fieldKey, source);
        if (rawContent !== undefined) {
          fd.content = out;
        }
        if (rawValueString !== undefined) {
          fd.valueString = out;
        }
        if (
          isIdentifierLikeFieldKey(fieldKey) &&
          /^\d+$/.test(out) &&
          (fd.valueNumber !== undefined || fd.valueInteger !== undefined)
        ) {
          const n = parseInt(out, 10);
          if (!Number.isNaN(n)) {
            if (fd.valueNumber !== undefined) fd.valueNumber = n;
            if (fd.valueInteger !== undefined) fd.valueInteger = n;
          }
        }
      }
    }
  }

  if (normalizeFullResult) {
    applyToFullResult(result, rules, changes);
  }

  if (emptyValueCoercion === "blank" || emptyValueCoercion === "null") {
    applyEmptyValueCoercionToOcrResult(result, emptyValueCoercion, changes);
  }

  log.info("Normalize fields complete", {
    event: "complete",
    fileName: ocrResult.fileName,
    changesApplied: changes.length,
  });

  return {
    ocrResult: result,
    changes,
    metadata: {
      enabledRules: rules.map((r) => r.id),
      normalizeFullResult,
      schemaAware: Boolean(fieldMap),
      documentType: documentType ?? null,
      schemaFieldCount: fieldMap ? Object.keys(fieldMap).length : 0,
      emptyValueCoercion,
    },
  };
}
