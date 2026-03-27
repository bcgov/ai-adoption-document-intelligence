/**
 * Activity: Character-confusion correction tool (standalone)
 *
 * Applies character-confusion mapping across the full OCR result shape.
 * Extends the existing fixCharacterConfusion logic to work as a standalone
 * activity with optional confusion map override.
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

const DEFAULT_CONFUSION_MAP: Record<string, string> = {
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
  /** Slash misread as "1" in numeric context (e.g. 6/91.12 → 6191.12). Dates DD/MM/YYYY are excluded via isSlashSeparatedDate. */
  "/": "1",
};

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

interface CharacterConfusionParams extends CorrectionToolParams {
  confusionMapOverride?: Record<string, string>;
  /** Apply to all text fields, not just date/number context. Default: false */
  applyToAllFields?: boolean;
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

/**
 * Character-confusion correction activity.
 * Applies confusion map replacements across the full OCR result.
 */
export async function characterConfusionCorrection(
  params: CharacterConfusionParams,
): Promise<CorrectionResult> {
  const log = createActivityLogger("characterConfusionCorrection");
  const { ocrResult, fieldScope, applyToAllFields } = params;
  const confusionMap = params.confusionMapOverride ?? DEFAULT_CONFUSION_MAP;

  log.info("Character confusion correction start", {
    event: "start",
    fileName: ocrResult.fileName,
    confusionMapSize: Object.keys(confusionMap).length,
    applyToAllFields,
    fieldScope,
  });

  const result = deepCopyOcrResult(ocrResult);
  const changes: EnrichmentChange[] = [];

  function correctValue(fieldKey: string, value: string): string {
    if (!value || typeof value !== "string") return value;

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
      confusionMapEntries: Object.keys(confusionMap).length,
      applyToAllFields: applyToAllFields ?? false,
    },
  };
}
