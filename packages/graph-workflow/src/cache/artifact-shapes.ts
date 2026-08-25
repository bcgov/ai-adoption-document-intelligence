/**
 * Shared artifact-shape detectors for the Phase 4 activity-output cache.
 *
 * §6.3: `hash-artifact.ts` (the content-addressable hasher) and
 * `compute-input-hash.ts` (which decides whether to route a ctx value through
 * that hasher) previously each carried their OWN copies of these predicates.
 * Because both feed the cache key, any drift between them makes the worker's
 * write hash and the backend's read hash disagree → false cache misses /
 * collisions. Keeping a single definition here removes that risk.
 *
 * Detection is strict — partial shapes intentionally fall through to the
 * primitive `stableJson + sha256` path (see hash-artifact.ts Scenario 5).
 */

export interface DocumentShape {
  blobKey: string;
}

export interface SegmentShape {
  parentDocId: string;
  polygon: unknown[];
  pageRange?: { start: number; end: number };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Document marker: `blobKey: string` AND (`url: string` OR `mimeType: string`).
 */
export function isDocumentShape(value: unknown): value is DocumentShape {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.blobKey !== "string") {
    return false;
  }
  return typeof value.url === "string" || typeof value.mimeType === "string";
}

/** Segment marker: `parentDocId: string` AND `polygon: Array`. */
export function isSegmentShape(value: unknown): value is SegmentShape {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.parentDocId !== "string") {
    return false;
  }
  return Array.isArray(value.polygon);
}
