/**
 * Canonical JSON serialiser used to build deterministic cache keys.
 *
 * Two logically-identical inputs (same primitives / same arrays /
 * same object properties, regardless of key insertion order) MUST
 * produce the same string output so that downstream `sha256` hashes
 * match. This invariant is the foundation for `configHash` (L12) and
 * `inputHash` (L13) in the activity-output cache (Phase 4).
 *
 * Contract:
 * - Object keys are sorted alphabetically (ascending, code-point order
 *   via `Array.prototype.sort` with default comparator); nested objects
 *   are canonicalised recursively.
 * - Array element order is preserved verbatim; elements are themselves
 *   canonicalised recursively.
 * - Primitives (string / number / boolean) and `null` serialise via
 *   `JSON.stringify`.
 * - `undefined` at the top level returns `"null"` (parity with
 *   `JSON.stringify(undefined)` returning `undefined`, normalised here
 *   so downstream hashing always has a string to consume).
 * - `undefined` as an object property value is omitted (parity with
 *   `JSON.stringify`).
 * - Symbol values are omitted from objects (parity with `JSON.stringify`);
 *   a top-level symbol returns `"null"`.
 * - Function values are omitted from objects (parity with `JSON.stringify`);
 *   a top-level function returns `"null"`.
 * - No insignificant whitespace: no spaces after `:` or `,`, no newlines.
 *
 * Pure function — no I/O, no closures, no module-level state.
 *
 * See `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.3 for the
 * design rationale (canonical-JSON-as-cache-key-foundation).
 */
export function stableJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return "null";
  }

  if (Array.isArray(value)) {
    const parts: string[] = value.map((element) => {
      // Inside arrays, `undefined`, symbol, and function elements all
      // serialise to "null" — matching `JSON.stringify([undefined])` → "[null]".
      if (
        element === undefined ||
        typeof element === "symbol" ||
        typeof element === "function"
      ) {
        return "null";
      }
      return stableJson(element);
    });
    return `[${parts.join(",")}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      const childValue = obj[key];
      // Object properties whose value is `undefined`, a symbol, or a function
      // are omitted (parity with `JSON.stringify`).
      if (
        childValue === undefined ||
        typeof childValue === "symbol" ||
        typeof childValue === "function"
      ) {
        continue;
      }
      parts.push(`${JSON.stringify(key)}:${stableJson(childValue)}`);
    }
    return `{${parts.join(",")}}`;
  }

  // bigint and other unhandled types — fall through to JSON.stringify
  // (which will throw for bigint, matching native semantics).
  return JSON.stringify(value);
}
