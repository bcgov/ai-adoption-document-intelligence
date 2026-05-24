/**
 * Nominal subtype-check for typed-I/O artifact kinds (US-091).
 *
 * `isAssignable(from, to)` returns `true` iff a value of kind `from` can be
 * supplied where a port/ctx of kind `to` is expected. The check walks the
 * `baseKind` chain in the live artifact registry, with three deliberate
 * concessions documented in TYPED_IO_DESIGN.md §6:
 *
 *   1. Cardinality is strict — `"T"` and `"T[]"` are NOT mutually assignable
 *      in either direction (no auto-wrap, no auto-unwrap).
 *   2. Unknown kinds (not in the live registry) collapse to the `Artifact`
 *      wildcard — compatible in BOTH directions. This keeps legacy /
 *      typo'd kind strings from blocking saves while validators iterate.
 *   3. `undefined` on either side also collapses to `Artifact` — declaring
 *      no `kind?` means "no opinion", which is the universal wildcard.
 *
 * The implementation is intentionally not memoised: the picker walks at
 * most a few dozen variables and the validator walks a few dozen ports
 * per save, so correctness over a fresh registry view beats stale caches.
 */

import { getArtifactKindMeta } from "./artifact-registry";

/**
 * Does a value of kind `from` satisfy a port declared as kind `to`?
 *
 * - Either argument `undefined` → both default to the `Artifact` wildcard,
 *   returns `true`.
 * - Identity short-circuits — `from === to` returns `true` for any string.
 * - Otherwise both kinds are split into `{ element, isArray }`; cardinality
 *   must match, then `element` walks `from`'s `baseKind` chain looking for
 *   `to`.
 */
export function isAssignable(
  from: string | undefined,
  to: string | undefined,
): boolean {
  // Undefined on either side → both collapse to Artifact wildcard.
  if (from === undefined || to === undefined) return true;

  // Identity short-circuit covers `"Segment<Table>" === "Segment<Table>"`
  // and `"Document[]" === "Document[]"` before any parsing happens.
  if (from === to) return true;

  const fromParsed = parseKind(from);
  const toParsed = parseKind(to);

  // Cardinality mismatch — no auto-wrap (`T` → `T[]`) and no auto-unwrap
  // (`T[]` → `T`). See Scenario 3.
  if (fromParsed.isArray !== toParsed.isArray) return false;

  return isElementAssignable(fromParsed.element, toParsed.element);
}

interface ParsedKind {
  element: string;
  isArray: boolean;
}

/**
 * Splits a kind string into `{ element, isArray }`. `"Document[]"` →
 * `{ element: "Document", isArray: true }`. Non-array forms pass through
 * unchanged. The `[]` suffix is the only cardinality marker — anything
 * else (e.g. `"Segment<Table>"`) is treated as the element name as-is so
 * the registry lookup hits the parameterised entry directly.
 */
function parseKind(kind: string): ParsedKind {
  if (kind.endsWith("[]")) {
    return { element: kind.slice(0, -2), isArray: true };
  }
  return { element: kind, isArray: false };
}

/**
 * Element-wise subtype walk for the registry. Caller has already checked
 * identity and cardinality, so this only handles the unequal element case.
 *
 * Unknown-kind handling (Scenario 4) deliberately splits on whether the
 * unknown side is the literal string `"Artifact"`:
 *   - If `to` is missing from the registry AND is not `"Artifact"`, treat
 *     it as a wildcard target → `true`.
 *   - If `from` is missing AND is not `"Artifact"`, treat it as a wildcard
 *     producer → `true`.
 *
 * This keeps Scenario 5's `isAssignable("Artifact", "Document")` → `false`
 * working: `"Artifact"` is in the registry, so the wildcard branch never
 * fires for it, and the baseKind walk from `"Artifact"` finds no match.
 */
function isElementAssignable(from: string, to: string): boolean {
  const fromMeta = getArtifactKindMeta(from);
  const toMeta = getArtifactKindMeta(to);

  // Unknown `to` is a wildcard target — anything is assignable to it.
  if (toMeta === undefined) return true;

  // Unknown `from` is a wildcard producer — assignable to anything.
  if (fromMeta === undefined) return true;

  // Walk the registry's `baseKind` chain from `from` upward looking for
  // `to`. Identity was already handled by the caller, but we still seed
  // the loop at `from` because it makes the termination condition uniform.
  let cursor: string | undefined = from;
  while (cursor !== undefined) {
    if (cursor === to) return true;
    const meta = getArtifactKindMeta(cursor);
    cursor = meta?.baseKind;
  }
  return false;
}
