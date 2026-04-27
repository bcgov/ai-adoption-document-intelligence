import { XMLBuilder } from "fast-xml-parser";
import { IterationResult } from "./binding-resolver";

/** Regex pattern for valid XML element names. */
const XML_NAME_PATTERN = /^[a-zA-Z_][\w.-]*$/;

/** Structured error thrown when XML output rendering fails. */
export class XmlRenderError extends Error {
  constructor(public readonly detail: string) {
    super(`Failed to render XML output: ${detail}`);
    this.name = "XmlRenderError";
  }
}

/**
 * Converts an {@link IterationResult} into a merged object suitable for
 * `fast-xml-parser`'s `XMLBuilder`.
 *
 * Each key shared across iteration items is collected into an array, which
 * `XMLBuilder` renders as repeated sibling elements. If only one item exists
 * the values are kept as single entries (not wrapped in an array) so that the
 * single-element case still produces valid XML without redundant nesting.
 *
 * @param result - The iteration result to convert.
 * @returns A plain object with values grouped into arrays where more than one
 *   iteration item contributes to the same key.
 */
function mergeIterationResultForXml(
  result: IterationResult,
): Record<string, unknown> {
  if (result.items.length === 0) {
    return {};
  }

  const grouped: Record<string, unknown[]> = {};
  for (const item of result.items) {
    for (const [key, value] of Object.entries(item)) {
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(value);
    }
  }

  const merged: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(grouped)) {
    merged[key] = values.length === 1 ? values[0] : values;
  }
  return merged;
}

/**
 * Recursively replaces {@link IterationResult} values in a resolved mapping
 * with the merged-object representation expected by `XMLBuilder`.
 *
 * @param mapping - The resolved mapping that may contain `IterationResult` values.
 * @returns A new object with all `IterationResult` instances converted.
 */
function preprocessForXml(
  mapping: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value instanceof IterationResult) {
      result[key] = mergeIterationResultForXml(value);
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = preprocessForXml(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively validates that all keys in the mapping are valid XML element names.
 *
 * @param obj - The object whose keys to validate.
 * @param pathPrefix - Dot-separated path prefix used in error messages.
 * @throws {XmlRenderError} If any key is not a valid XML element name.
 */
function validateElementNames(
  obj: Record<string, unknown>,
  pathPrefix = "",
): void {
  for (const key of Object.keys(obj)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (!XML_NAME_PATTERN.test(key)) {
      throw new XmlRenderError(
        `Invalid XML element name "${key}" at path "${fullPath}"`,
      );
    }
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      validateElementNames(value as Record<string, unknown>, fullPath);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          validateElementNames(item as Record<string, unknown>, fullPath);
        }
      }
    }
  }
}

/**
 * Renders a resolved field mapping object to a valid XML string.
 *
 * Top-level mapping keys become child elements of the root element. Nested
 * plain objects produce nested XML elements. {@link IterationResult} values
 * produced by the binding resolver are rendered as repeated sibling XML child
 * elements. The output can be parsed by any standard XML parser.
 *
 * @param resolvedMapping - The field mapping with all binding expressions
 *   already resolved by the binding resolver.
 * @param rootElement - The name of the XML root element that wraps the output.
 *   Defaults to `"Root"`.
 * @returns A valid XML string.
 * @throws {XmlRenderError} If any mapping key (or the root element name) is
 *   not a valid XML element name, or if the builder otherwise fails to
 *   produce valid XML.
 */
export function renderXml(
  resolvedMapping: Record<string, unknown>,
  rootElement: string | null = "Root",
): string {
  if (rootElement !== null && !XML_NAME_PATTERN.test(rootElement)) {
    throw new XmlRenderError(`Invalid XML root element name "${rootElement}"`);
  }

  const preprocessed = preprocessForXml(resolvedMapping);
  validateElementNames(preprocessed);

  try {
    const builder = new XMLBuilder({ format: false });
    return rootElement === null
      ? builder.build(preprocessed)
      : builder.build({ [rootElement]: preprocessed });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new XmlRenderError(detail);
  }
}
