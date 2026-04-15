import { stringify } from "csv/sync";
import { IterationResult } from "./binding-resolver";

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
 * **Flat mapping**: The output contains two rows — a header row (the mapping
 * keys) and a data row (the mapping values). All values must be primitives.
 *
 * **Iteration mapping**: When the mapping contains an {@link IterationResult}
 * value produced by the binding resolver, the output contains a header row
 * (the iteration template's keys) followed by one data row per iteration
 * element. Non-primitive values within iteration items cause a
 * {@link CsvRenderError}.
 *
 * Values containing commas or double-quotes are quoted and escaped per
 * RFC 4180.
 *
 * @param resolvedMapping - The field mapping with all binding expressions
 *   already resolved by the binding resolver.
 * @returns A valid CSV string.
 * @throws {CsvRenderError} If any value is a complex object or if the
 *   underlying serializer fails for any reason.
 */
export function renderCsv(resolvedMapping: Record<string, unknown>): string {
  const iterationEntry = Object.entries(resolvedMapping).find(
    ([, value]) => value instanceof IterationResult,
  );

  if (iterationEntry) {
    const [, iterValue] = iterationEntry;
    const iteration = iterValue as IterationResult;

    if (iteration.items.length === 0) {
      return "";
    }

    for (const item of iteration.items) {
      for (const [key, value] of Object.entries(item)) {
        if (!isCsvPrimitive(value)) {
          throw new CsvRenderError(
            `Value for key "${key}" in iteration item is a non-primitive type (${typeof value}) and cannot be serialized to CSV`,
          );
        }
      }
    }

    try {
      return stringify(iteration.items as Record<string, CsvPrimitive>[], {
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
