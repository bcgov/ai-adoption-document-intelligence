import { stringify } from "csv/sync";

/** Structured error thrown when CSV output rendering fails. */
export class CsvRenderError extends Error {
  constructor(public readonly detail: string) {
    super(`Failed to render CSV output: ${detail}`);
    this.name = "CsvRenderError";
  }
}

/** Primitive types that can be safely serialized into a CSV cell. */
type CsvPrimitive = string | number | boolean | null | undefined;

/**
 * Returns true if the given value can be serialized directly into a CSV cell.
 *
 * @param value - The value to check.
 */
function isCsvPrimitive(value: unknown): value is CsvPrimitive {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * Renders a resolved field mapping object to a valid CSV string.
 *
 * The output always contains two rows: a header row (the mapping keys) and a
 * data row (the mapping values). Values containing commas or double-quotes are
 * quoted and escaped per RFC 4180.
 *
 * Nested objects (plain objects or arrays) are not supported and will cause a
 * {@link CsvRenderError} to be thrown. All values must be primitives
 * (string, number, boolean, null, or undefined).
 *
 * @param resolvedMapping - The field mapping with all binding expressions
 *   already resolved by the binding resolver.
 * @returns A valid two-row CSV string (headers + data).
 * @throws {CsvRenderError} If any value is a complex object or if the
 *   underlying serializer fails for any reason.
 */
export function renderCsv(resolvedMapping: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(resolvedMapping)) {
    if (!isCsvPrimitive(value)) {
      throw new CsvRenderError(
        `Value for key "${key}" is a non-primitive type (${typeof value}) and cannot be serialized to CSV; use iteration or pre-process the value before rendering`,
      );
    }
  }

  try {
    return stringify([resolvedMapping as Record<string, CsvPrimitive>], {
      header: true,
      cast: {
        boolean: (value) => String(value),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CsvRenderError(detail);
  }
}
