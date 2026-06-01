/**
 * Field-filter helper for the SDPR HITL timing experiment.
 *
 * When EXPERIMENT_FIELD_FILTER env is set (e.g. "sin,phone,name,date,income_amounts"),
 * the HITL endpoints trim the field list returned to the reviewer to only
 * those categories AND only items the reviewer would actually verify:
 *   - field's prediction has content (matches the runtime "reviewable" notion;
 *     in the benchmark we used GT as well, but at runtime GT isn't available)
 *   - for income_amounts only, predictions of a single character (the shapes
 *     the normaliser maps to 0) are excluded — they're operationally "no
 *     income for this category".
 *
 * Read-only over arbitrary record shapes; returns a new object with the
 * filtered fields. When the env var is empty/unset, returns input unchanged.
 */
import { DocumentField, ExtractedFields } from "@/ocr/azure-types";

export const EXPERIMENT_FIELD_FILTER_ENV = "EXPERIMENT_FIELD_FILTER";

const SKIP_TRIVIAL_CATEGORIES = new Set(["income_amounts"]);

export function classifyFieldCategory(fieldName: string): string {
  if (fieldName === "sin" || fieldName === "spouse_sin") return "sin";
  if (fieldName === "date" || fieldName === "spouse_date") return "date";
  if (fieldName === "phone" || fieldName === "spouse_phone") return "phone";
  if (fieldName === "name" || fieldName === "spouse_name") return "name";
  if (fieldName === "signature" || fieldName === "spouse_signature")
    return "signature";
  if (fieldName === "explain_changes") return "freeform_text";
  if (fieldName === "case_id") return "case_id";
  if (fieldName.startsWith("checkbox_")) return "checkboxes";
  return "income_amounts";
}

function parseAllowedCategories(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function predictionIsEmpty(field: DocumentField): boolean {
  const v = field?.valueString;
  if (v === undefined || v === null) return true;
  if (typeof v !== "string") return false;
  return v.trim() === "";
}

function predictionIsTrivial(field: DocumentField): boolean {
  if (predictionIsEmpty(field)) return true;
  const v = field?.valueString;
  if (typeof v !== "string") return false;
  return v.trim().length <= 1;
}

/**
 * Apply the experiment field filter when EXPERIMENT_FIELD_FILTER is set.
 *
 * Two modes:
 *   - **Allow-list mode** (preferred): when `allowlist` is provided, only
 *     fields whose name is in the set are kept. Gives EXACT alignment with
 *     reviewable-items.csv, because the allow-list is computed from the
 *     same benchmark JSON using `predicted` AND `expected`. Even fields
 *     with empty predictions are kept if they're in the allow-list (e.g.
 *     missing-class errors where OCR returned nothing but the form has a
 *     value — the reviewer still needs to verify them).
 *   - **Category fallback**: when no `allowlist` is provided, keep fields
 *     whose category is in `envValue` AND whose prediction is non-empty
 *     (with the skip-trivial rule for income). This is an APPROXIMATION
 *     because GT isn't available at runtime; missing-class fields are not
 *     surfaced. Used only when EXPERIMENT_BENCHMARK_JSON_PATH is unset.
 *
 * When `envValue` is empty/unset, the filter is bypassed (production).
 */
export function applyExperimentFieldFilter(
  fields: ExtractedFields | Record<string, unknown> | null | undefined,
  envValue: string | undefined,
  allowlist?: Set<string> | null,
): ExtractedFields | Record<string, unknown> {
  const allowed = parseAllowedCategories(envValue);
  if (allowed.size === 0) {
    return (fields ?? {}) as ExtractedFields;
  }
  if (!fields || typeof fields !== "object") {
    return {};
  }
  const out: Record<string, unknown> = {};
  if (allowlist) {
    // Allow-list mode — pure lookup, exact match to reviewable-items.csv.
    for (const [key, raw] of Object.entries(fields)) {
      if (allowlist.has(key)) out[key] = raw;
    }
    return out;
  }
  // Category fallback — runtime-only rules.
  for (const [key, raw] of Object.entries(fields)) {
    const category = classifyFieldCategory(key);
    if (!allowed.has(category)) continue;
    const field = raw as DocumentField;
    if (predictionIsEmpty(field)) continue;
    if (SKIP_TRIVIAL_CATEGORIES.has(category) && predictionIsTrivial(field))
      continue;
    out[key] = field;
  }
  return out;
}
