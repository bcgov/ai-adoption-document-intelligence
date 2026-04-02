/**
 * Activity: Character-confusion correction tool (standalone)
 *
 * Applies character-confusion mapping across the full OCR result shape.
 * Extends the existing fixCharacterConfusion logic to work as a standalone
 * activity with optional confusion map override.
 *
 * Optional **`documentType`** (LabelingProject id) loads `field_schema` so gating
 * and per-field rule subsets follow **`field_type`**, matching ocr.normalizeFields.
 *
 * Built-in rules: use **`enabledRules`** / **`disabledRules`** to toggle rule IDs.
 * When **`confusionMapOverride`** is set, it replaces the entire built-in rule
 * pipeline (enabled/disabled are ignored); schema-aware gating and per-field
 * slash handling for `string` fields still apply.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-02-ocr-correction-tools-and-nodes.md
 */

import type {
  CorrectionResult,
  CorrectionToolParams,
} from "../correction-types";
import { deepCopyOcrResult } from "../correction-types";
import {
  isDateLikeFieldKey,
  isIdentifierLikeFieldKey,
} from "../form-field-normalization";
import { createActivityLogger } from "../logger";
import type { EnrichmentChange } from "../types";
import type { FieldMap } from "./enrichment-rules";
import { loadFieldMapFromProject } from "./field-schema-loader";

export interface ConfusionRule {
  id: string;
  label: string;
  map: Record<string, string>;
}

/** Ordered built-in rules; merged maps in this order (no duplicate keys across rules). */
export const BUILT_IN_CONFUSION_RULES: ConfusionRule[] = [
  {
    id: "oToZero",
    label: "O/o to digit 0",
    map: { O: "0", o: "0" },
  },
  {
    id: "ilToOne",
    label: "I/l to digit 1",
    map: { I: "1", l: "1" },
  },
  {
    id: "ssToFive",
    label: "S/s to digit 5",
    map: { S: "5", s: "5" },
  },
  {
    id: "bToEight",
    label: "B to digit 8",
    map: { B: "8" },
  },
  {
    id: "gToSix",
    label: "G to digit 6",
    map: { G: "6" },
  },
  {
    id: "zToTwo",
    label: "Z to digit 2",
    map: { Z: "2" },
  },
  {
    id: "qToNine",
    label: "q to digit 9",
    map: { q: "9" },
  },
  {
    id: "slashToOne",
    label:
      "Slash to digit 1 (numeric OCR; suppressed for slash-separated dates)",
    map: { "/": "1" },
  },
];

export const BUILT_IN_CONFUSION_RULE_IDS = BUILT_IN_CONFUSION_RULES.map(
  (r) => r.id,
);

interface CharacterConfusionParams extends CorrectionToolParams {
  /** LabelingProject id — loads field_schema for type-aware gating and rule subsets (same as ocr.normalizeFields `documentType`). */
  documentType?: string;
  /** When set, only these built-in rule IDs run. Empty/omitted means all built-in rules (before disabledRules). */
  enabledRules?: string[];
  /** Built-in rule IDs to skip (after enabledRules). Ignored when confusionMapOverride is set. */
  disabledRules?: string[];
  confusionMapOverride?: Record<string, string>;
  /** Apply to all text fields, not just date/number context. Default: false */
  applyToAllFields?: boolean;
}

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

/** Rule ids allowed per Prisma FieldType (intersected with resolved enabled/disabled). */
export function confusionRuleIdsForFieldType(fieldType: string): Set<string> {
  const all = new Set(BUILT_IN_CONFUSION_RULE_IDS);
  switch (fieldType) {
    case "number":
    case "date":
      return all;
    case "string": {
      const s = new Set(all);
      s.delete("slashToOne");
      return s;
    }
    case "selectionMark":
    case "signature":
      return new Set();
    default:
      return all;
  }
}

