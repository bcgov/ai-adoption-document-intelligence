/** Structured error thrown when a binding expression cannot be resolved. */
export class BindingResolutionError extends Error {
  constructor(public readonly path: string) {
    super(`Unresolved binding: "${path}"`);
    this.name = "BindingResolutionError";
  }
}

/**
 * Structured error thrown when an iteration block's array path cannot be
 * resolved or does not point to an array value.
 */
export class IterationResolutionError extends Error {
  constructor(public readonly path: string) {
    super(`Cannot iterate: path "${path}" does not resolve to an array`);
    this.name = "IterationResolutionError";
  }
}

/**
 * Represents the resolved output of a `{{#each}}` iteration block.
 * Holds one resolved record per element of the source array.
 */
export class IterationResult {
  constructor(public readonly items: Record<string, unknown>[]) {}
}

const WHOLE_BINDING_PATTERN = /^\{\{([^}]+)\}\}$/;
const INLINE_BINDING_PATTERN = /\{\{([^}]+)\}\}/g;

/** Matches the opening marker of an iteration block: `{{#each arrayPath}}`. */
const EACH_KEY_PATTERN = /^\{\{#each\s+(.+?)\}\}$/;

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
 * - Nested plain objects that are iteration blocks are resolved by
 *   {@link resolveIterationBlock}, returning an {@link IterationResult}.
 * - Other nested plain objects are walked recursively.
 * - Array items that are strings or plain objects are also processed.
 * - All other value types (numbers, booleans, null) are passed through as-is.
 *
 * @param mapping - The field mapping object whose values may contain bindings.
 * @param context - A record of all prior node outputs keyed by node ID.
 * @returns A new object with every binding replaced by its resolved value.
 * @throws {BindingResolutionError} If any binding path cannot be resolved.
 * @throws {IterationResolutionError} If an iteration block's array path cannot be resolved.
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
 * @throws {IterationResolutionError} If an iteration block's array path cannot be resolved.
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
    const obj = value as Record<string, unknown>;
    if (isIterationBlock(obj)) {
      return resolveIterationBlock(obj, context);
    }
    return resolveBindings(obj, context);
  }

  return value;
}

/**
 * Returns true if the given object is an iteration block, i.e. it contains
 * a key matching `{{#each arrayPath}}`.
 *
 * @param obj - The object to inspect.
 */
function isIterationBlock(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((key) => EACH_KEY_PATTERN.test(key));
}

/**
 * Builds the binding context for a single iteration element.
 *
 * The resulting context merges:
 * - All entries from the outer (enclosing) context.
 * - The element's own fields, enabling the shorthand `{{fieldName}}` syntax.
 * - A `this` key pointing to the element record, enabling `{{this.fieldName}}`.
 *
 * @param element - The current array element.
 * @param outerContext - The enclosing binding context.
 * @returns A new context object for this iteration step.
 */
function buildElementContext(
  element: unknown,
  outerContext: Record<string, unknown>,
): Record<string, unknown> {
  const elementRecord =
    element !== null && typeof element === "object" && !Array.isArray(element)
      ? (element as Record<string, unknown>)
      : {};
  return {
    ...outerContext,
    ...elementRecord, // shorthand: {{fieldName}} resolves to the current element's field
    this: elementRecord, // {{this.fieldName}} access — must be set last to win over spread
  };
}

/**
 * Resolves an iteration block (an object whose key matches `{{#each arrayPath}}`)
 * against the current context.
 *
 * For each element of the resolved array the template (the value associated
 * with the `{{#each ...}}` key) is resolved with a context that makes the
 * element's fields available via `{{this.field}}` and the shorthand
 * `{{field}}`.
 *
 * @param obj - The object containing the `{{#each ...}}` key.
 * @param context - The current binding context.
 * @returns An {@link IterationResult} with one resolved record per array element.
 * @throws {IterationResolutionError} If the array path cannot be resolved or
 *   does not point to an array value.
 */
function resolveIterationBlock(
  obj: Record<string, unknown>,
  context: Record<string, unknown>,
): IterationResult {
  const eachKey = Object.keys(obj).find((key) => EACH_KEY_PATTERN.test(key));
  if (!eachKey) {
    throw new Error(
      "Internal error: resolveIterationBlock called on non-iteration object",
    );
  }

  const match = EACH_KEY_PATTERN.exec(eachKey);
  const arrayPath = match![1].trim();

  let array: unknown;
  try {
    array = resolveBindingPath(arrayPath, context);
  } catch {
    throw new IterationResolutionError(arrayPath);
  }

  if (!Array.isArray(array)) {
    throw new IterationResolutionError(arrayPath);
  }

  if (array.length === 0) {
    return new IterationResult([]);
  }

  const template = obj[eachKey];
  const items: Record<string, unknown>[] = array.map((element) => {
    const elementContext = buildElementContext(element, context);
    if (
      template !== null &&
      typeof template === "object" &&
      !Array.isArray(template)
    ) {
      return resolveBindings(
        template as Record<string, unknown>,
        elementContext,
      );
    }
    return {};
  });

  return new IterationResult(items);
}
