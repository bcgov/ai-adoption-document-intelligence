/**
 * US-150 — `summariseInputCtx` helper.
 *
 * Produces a compact, display-friendly summary of a workflow run's
 * `initialCtx` object so the `RunHistoryDrawer` can render a one-line chip
 * per row without forcing the consumer to inspect arbitrarily large
 * blackboard payloads.
 *
 * Rules (REQUIREMENTS.md L22, TRY_IN_PLACE_DESIGN.md §6.1):
 *   - Take the FIRST 4 top-level keys (insertion order).
 *   - String values are truncated to 80 characters (with `…` suffix when cut).
 *   - Document-shaped values (objects carrying a `blobKey` string) are
 *     rendered as `"Document(<storage_key tail>)"` — the tail is the
 *     final path segment of the storage key.
 *   - Nested objects render as `"{...}"`; arrays render as `"[N items]"`.
 *   - Other primitives (number, boolean, null) pass through.
 *   - Pure function — no I/O, no side effects.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L22
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.1
 */

const MAX_TOP_LEVEL_KEYS = 4;
const STRING_TRUNCATION_LIMIT = 80;

/** Narrow runtime check for the Document-shaped values we render specially. */
function isDocumentLike(value: unknown): value is { blobKey: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { blobKey?: unknown }).blobKey === "string"
  );
}

/** Final path segment of a Document's `blobKey` — slash- or backslash-separated. */
function storageKeyTail(blobKey: string): string {
  // Strip any trailing slashes first so `dir/` -> `dir`, not "".
  const trimmed = blobKey.replace(/[/\\]+$/u, "");
  const lastSlash = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

function summariseValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    if (value.length <= STRING_TRUNCATION_LIMIT) {
      return value;
    }
    return `${value.slice(0, STRING_TRUNCATION_LIMIT)}…`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    if (isDocumentLike(value)) {
      return `Document(${storageKeyTail(value.blobKey)})`;
    }
    return "{...}";
  }
  // Fallback for symbols / functions / bigints — coerce to string so the
  // summary stays serialisable and bounded.
  return String(value);
}

/**
 * Returns a compact summary of `ctx`, capped at the first 4 top-level keys.
 *
 * @param ctx The workflow's `initialCtx` blackboard (or any record).
 * @returns A new object with up to 4 entries, each value compacted per the
 *          rules above. Top-level key insertion order is preserved.
 */
export function summariseInputCtx(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let taken = 0;
  for (const key of Object.keys(ctx)) {
    if (taken >= MAX_TOP_LEVEL_KEYS) {
      break;
    }
    out[key] = summariseValue(ctx[key]);
    taken++;
  }
  return out;
}
