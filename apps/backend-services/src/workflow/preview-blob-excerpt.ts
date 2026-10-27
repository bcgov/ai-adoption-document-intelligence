/**
 * Bounded excerpting of a blob-backed preview payload (G-022).
 *
 * `OcrResultSchema` is deliberately a blob POINTER — `{documentId, blobPath,
 * storage:"blob", …}` — so that large OCR payloads never enter workflow ctx or
 * Temporal history. That decision stands. What was broken is that the PREVIEW
 * showed the pointer, so an author could not answer "did this step work?" by
 * looking at the step's output, and the whole bisect-by-intermediate-value
 * debugging method collapsed at the first OCR node.
 *
 * The fix is to dereference at preview time, **server-side and bounded**:
 *
 *   - server-side, because the browser holds no blob credentials, the
 *     preview-cache endpoint is already authorised for the workflow's group,
 *     and a multi-megabyte payload must never cross the wire; and
 *   - bounded, because an OCR payload for a 300-page document is enormous.
 *     A 300-page `OCRResult` carries a `pages[]` with per-word polygons and a
 *     full `extractedText`. Unbounded, a preview of it would look fine on a
 *     one-page test document and fall over in production.
 *
 * **Bounding is a correctness requirement, not an optimisation.** Every limit
 * this module applies is REPORTED back in `omissions`, so the UI can say
 * "showing the first N of M" rather than silently presenting part of the data
 * as if it were all of it.
 */

/** The structural limits applied to a single payload. */
export interface ExcerptLimits {
  /** Longest string value kept verbatim; longer values are prefix-truncated. */
  maxStringChars: number;
  /** Most array items kept at any one array. */
  maxArrayItems: number;
  /** Most object keys kept at any one object. */
  maxObjectKeys: number;
  /** Deepest nesting walked; deeper subtrees are dropped wholesale. */
  maxDepth: number;
  /** Total character budget across the whole excerpt. */
  maxTotalChars: number;
}

/**
 * Chosen against the real payload shapes (`OCRResult` / `OCRResponse` in
 * apps/temporal/src/types.ts):
 *
 *   - `maxStringChars: 400` — enough to recognise a field value or the start
 *     of `extractedText` / `markdown`, far short of a whole page of text.
 *   - `maxArrayItems: 5` — `pages`, `tables`, `paragraphs`, `keyValuePairs`
 *     and `documents` are all unbounded arrays; five is enough to see the
 *     shape and the first results.
 *   - `maxObjectKeys: 40` — a custom-model `fields` object is the widest
 *     object an author actually reads; 40 covers every shipped model.
 *   - `maxDepth: 6` — chosen from the ONE path that has to survive:
 *     `analyzeResult.documents[0].fields.<name>.content`, the extracted field
 *     value. Counting from the root that is depth 5, and the `<name>` object
 *     itself must be entered to reach it, so 6. (A first attempt at 4 cut the
 *     excerpt off at `fields: {}` — i.e. it produced a preview that looked
 *     fine and contained none of the values the whole fix exists to show.)
 *   - `maxTotalChars: 8000` — the hard ceiling. Even a pathological payload
 *     that defeats every structural limit cannot produce a response bigger
 *     than roughly this per blob; the batch endpoint's per-request blob cap
 *     bounds the whole response at ~16× that.
 */
export const DEFAULT_EXCERPT_LIMITS: Readonly<ExcerptLimits> = Object.freeze({
  maxStringChars: 400,
  maxArrayItems: 5,
  maxObjectKeys: 40,
  maxDepth: 6,
  maxTotalChars: 8000,
});

/**
 * Largest blob we will read and parse (8 MiB). A larger payload is reported as
 * unavailable with its size rather than pulled into the API process — the
 * point of the pointer model is that these can be huge.
 */
export const MAX_EXCERPT_BLOB_BYTES = 8 * 1024 * 1024;

/**
 * Most blobs dereferenced for a single request. The batch endpoint covers every
 * node in a lineage, so without this an OCR-heavy workflow would issue one blob
 * read per node on every preview poll. Blobs beyond the cap are REPORTED as
 * skipped, never silently omitted.
 */
