/** Structured error thrown when a binding expression cannot be resolved. */
export class BindingResolutionError extends Error {
  constructor(public readonly path: string) {
    super(`Unresolved binding: "${path}"`);
    this.name = "BindingResolutionError";
  }
}

const WHOLE_BINDING_PATTERN = /^\{\{([^}]+)\}\}$/;
const INLINE_BINDING_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Resolves a dot-separated binding path against the upstream node context.
 *
 * @param path - A dot-separated path where the first segment is the node ID
 *   (e.g., `"extractionNode.payload.header.userId"`).
 * @param context - A record of all prior node outputs keyed by node ID.
 * @returns The value found at the given path.
 * @throws {BindingResolutionError} If any segment in the path is missing or
 *   the traversal cannot continue.
 */
function resolveBindingPath(
  path: string,
  context: Record<string, unknown>,
): unknown {
  const segments = path.split(".");
  let value: unknown = context;

  for (const segment of segments) {
    if (value === null || typeof value !== "object") {
      throw new BindingResolutionError(path);
    }
    const next = (value as Record<string, unknown>)[segment];
    if (next === undefined) {
      throw new BindingResolutionError(path);
    }
    value = next;
  }

  return value;
}

/**
 * Resolves binding expressions within a single string value.
 *
 * - If the entire string is one binding expression (e.g., `"{{node.field}}"`),
 *   the resolved value is returned as its original type (string, number, object,
 *   etc.).
 * - If the string contains one or more inline bindings mixed with literal text,
 *   each binding is replaced by its `String()` coercion and a string is returned.
 * - If the string contains no binding expressions it is returned unchanged.
 *
 * @param value - The raw mapping value to process.
 * @param context - A record of all prior node outputs keyed by node ID.
 * @returns The resolved value.
 * @throws {BindingResolutionError} If any binding path cannot be resolved.
 */
function resolveStringValue(
  value: string,
  context: Record<string, unknown>,
): unknown {
  // Whole-value binding — preserve the original type of the resolved value.
  const wholeMatch = WHOLE_BINDING_PATTERN.exec(value);
  if (wholeMatch) {
    return resolveBindingPath(wholeMatch[1].trim(), context);
  }

  // Inline binding(s) mixed with literal text — coerce to strings.
  let hasBinding = false;
  const result = value.replace(INLINE_BINDING_PATTERN, (_, path: string) => {
    hasBinding = true;
    return String(resolveBindingPath(path.trim(), context));
  });

  return hasBinding ? result : value;
}

/**
 * Recursively walks a field mapping object and resolves all `{{...}}` binding
 * expressions in leaf string values against the upstream node context.
 *
 * - Leaf strings are processed by {@link resolveStringValue}.
 * - Nested plain objects are walked recursively.
 * - Array items that are strings or plain objects are also processed.
 * - All other value types (numbers, booleans, null) are passed through as-is.
 *
 * @param mapping - The field mapping object whose values may contain bindings.
 * @param context - A record of all prior node outputs keyed by node ID.
 * @returns A new object with every binding replaced by its resolved value.
 * @throws {BindingResolutionError} If any binding path cannot be resolved.
 */
export function resolveBindings(
  mapping: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(mapping)) {
    resolved[key] = resolveValue(value, context);
  }

  return resolved;
}

/**
 * Resolves a single mapping value of arbitrary type.
 *
 * @param value - The raw value from the field mapping (any type).
 * @param context - A record of all prior node outputs keyed by node ID.
 * @returns The value with all bindings resolved.
 * @throws {BindingResolutionError} If any binding path cannot be resolved.
 */
function resolveValue(
  value: unknown,
  context: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return resolveStringValue(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  if (value !== null && typeof value === "object") {
    return resolveBindings(value as Record<string, unknown>, context);
  }

  return value;
}
