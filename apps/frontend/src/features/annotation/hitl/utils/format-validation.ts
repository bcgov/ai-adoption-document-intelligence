/**
 * Field format validation for HITL correction inputs.
 *
 * Pure functions -- no Node dependencies. Mirrors the canonicalize logic
 * from apps/temporal/src/field-format-engine.ts but kept as a lightweight
 * frontend copy to avoid cross-package import complexity.
 *
 * Includes date parsing (ported from form-field-normalization.ts parseToCalendarParts)
 * so that all format specs are fully validated client-side.
 */

export interface FormatSpec {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

export function parseFormatSpec(raw: string | null): FormatSpec | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.canonicalize !== "string" || !parsed.canonicalize.trim())
    return null;
  const spec: FormatSpec = { canonicalize: parsed.canonicalize.trim() };
  if (typeof parsed.pattern === "string" && parsed.pattern.trim())
    spec.pattern = parsed.pattern;
  if (
    typeof parsed.displayTemplate === "string" &&
    parsed.displayTemplate.trim()
  )
    spec.displayTemplate = parsed.displayTemplate;
  return spec;
}

// --- Date parsing (ported from form-field-normalization.ts) ---

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

interface CalendarParts {
  y: number;
  m: number;
  day: number;
}

function isValidYmd(y: number, m: number, day: number): CalendarParts | null {
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== day
  )
    return null;
  return { y, m, day };
}

function tryDayMonthYear(
  d: number,
  mon: number,
  y: number,
): CalendarParts | null {
  return isValidYmd(y, mon, d);
}

function parseNumericTripletDate(
  aStr: string,
  bStr: string,
  yStr: string,
): CalendarParts | null {
  const a = parseInt(aStr, 10);
  const b = parseInt(bStr, 10);
  let y = parseInt(yStr, 10);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(y)) return null;
  if (yStr.length === 2) y += y >= 70 ? 1900 : 2000;
  if (a > 12) return tryDayMonthYear(a, b, y);
  if (b > 12) return tryDayMonthYear(b, a, y);
  const dmy = tryDayMonthYear(a, b, y);
  if (dmy) return dmy;
  return tryDayMonthYear(b, a, y);
}

function parseToCalendarParts(value: string): CalendarParts | null {
  const s = value.trim();
  if (!s) return null;
  const named = s.match(/^(\d{4})-([A-Za-z]{3,9})-(\d{1,2})$/);
  if (named) {
    const y = parseInt(named[1], 10);
    const mon = MONTH_NAME_TO_NUM[named[2].toLowerCase()];
    const day = parseInt(named[3], 10);
    if (!mon || Number.isNaN(y) || Number.isNaN(day)) return null;
    return isValidYmd(y, mon, day);
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso)
    return isValidYmd(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10),
      parseInt(iso[3], 10),
    );
  const triplet = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})$/);
  if (triplet)
    return parseNumericTripletDate(triplet[1], triplet[3], triplet[4]);
  return null;
}

function applyDate(value: string, outputFormat: string): string | null {
  const cleaned = value
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .trim();
  const parts = parseToCalendarParts(cleaned);
  if (!parts) return null; // unparseable -- validation failure
  const mm = String(parts.m).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  switch (outputFormat) {
    case "YYYY-MM-DD":
      return `${parts.y}-${mm}-${dd}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${parts.y}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${parts.y}`;
    default:
      return `${parts.y}-${mm}-${dd}`;
  }
}

// --- Canonicalize ---

function applyCanonicalize(value: string, canonicalize: string): string | null {
  const ops = canonicalize.split("|").map((op) => op.trim());
  let result: string | null = value;
  for (const op of ops) {
    if (result === null) return null;
    switch (op) {
      case "digits":
        result = result.replace(/\D/g, "");
        break;
      case "uppercase":
        result = result.toUpperCase();
        break;
      case "lowercase":
        result = result.toLowerCase();
        break;
      case "strip-spaces":
        result = result.replace(/\s/g, "");
        break;
      case "text":
        result = result
          .replace(/\s+/g, " ")
          .replace(/ +([.,;:!?])/g, "$1")
          .trim();
        break;
      case "number":
        result = result.replace(/[£$€¥,\s]/g, "");
        break;
      case "noop":
        break;
      default:
        if (op.startsWith("date:")) {
          const outputFormat = op.slice(5);
          result = applyDate(result, outputFormat);
        }
    }
  }
  return result;
}

/**
 * Validate a field value against a format spec.
 * Returns null if valid, or an error message string if invalid.
 * Compatible with Mantine's error prop signature.
 *
 * Validation fails if:
 * - Canonicalization fails (e.g., unparseable date returns null)
 * - Canonicalized value doesn't match the pattern regex (when pattern is set)
 */
export function validateFieldValue(
  value: string,
  spec: FormatSpec,
): string | null {
  if (!value) return null;
  const canonicalized = applyCanonicalize(value, spec.canonicalize);
  if (canonicalized === null) {
    return "Value could not be parsed in the expected format";
  }
  if (!spec.pattern) return null;
  const regex = new RegExp(spec.pattern);
  if (regex.test(canonicalized)) return null;
  return "Value does not match expected pattern";
}

/**
 * Build a map of field_key -> validator function from field definitions.
 * Fields with a parseable format_spec get validators. Validation catches:
 * - Canonicalization failures (e.g., unparseable dates)
 * - Pattern mismatches (when pattern is defined)
 */
export function buildFieldValidators(
  fieldDefs: Array<{ field_key: string; format_spec?: string | null }>,
): Record<string, ((value: string) => string | null) | undefined> {
  const validators: Record<
    string,
    ((value: string) => string | null) | undefined
  > = {};
  for (const fd of fieldDefs) {
    const spec = parseFormatSpec(fd.format_spec ?? null);
    if (spec) {
      validators[fd.field_key] = (value: string) =>
        validateFieldValue(value, spec);
    }
  }
  return validators;
}
