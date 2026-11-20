/**
 * Nominal subtype-check for typed-I/O artifact kinds (US-091).
 *
 * `isAssignable(from, to)` returns `true` iff a value of kind `from` can be
 * supplied where a port/ctx of kind `to` is expected. The check walks the
 * `baseKind` chain in the live artifact registry, with three deliberate
 * concessions documented in TYPED_IO_DESIGN.md §6:
 *
 *   1. Cardinality is strict — `"T"`, `"T[]"`, and `"T[][]"` are all
 *      distinct and NOT mutually assignable (no auto-wrap, no auto-unwrap,
 *      and nesting depth must match exactly — `T[][]` is not a `T[]`).
 *   2. The ONLY permissive ("wildcard") signals are the in-registry root
 *      kind `Artifact` (everything is an `Artifact`) and an `undefined`
 *      kind (declaring no `kind?` means "no opinion"). An unrecognised /
 *      typo'd kind string is NOT a wildcard — per TYPED_IO_DESIGN.md §8
 *      ("No silent fallback to Artifact"), an unknown kind fails closed so
 *      a typo can't silently disable type checking.
 *   3. `undefined` on either side collapses to the universal wildcard.
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
 * - Otherwise both kinds are split into `{ element, arrayDepth }`; array
 *   nesting depth must match exactly, then `element` walks `from`'s
 *   `baseKind` chain looking for `to`.
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

  // Cardinality mismatch — no auto-wrap (`T` → `T[]`), no auto-unwrap
  // (`T[]` → `T`), and nesting depth must match exactly so a `T[][]`
  // producer is NOT assignable to a `T[]` consumer. See Scenario 3.
  if (fromParsed.arrayDepth !== toParsed.arrayDepth) return false;

  return isElementAssignable(fromParsed.element, toParsed.element);
}

interface ParsedKind {
  element: string;
  arrayDepth: number;
}

/**
 * Splits a kind string into `{ element, arrayDepth }`. `"Document[]"` →
 * `{ element: "Document", arrayDepth: 1 }`; `"Document[][]"` →
 * `{ element: "Document", arrayDepth: 2 }`. Each trailing `[]` adds one
 * level of nesting, so cardinality comparison stays exact at arbitrary
 * depth. The `[]` suffix is the only cardinality marker — anything inside
 * the element name (e.g. `"Segment<Table>"`) is treated as the element
 * name as-is so the registry lookup hits the parameterised entry directly.
 */
function parseKind(kind: string): ParsedKind {
  let element = kind;
  let arrayDepth = 0;
  while (element.endsWith("[]")) {
    element = element.slice(0, -2);
    arrayDepth += 1;
  }
  return { element, arrayDepth };
}

/**
 * Element-wise subtype walk for the registry. Caller has already checked
 * identity and cardinality, so this only handles the unequal element case.
 *
 * Unknown-kind handling fails CLOSED per TYPED_IO_DESIGN.md §8 ("No silent
 * fallback to Artifact"): a kind string not present in the live registry is
 * an unrecognised / typo'd kind, NOT a wildcard. If either side is unknown
 * (and — given identity was already ruled out by the caller — the two sides
 * therefore differ), the value is not assignable to an unrelated concrete
 * kind. The only permissive signals are the in-registry root `Artifact`
 * (reached via the normal baseKind walk below) and an `undefined` kind
 * (handled by the caller). This keeps a typo like `"Docment"` from silently
 * disabling type checking.
 */
function isElementAssignable(from: string, to: string): boolean {
  const fromMeta = getArtifactKindMeta(from);
  const toMeta = getArtifactKindMeta(to);

  // Unrecognised kind on either side → fail closed (no silent wildcard).
  if (fromMeta === undefined || toMeta === undefined) return false;

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
