import { XMLBuilder } from "fast-xml-parser";

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
    }
  }
}

/**
 * Renders a resolved field mapping object to a valid XML string.
 *
 * Top-level mapping keys become child elements of the root element. Nested
 * plain objects produce nested XML elements. The output can be parsed by any
 * standard XML parser.
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
  rootElement = "Root",
): string {
  if (!XML_NAME_PATTERN.test(rootElement)) {
    throw new XmlRenderError(`Invalid XML root element name "${rootElement}"`);
  }

  validateElementNames(resolvedMapping);

  try {
    const builder = new XMLBuilder({ format: false });
    return builder.build({ [rootElement]: resolvedMapping });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new XmlRenderError(detail);
  }
}
