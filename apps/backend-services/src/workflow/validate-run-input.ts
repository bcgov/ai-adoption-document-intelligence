import type { InputJsonSchema } from "./derive-input-schema";

export interface RunInputValidationError {
  path: string;
  message: string;
}

/**
 * Validate a caller-supplied `initialCtx` against the workflow's
 * derived input schema. Used by `POST /api/workflows/:id/runs` to
 * reject 400-class errors before invoking Temporal.
 *
 * Track 2 enforces only the basics:
 *  - every `required` field is present
 *  - every provided field whose key matches a schema property has a
 *    JS `typeof` matching the schema's `type` (string / number /
 *    boolean / object / array)
 *
 * Extra properties (keys not in the schema) are permitted — workflows
 * may consume ad-hoc ctx beyond what's declared as inputs.
 *
 * Item 32: for library workflows the schema keys are the ctx ROOT keys
 * derived from each `LibraryPortDescriptor.path` leaf (see
 * `deriveLibraryInputKey`), so validating presence here checks the exact
 * key the caller must place in `initialCtx` and that the graph body then
 * reads from `ctx`.
 */
export function validateRunInput(
  schema: InputJsonSchema,
  initialCtx: Record<string, unknown>,
): RunInputValidationError[] {
  const errors: RunInputValidationError[] = [];

  for (const required of schema.required) {
    if (!(required in initialCtx)) {
      errors.push({
        path: required,
        message: `Missing required field "${required}"`,
      });
    }
  }

  for (const [key, value] of Object.entries(initialCtx)) {
    const property = schema.properties[key];
    if (!property) continue;

    const actual = jsTypeOf(value);
    if (actual !== property.type) {
      errors.push({
        path: key,
        message: `Field "${key}" must be of type ${property.type}, got ${actual}`,
      });
    }
  }

  return errors;
}

function jsTypeOf(
  value: unknown,
): "string" | "number" | "boolean" | "object" | "array" | "null" | "undefined" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (
    t === "string" ||
    t === "number" ||
    t === "boolean" ||
    t === "object" ||
    t === "undefined"
  ) {
    return t;
  }
  return "object";
}
