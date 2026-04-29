import { IterationResult } from "./binding-resolver";

/** Structured error thrown when JSON output rendering fails. */
export class JsonRenderError extends Error {
  constructor(public readonly detail: string) {
    super(`Failed to render JSON output: ${detail}`);
    this.name = "JsonRenderError";
  }
}

/**
 * Recursively converts {@link IterationResult} instances to plain arrays so
 * that `JSON.stringify` serialises them as JSON arrays rather than objects.
 *
 * @param value - Any value from the resolved mapping.
 * @returns The value with all `IterationResult` instances replaced by arrays.
 */
function preprocessForJson(value: unknown): unknown {
  if (value instanceof IterationResult) {
    return value.items.map((item) => preprocessForJson(item));
  }
  if (Array.isArray(value)) {
    return value.map((item) => preprocessForJson(item));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = preprocessForJson(v);
    }
    return result;
  }
  return value;
}

/**
 * Renders a resolved field mapping object to a valid JSON string.
 *
 * {@link IterationResult} values produced by the binding resolver are
 * serialised as JSON arrays, with one entry per iteration element.
 *
 * @param resolvedMapping - The field mapping with all binding expressions
 *   already resolved by the binding resolver.
 * @returns A valid JSON string produced by `JSON.stringify`.
 * @throws {JsonRenderError} If the mapping cannot be serialized (e.g., circular references).
 */
export function renderJson(resolvedMapping: Record<string, unknown>): string {
  try {
    return JSON.stringify(preprocessForJson(resolvedMapping));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new JsonRenderError(detail);
  }
}