export const MAX_EXCERPT_BLOBS_PER_REQUEST = 16;

export interface BoundedExcerpt {
  /** The bounded projection of the payload. */
  value: unknown;
  /** True when anything at all was left out. */
  truncated: boolean;
  /**
   * Human-readable, path-anchored notes for everything omitted, e.g.
   * `pages: showing the first 5 of 312 items`. The UI renders these verbatim.
   */
  omissions: string[];
}

interface WalkState {
  spent: number;
  omissions: string[];
  limits: ExcerptLimits;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function label(path: string): string {
  return path === "" ? "the payload" : path;
}

function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/** Charge `cost` characters against the total budget. */
function charge(state: WalkState, cost: number): boolean {
  if (state.spent + cost > state.limits.maxTotalChars) return false;
  state.spent += cost;
  return true;
}

interface WalkResult {
  kept: boolean;
  value?: unknown;
}

const DROPPED: WalkResult = { kept: false };

function walk(
  value: unknown,
  path: string,
  depth: number,
  state: WalkState,
): WalkResult {
  const { limits } = state;

  if (typeof value === "string") {
    if (value.length > limits.maxStringChars) {
      const kept = `${value.slice(0, limits.maxStringChars)}…`;
      if (!charge(state, kept.length)) {
        state.omissions.push(
          `${label(path)}: omitted (excerpt size limit reached)`,
        );
        return DROPPED;
      }
      state.omissions.push(
        `${label(path)}: showing the first ${limits.maxStringChars} of ${value.length} characters`,
      );
      return { kept: true, value: kept };
    }
    if (!charge(state, value.length)) {
      state.omissions.push(
        `${label(path)}: omitted (excerpt size limit reached)`,
      );
      return DROPPED;
    }
    return { kept: true, value };
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (!charge(state, String(value).length)) {
      state.omissions.push(
        `${label(path)}: omitted (excerpt size limit reached)`,
      );
      return DROPPED;
    }
    return { kept: true, value };
  }

  if (Array.isArray(value)) {
    if (depth >= limits.maxDepth) {
      state.omissions.push(
        `${label(path)}: nested content omitted below depth ${limits.maxDepth}`,
      );
      return DROPPED;
    }
    const take = Math.min(value.length, limits.maxArrayItems);
    if (value.length > take) {
      state.omissions.push(
        `${label(path)}: showing the first ${take} of ${value.length} items`,
      );
    }
    const out: unknown[] = [];
    for (let i = 0; i < take; i++) {
      const child = walk(value[i], `${path}[${i}]`, depth + 1, state);
      if (!child.kept) break;
      out.push(child.value);
    }
    return { kept: true, value: out };
  }

  if (isPlainObject(value)) {
    if (depth >= limits.maxDepth) {
      state.omissions.push(
        `${label(path)}: nested content omitted below depth ${limits.maxDepth}`,
      );
      return DROPPED;
    }
    const keys = Object.keys(value);
    const take = Math.min(keys.length, limits.maxObjectKeys);
    if (keys.length > take) {
      state.omissions.push(
        `${label(path)}: showing ${take} of ${keys.length} fields`,
      );
    }
    const out: Record<string, unknown> = {};
    for (let i = 0; i < take; i++) {
      const key = keys[i];
      const child = walk(value[key], join(path, key), depth + 1, state);
      if (!child.kept) continue;
      out[key] = child.value;
    }
    return { kept: true, value: out };
  }

  // Functions / symbols / undefined never appear in parsed JSON.
  return DROPPED;
}

/**
 * Project `payload` down to a bounded excerpt, recording every omission.
 *
 * A truncated excerpt that says it is truncated is correct; an excerpt that
 * silently shows part of the data is not. Callers MUST surface `omissions`.
 */
export function buildBoundedExcerpt(
  payload: unknown,
  limits: ExcerptLimits = DEFAULT_EXCERPT_LIMITS,
): BoundedExcerpt {
  const state: WalkState = { spent: 0, omissions: [], limits };
  const result = walk(payload, "", 0, state);
  return {
    value: result.kept ? result.value : null,
    truncated: state.omissions.length > 0,
    omissions: state.omissions,
  };
}
