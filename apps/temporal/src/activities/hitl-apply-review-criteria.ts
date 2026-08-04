/**
 * Activity: HITL review criteria evaluation
 *
 * Generic, document-agnostic activity that decides — per field — whether a
 * human reviewer should look at it or whether it can be auto-skipped. It
 * walks every field in an OCR result (`documents[].fields` and/or
 * `keyValuePairs`) and evaluates an ordered list of author-supplied rules
 * against it. The first matching rule wins; if no rule matches, the
 * `defaultAction` applies.
 *
 * All conditions are evaluated against the **prediction only** — the
 * extracted value, its confidence, and static schema metadata (field type,
 * format spec). Ground truth is never available to (and never consulted by)
 * this activity; that is what keeps it usable outside of benchmarking.
 *
 * Any document-specific behavior (which fields matter, what thresholds to
 * use, what counts as "inferred") is expressed entirely through the `rules`
 * parameter supplied by the workflow config — this activity itself has no
 * knowledge of any particular document type.
 *
 * See docs-md/architecture/HITL_REVIEW_CRITERIA.md
 */

import { extractAzureFieldDisplayValue } from "../azure-ocr-field-display-value";
import {
  parseFormatSpec,
  validate as validateFormatSpec,
  type FormatSpec,
} from "../field-format-engine";
import { createActivityLogger } from "../logger";
import { resolveOcrResultInput } from "../ocr-activity-ref-utils";
import type { OcrPayloadRef } from "../ocr-payload-ref";
import type { AzureDocumentFieldValue, OCRResult } from "../types";
import type { FieldMap } from "./enrichment-rules";
import { loadFieldMapFromProject } from "./field-schema-loader";

// ---------------------------------------------------------------------------
// Parameter / result types
// ---------------------------------------------------------------------------

/** Prediction-side-only conditions — never consult ground truth. */
export type ReviewCriteriaCondition =
  | { confidenceBelow: number }
  | { predictionIsBlank: true }
  | { predictionLengthAtMost: number }
  | { formatValidationFails: true }
  | { valueOutsideRange: { min?: number; max?: number } }
  | { valueWasInferred: true }
  | { always: true };

export interface ReviewCriteriaRuleSelect {
  /** Exact field keys this rule applies to. */
  fields?: string[];
  /** Glob patterns (`*` wildcard) matched against the field key. */
  fieldPatterns?: string[];
  /** Glob patterns; a field key matching any of these is never selected by this rule. */
  excludeFieldPatterns?: string[];
  /** Restrict to fields whose schema/labeling type is one of these (e.g. `date`, `number`). */
  fieldTypes?: string[];
}

export interface ReviewCriteriaRule {
  name: string;
  select: ReviewCriteriaRuleSelect;
  /** ALL of these must be true for the rule to match (AND). Omitted/empty = always true. */
  when?: ReviewCriteriaCondition[];
  /** If ANY of these is true, the rule is skipped even if `select`+`when` matched. */
  skipWhen?: ReviewCriteriaCondition[];
  action: "review" | "skip";
  reason: string;
}

export interface ApplyReviewCriteriaParams {
  documentId: string;
  ocrResult: OCRResult | OcrPayloadRef;
  groupId?: string | null;
  /** TemplateModel id — loads `field_schema` for `formatValidationFails` and schema-aware `fieldTypes` selection. */
  documentType?: string;
  rules: ReviewCriteriaRule[];
  /** Action applied when no rule matches a field. Default `"skip"`. */
  defaultAction?: "review" | "skip";
  /** Field keys previously marked as inferred (e.g. by an LLM enrichment step) — backs `valueWasInferred`. */
  inferredFieldKeys?: string[];
  /**
   * Per-rule confidence threshold overrides, keyed by rule `name`.
   * When a rule's `when` / `skipWhen` contains `confidenceBelow`, the override
   * replaces that condition's threshold. Flat object keys (not array indices)
   * so operating points can be exposed via `exposedParams` /
   * `workflowConfigOverrides` without editing the rules array.
   */
  ruleConfidenceOverrides?: Record<string, number>;
}

export interface ReviewPlanEntry {
  field: string;
  decision: "review" | "skip";
  reason: string;
  ruleName: string;
  confidence: number | null;
}

