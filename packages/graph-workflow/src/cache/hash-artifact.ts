/**
 * Content-addressable artifact hashing used by the Phase 4 activity-output
 * cache (TRY_IN_PLACE_DESIGN.md §2.3).
 *
 * Document and Segment ctx values must produce the SAME hash regardless of
 * presigned-URL drift (the URL contains time-bounded query parameters) so
 * that the worker's write hash and the backend's read hash agree across
 * Try clicks. This helper normalises those two shapes to their content
 * identifiers BEFORE hashing; everything else falls through to
 * `stableJson` + sha256.
 *
 * Detection markers (strict — partial shapes intentionally fall through to
 * the primitive path, see Scenario 5):
 *
 *   Document: object has `blobKey: string` AND (`url: string` OR
 *             `mimeType: string`). Hash: `sha256("Document:" + blobKey)`.
 *
 *   Segment:  object has `parentDocId: string` AND `polygon: Array`. Hash:
 *             `sha256("Segment:" + parentDocId + ":" +
 *             pageRangeStartEnd + ":" + stableJson(polygon))`. The
 *             `kind` and `confidence` fields are NOT part of the hash —
 *             they're metadata, not identity.
 *
 * Arrays are hashed element-wise: `sha256("[" + h1 + "," + h2 + ",...]")`
 * with order preserved. Empty arrays hash to `sha256("[]")`.
 *
 * Primitives + plain objects without artifact markers go through
 * `stableJson` + sha256, matching the standard `configHash` /
 * `inputHash` path.
 *
 * Pure function — no I/O beyond the in-process sha256 from Node's
 * built-in `crypto` module. Both the worker (Node) and the backend
 * (Node) have `crypto` available.
 */

import { createHash } from "crypto";

import { stableJson } from "./stable-json";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface DocumentShape {
  blobKey: string;
}

interface SegmentShape {
  parentDocId: string;
  polygon: unknown[];
  pageRange?: { start: number; end: number };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDocumentShape(value: unknown): value is DocumentShape {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.blobKey !== "string") {
    return false;
  }
  const hasUrl = typeof value.url === "string";
  const hasMimeType = typeof value.mimeType === "string";
  return hasUrl || hasMimeType;
}

function isSegmentShape(value: unknown): value is SegmentShape {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.parentDocId !== "string") {
    return false;
  }
  if (!Array.isArray(value.polygon)) {
    return false;
  }
  return true;
}

function pageRangeStartEnd(value: SegmentShape): string {
  const range = value.pageRange;
  if (
    range !== undefined &&
    range !== null &&
    typeof range === "object" &&
    typeof range.start === "number" &&
    typeof range.end === "number"
  ) {
    return `${range.start}-${range.end}`;
  }
  return "";
}

export function hashArtifact(value: unknown): string {
  if (Array.isArray(value)) {
    const elementHashes = value.map((element) => hashArtifact(element));
    return sha256Hex(`[${elementHashes.join(",")}]`);
  }

  if (isDocumentShape(value)) {
    return sha256Hex(`Document:${value.blobKey}`);
  }

  if (isSegmentShape(value)) {
    const polygonJson = stableJson(value.polygon);
    return sha256Hex(
      `Segment:${value.parentDocId}:${pageRangeStartEnd(value)}:${polygonJson}`,
    );
  }

  return sha256Hex(stableJson(value));
}