function resolveBuiltInConfusionRules(
  params: CharacterConfusionParams,
): ConfusionRule[] {
  const byId = new Map(BUILT_IN_CONFUSION_RULES.map((r) => [r.id, r]));
  const enabled = params.enabledRules?.length
    ? params.enabledRules
        .map((id) => byId.get(id))
        .filter((r): r is ConfusionRule => Boolean(r))
    : [...BUILT_IN_CONFUSION_RULES];

  const disabledIds = new Set(params.disabledRules ?? []);
  return enabled.filter((r) => !disabledIds.has(r.id));
}

function mergeConfusionRules(rules: ConfusionRule[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const rule of rules) {
    Object.assign(merged, rule.map);
  }
  return merged;
}

function filterRulesForField(
  baseResolved: ConfusionRule[],
  schemaFieldType: string | undefined,
  fieldKnownInSchema: boolean,
): ConfusionRule[] {
  if (!fieldKnownInSchema || schemaFieldType === undefined) {
    return baseResolved;
  }
  const allowed = confusionRuleIdsForFieldType(schemaFieldType);
  return baseResolved.filter((r) => allowed.has(r.id));
}

function maskMonthNames(value: string): {
  masked: string;
  placeholders: string[];
} {
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
  return { masked, placeholders };
}

function restoreMonthNames(value: string, placeholders: string[]): string {
  let restored = value;
  placeholders.forEach((month, i) => {
    restored = restored.replace(`\uE000${i}\uE000`, month);
  });
  return restored;
}

function applyConfusionMap(
  value: string,
  confusionMap: Record<string, string>,
  protectMonths: boolean,
): string {
  if (!value) return value;
  if (value.trim() === "$") return value;

  if (protectMonths) {
    const { masked, placeholders } = maskMonthNames(value);
    let result = masked;
    for (const [from, to] of Object.entries(confusionMap)) {
      result = result.split(from).join(to);
    }
    return restoreMonthNames(result, placeholders);
  }

  let result = value;
  for (const [from, to] of Object.entries(confusionMap)) {
    result = result.split(from).join(to);
  }
  return result;
}

function hasConfusionGlyph(
  value: string,
  confusionMap: Record<string, string>,
): boolean {
  return Object.keys(confusionMap).some((glyph) => value.includes(glyph));
}

/**
 * When false, only run the map on values that look like numeric OCR (digits, money,
 * etc.) or on identifier/date field keys. Otherwise "Scott" triggers S→5 and o→0
 * because those letters appear in the confusion map.
 *
 * With schema: `selectionMark` / `signature` fields are skipped (handled via empty map).
 */
function shouldApplyCharacterConfusion(
  fieldKey: string,
  value: string,
  confusionMap: Record<string, string>,
  applyToAllFields: boolean | undefined,
): boolean {
  if (applyToAllFields) return true;
  if (!hasConfusionGlyph(value, confusionMap)) return false;
  if (/\d/.test(value)) return true;
  if (isIdentifierLikeFieldKey(fieldKey) || isDateLikeFieldKey(fieldKey)) {
    return true;
  }
  return false;
}

function isSlashSeparatedDate(value: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim());
}

function isFieldInScope(
  fieldKey: string,
  fieldScope: string[] | undefined,
): boolean {
  if (!fieldScope || fieldScope.length === 0) return true;
  return fieldScope.includes(fieldKey);
}

function stripSlashFromMap(
  map: Record<string, string>,
): Record<string, string> {
  if (!("/" in map)) return map;
  const { "/": _drop, ...rest } = map;
  return rest;
}

/**
 * Character-confusion correction activity.
 * Applies confusion map replacements across the full OCR result.
 */