export interface ApplyReviewCriteriaResult {
  reviewPlan: ReviewPlanEntry[];
  requiresReview: boolean;
  reviewFieldCount: number;
  countsByRule: Record<string, number>;
}

/** Rule-name bucket used in `countsByRule` when no rule matched a field. */
const DEFAULT_RULE_NAME = "__default__";

// ---------------------------------------------------------------------------
// Field walking
// ---------------------------------------------------------------------------

interface WalkedField {
  fieldKey: string;
  value: unknown;
  confidence: number | null;
  /** Labeling/schema field type, when known from the OCR payload itself (not the DB). */
  fieldType?: string;
}

/**
 * Walk `documents[].fields` and `keyValuePairs`, producing one entry per
 * field key. Fields present in `documents[].fields` take precedence; a
 * `keyValuePairs` entry is only added if no document field already used
 * that key (mirrors `buildFlatPredictionMapFromCtx`'s documents-first
 * precedence while still covering both shapes).
 */
function collectFields(ocrResult: OCRResult): WalkedField[] {
  const fields = new Map<string, WalkedField>();

  for (const doc of ocrResult.documents ?? []) {
    for (const [fieldKey, fieldData] of Object.entries(doc.fields ?? {})) {
      const fd = fieldData as AzureDocumentFieldValue;
      fields.set(fieldKey, {
        fieldKey,
        value: extractAzureFieldDisplayValue(fd as Record<string, unknown>),
        confidence: typeof fd.confidence === "number" ? fd.confidence : null,
        fieldType: fd.type,
      });
    }
  }

  for (const kvp of ocrResult.keyValuePairs ?? []) {
    const key = (kvp.key?.content ?? "").trim();
    if (!key || fields.has(key)) continue;
    fields.set(key, {
      fieldKey: key,
      value: kvp.value?.content ?? null,
      confidence: typeof kvp.confidence === "number" ? kvp.confidence : null,
    });
  }

  return [...fields.values()];
}

