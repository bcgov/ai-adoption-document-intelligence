/**
 * Field Format Engine — normalizes OCR field values based on user-defined format specs.
 * Pure functions with no DB/Node dependencies.
 */

import { parseToCalendarParts } from "./form-field-normalization";

export interface FormatSpec {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

/**
 * Parse a JSON string into a FormatSpec. Returns null if:
 * - input is null or empty
 * - input is not valid JSON
 * - parsed object is missing a string `canonicalize` field
 */
export function parseFormatSpec(raw: string | null): FormatSpec | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).canonicalize !== "string"
  ) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const spec: FormatSpec = { canonicalize: obj.canonicalize as string };
  if (typeof obj.pattern === "string") {
    spec.pattern = obj.pattern;
  }
  if (typeof obj.displayTemplate === "string") {
    spec.displayTemplate = obj.displayTemplate;
  }
  return spec;
}

type DateOutputFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

function applyDateOp(value: string, outputFormat: DateOutputFormat): string {
  const cleaned = value
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .trim();
  const parts = parseToCalendarParts(cleaned);
  if (!parts) return value;
  const yyyy = String(parts.y).padStart(4, "0");
  const mm = String(parts.m).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  switch (outputFormat) {
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
  }
}

function applySingleOp(value: string, op: string): string {
  if (op === "digits") {
    return value.replace(/\D/g, "");
  }
  if (op === "uppercase") {
    return value.toUpperCase();
  }
  if (op === "lowercase") {
    return value.toLowerCase();
  }
  if (op === "strip-spaces") {
    return value.replace(/\s/g, "");
  }
  if (op === "text") {
    return value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1");
  }
  if (op === "number") {
    return value.replace(/[£$€¥,\s]/g, "");
  }
  if (op === "noop") {
    return value;
  }
  if (op.startsWith("date:")) {
    const fmt = op.slice(5) as DateOutputFormat;
    return applyDateOp(value, fmt);
  }
  // Unknown op — pass through
  return value;
}

/**
 * Apply canonicalization transform(s) to value. Operations are separated by `|`
 * and applied left to right.
 */
export function canonicalize(value: string, spec: FormatSpec): string {
  const ops = spec.canonicalize.split("|");
  return ops.reduce((v, op) => applySingleOp(v, op.trim()), value);
}

/**
 * Canonicalize then test against the pattern regex.
 * Returns `{ valid: true }` when there is no pattern or value is empty.
 */
export function validate(
  value: string,
  spec: FormatSpec,
): { valid: boolean; message?: string } {
  const canonical = canonicalize(value, spec);
  if (!spec.pattern || canonical === "") {
    return { valid: true };
  }
  const regex = new RegExp(spec.pattern);
  if (regex.test(canonical)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Value "${canonical}" does not match expected pattern ${spec.pattern}`,
  };
}

/**
 * Count placeholder characters (`#` for digit, `A` for letter) in a template.
 */
function countPlaceholders(template: string): number {
  let count = 0;
  for (const ch of template) {
    if (ch === "#" || ch === "A") count++;
  }
  return count;
}

/**
 * Canonicalize then apply displayTemplate.
 * `#` matches a digit placeholder, `A` matches a letter placeholder.
 * If placeholder count does not equal canonicalized length, returns canonical value.
 */
export function format(value: string, spec: FormatSpec): string {
  const canonical = canonicalize(value, spec);
  if (!spec.displayTemplate || canonical === "") {
    return canonical;
  }
  const template = spec.displayTemplate;
  if (countPlaceholders(template) !== canonical.length) {
    return canonical;
  }
  let result = "";
  let charIndex = 0;
  for (const ch of template) {
    if (ch === "#" || ch === "A") {
      result += canonical[charIndex++] ?? "";
    } else {
      result += ch;
    }
  }
  return result;
}