export async function characterConfusionCorrection(
  params: CharacterConfusionParams,
): Promise<CorrectionResult> {
  const log = createActivityLogger("characterConfusionCorrection");
  const { ocrResult, fieldScope, applyToAllFields, documentType } = params;
  const useOverride = Boolean(
    params.confusionMapOverride &&
      Object.keys(params.confusionMapOverride).length > 0,
  );
  const confusionMapOverride = params.confusionMapOverride;

  const baseResolvedRules = useOverride
    ? null
    : resolveBuiltInConfusionRules(params);

  let fieldMap: FieldMap | null = null;
  if (documentType?.trim()) {
    try {
      fieldMap = await loadFieldMapFromProject(documentType.trim());
    } catch (err) {
      log.error("Character confusion: failed to load field schema", {
        event: "schema_load_error",
        documentType,
        error: err instanceof Error ? err.message : String(err),
      });
      fieldMap = null;
    }
  }

  const resolvedRuleIds = baseResolvedRules?.map((r) => r.id) ?? [];

  log.info("Character confusion correction start", {
    event: "start",
    fileName: ocrResult.fileName,
    confusionMapSize: useOverride
      ? Object.keys(confusionMapOverride ?? {}).length
      : resolvedRuleIds.length,
    applyToAllFields,
    fieldScope,
    documentType: documentType ?? null,
    schemaFieldCount: fieldMap ? Object.keys(fieldMap).length : 0,
    useOverride,
    enabledRules: resolvedRuleIds,
  });

  const result = deepCopyOcrResult(ocrResult);
  const changes: EnrichmentChange[] = [];

  function effectiveMapForField(fieldKey: string): Record<string, string> {
    if (useOverride && confusionMapOverride) {
      let m = { ...confusionMapOverride };
      const row = fieldMap?.[fieldKey];
      if (row?.type === "string") {
        m = stripSlashFromMap(m);
      }
      return m;
    }

    const fieldKnownInSchema = Boolean(fieldMap && fieldKey in fieldMap);
    const schemaType = fieldMap?.[fieldKey]?.type;
    const rulesForField = filterRulesForField(
      baseResolvedRules ?? [],
      schemaType,
      fieldKnownInSchema,
    );
    return mergeConfusionRules(rulesForField);
  }

  function correctValue(fieldKey: string, value: string): string {
    if (!value || typeof value !== "string") return value;

    const confusionMap = effectiveMapForField(fieldKey);
    if (Object.keys(confusionMap).length === 0) {
      return value;
    }

    const shouldApply = shouldApplyCharacterConfusion(
      fieldKey,
      value,
      confusionMap,
      applyToAllFields,
    );
    if (!shouldApply) return value;

    let activeMap = confusionMap;
    if (isSlashSeparatedDate(value) && "/" in confusionMap) {
      const { "/": _ignore, ...withoutSlash } = confusionMap;
      activeMap = withoutSlash;
    }

    const protectMonths = /[a-zA-Z]{3,}/.test(value);
    const corrected = applyConfusionMap(value, activeMap, protectMonths);

    if (corrected !== value) {
      changes.push({
        fieldKey,
        originalValue: value,
        correctedValue: corrected,
        reason: "Character confusion correction",
        source: "rule",
      });
    }

    return corrected;
  }

  for (const kvp of result.keyValuePairs) {
    const key = (kvp.key?.content ?? "").trim();
    if (!key || !isFieldInScope(key, fieldScope)) continue;
    if (kvp.value?.content) {
      kvp.value.content = correctValue(key, kvp.value.content);
    }
  }

  if (result.documents) {
    for (const doc of result.documents) {
      for (const [fieldKey, fieldData] of Object.entries(doc.fields)) {
        if (!isFieldInScope(fieldKey, fieldScope)) continue;
        const content = (fieldData as { content?: string }).content;
        if (content && typeof content === "string") {
          (fieldData as { content?: string }).content = correctValue(
            fieldKey,
            content,
          );
        }
      }
    }
  }

  log.info("Character confusion correction complete", {
    event: "complete",
    fileName: ocrResult.fileName,
    changesApplied: changes.length,
  });

  return {
    ocrResult: result,
    changes,
    metadata: {
      confusionMapEntries: useOverride
        ? Object.keys(confusionMapOverride ?? {}).length
        : Object.keys(mergeConfusionRules(baseResolvedRules ?? [])).length,
      applyToAllFields: applyToAllFields ?? false,
      documentType: documentType ?? null,
      schemaAware: Boolean(fieldMap),
      enabledRules: resolvedRuleIds,
      useOverride,
    },
  };
}