// ---------------------------------------------------------------------------
// Glob matching (simple `*` wildcard)
// ---------------------------------------------------------------------------

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAnyGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function fieldMatchesSelect(
  fieldKey: string,
  fieldType: string | undefined,
  select: ReviewCriteriaRuleSelect,
): boolean {
  if (
    select.excludeFieldPatterns?.length &&
    matchesAnyGlob(fieldKey, select.excludeFieldPatterns)
  ) {
    return false;
  }

  const hasFieldSelectors = Boolean(
    select.fields?.length || select.fieldPatterns?.length,
  );
  if (hasFieldSelectors) {
    const inFields = select.fields?.includes(fieldKey) ?? false;
    const inPatterns = select.fieldPatterns?.length
      ? matchesAnyGlob(fieldKey, select.fieldPatterns)
      : false;
    if (!inFields && !inPatterns) return false;
  }

  if (select.fieldTypes?.length) {
    if (!fieldType || !select.fieldTypes.includes(fieldType)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Condition evaluation (prediction-side only)
// ---------------------------------------------------------------------------

interface FieldEvalContext {
  fieldKey: string;
  value: unknown;
  confidence: number | null;
  formatSpec: FormatSpec | null;
  inferredFieldKeys: Set<string>;
}

function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,$€£¥%\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function evaluateCondition(
  condition: ReviewCriteriaCondition,
  ctx: FieldEvalContext,
  confidenceOverride?: number,
): boolean {
  if ("confidenceBelow" in condition) {
    const threshold =
      confidenceOverride !== undefined
        ? confidenceOverride
        : condition.confidenceBelow;
    return ctx.confidence !== null && ctx.confidence < threshold;
  }
  if ("predictionIsBlank" in condition) {
    return isBlankValue(ctx.value);
  }
  if ("predictionLengthAtMost" in condition) {
    return (
      toDisplayString(ctx.value).trim().length <=
      condition.predictionLengthAtMost
    );
  }
  if ("formatValidationFails" in condition) {
    if (!ctx.formatSpec) return false;
    const display = toDisplayString(ctx.value);
    if (display === "") return false;
    return !validateFormatSpec(display, ctx.formatSpec).valid;
  }
  if ("valueOutsideRange" in condition) {
    const num = toNumberOrNull(ctx.value);
    if (num === null) return false;
    const { min, max } = condition.valueOutsideRange;
    if (min !== undefined && num < min) return true;
    if (max !== undefined && num > max) return true;
    return false;
  }
  if ("valueWasInferred" in condition) {
    return ctx.inferredFieldKeys.has(ctx.fieldKey);
  }
  if ("always" in condition) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * Evaluate configured review-criteria rules against every field in an OCR
 * result and produce a per-field review/skip plan. Never inspects ground
 * truth. Does not special-case benchmark documents — any benchmark bypass
 * belongs in the graph's switch/gate node, not here.
 */
export async function applyReviewCriteria(
  params: ApplyReviewCriteriaParams,
): Promise<ApplyReviewCriteriaResult> {
  const log = createActivityLogger("applyReviewCriteria", {
    documentId: params.documentId,
  });
  const { documentId, documentType, rules } = params;
  const defaultAction: "review" | "skip" = params.defaultAction ?? "skip";
  const { ocrResult } = await resolveOcrResultInput(params);

  let fieldMap: FieldMap | null = null;
  if (documentType?.trim()) {
    try {
      fieldMap = await loadFieldMapFromProject(documentType.trim());
    } catch (err) {
      log.error("Apply review criteria: failed to load field schema", {
        event: "schema_load_error",
        documentType,
        error: err instanceof Error ? err.message : String(err),
      });
      fieldMap = null;
    }
  }

  const inferredFieldKeys = new Set(params.inferredFieldKeys ?? []);
  const confidenceOverrides = params.ruleConfidenceOverrides ?? {};
  const walkedFields = collectFields(ocrResult);

  log.info("Apply review criteria start", {
    event: "start",
    fileName: ocrResult.fileName,
    fieldCount: walkedFields.length,
    ruleCount: rules.length,
    documentType: documentType ?? null,
    ruleConfidenceOverrideCount: Object.keys(confidenceOverrides).length,
  });

  const reviewPlan: ReviewPlanEntry[] = [];
  const countsByRule: Record<string, number> = {};

  for (const field of walkedFields) {
    const schemaRow = fieldMap?.[field.fieldKey];
    const fieldType = schemaRow?.type ?? field.fieldType;
    const formatSpec = schemaRow?.format
      ? parseFormatSpec(schemaRow.format)
      : null;

    const ctx: FieldEvalContext = {
      fieldKey: field.fieldKey,
      value: field.value,
      confidence: field.confidence,
      formatSpec,
      inferredFieldKeys,
    };

    let matchedRule: ReviewCriteriaRule | null = null;
    for (const rule of rules) {
      if (!fieldMatchesSelect(field.fieldKey, fieldType, rule.select)) {
        continue;
      }
      const confidenceOverride = confidenceOverrides[rule.name];
      const whenMatches =
        !rule.when?.length ||
        rule.when.every((condition) =>
          evaluateCondition(condition, ctx, confidenceOverride),
        );
      if (!whenMatches) continue;

      const skipMatches = Boolean(
        rule.skipWhen?.length &&
          rule.skipWhen.some((condition) =>
            evaluateCondition(condition, ctx, confidenceOverride),
          ),
      );
      if (skipMatches) continue;

      matchedRule = rule;
      break;
    }

    const decision: "review" | "skip" = matchedRule?.action ?? defaultAction;
    const ruleName = matchedRule?.name ?? DEFAULT_RULE_NAME;
    const reason =
      matchedRule?.reason ??
      `No rule matched; default action "${defaultAction}" applied`;

    reviewPlan.push({
      field: field.fieldKey,
      decision,
      reason,
      ruleName,
      confidence: field.confidence,
    });

    countsByRule[ruleName] = (countsByRule[ruleName] ?? 0) + 1;
  }

  const reviewFieldCount = reviewPlan.filter(
    (entry) => entry.decision === "review",
  ).length;
  const requiresReview = reviewFieldCount > 0;

  log.info("Apply review criteria complete", {
    event: "complete",
    documentId,
    fieldCount: walkedFields.length,
    reviewFieldCount,
    requiresReview,
  });

  return { reviewPlan, requiresReview, reviewFieldCount, countsByRule };
}
