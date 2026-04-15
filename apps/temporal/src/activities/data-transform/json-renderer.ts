/** Structured error thrown when JSON output rendering fails. */
export class JsonRenderError extends Error {
  constructor(public readonly detail: string) {
    super(`Failed to render JSON output: ${detail}`);
    this.name = "JsonRenderError";
  }
}

/**
 * Renders a resolved field mapping object to a valid JSON string.
 *
 * @param resolvedMapping - The field mapping with all binding expressions
 *   already resolved by the binding resolver.
 * @returns A valid JSON string produced by `JSON.stringify`.
 * @throws {JsonRenderError} If the mapping cannot be serialized (e.g., circular references).
 */
export function renderJson(resolvedMapping: Record<string, unknown>): string {
  try {
    return JSON.stringify(resolvedMapping);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new JsonRenderError(detail);
  }
}
