/**
 * Text ⇄ `CtxDeclaration.defaultValue` for the workflow-settings ctx editor
 * (P-5).
 *
 * The declared `type` decides how the field's text is read, because the two
 * halves of the ctx table would otherwise disagree: a `string` default typed
 * as JSON would demand quotes around every value (`"image"`, not `image`),
 * while a `number` default read as text would write `"3"` and fail
 * `validateRunInput`'s `typeof` check the moment the workflow ran.
 *
 * So: `string` takes the raw text verbatim; every other type parses as JSON
 * and is then checked against the declared type, which is the same contract
 * `FieldListEditor` applies to a `source.api` field's default. Blank means "no
 * default" (`undefined`), which is how `deriveInputSchema` tells a REQUIRED
 * caller-supplied input from one the workflow can fill in for itself.
 */

import type { CtxDeclaration } from "../../../types/workflow";

export type CtxDefaultValueParse =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

const TYPE_LABELS: Record<CtxDeclaration["type"], string> = {
  string: "a string",
  number: "a number",
  boolean: "true or false",
  object: "a JSON object",
  array: "a JSON array",
};

function matchesType(value: unknown, type: CtxDeclaration["type"]): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
  }
}

/**
 * Read the editor's text as a `defaultValue` of the declared type. A blank
 * field parses to `undefined` — the declaration then carries no default at
 * all, rather than an empty string that would look like one.
 */
export function parseCtxDefaultValue(
  raw: string,
  type: CtxDeclaration["type"],
): CtxDefaultValueParse {
  if (raw.trim() === "") return { ok: true, value: undefined };
  if (type === "string") return { ok: true, value: raw };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!matchesType(parsed, type)) {
    return { ok: false, error: `Expected ${TYPE_LABELS[type]}` };
  }
  return { ok: true, value: parsed };
}

/**
 * Render a stored `defaultValue` back into the editor's text. The inverse of
 * {@link parseCtxDefaultValue} for every value that function can produce; a
 * value whose shape no longer matches the declared type (the author retyped
 * the row after setting a default) is shown as JSON so it stays visible and
 * fixable rather than silently blanking.
 */
export function formatCtxDefaultValue(
  value: unknown,
  type: CtxDeclaration["type"],
): string {
  if (value === undefined) return "";
  if (type === "string" && typeof value === "string") return value;
  return JSON.stringify(value);
}
