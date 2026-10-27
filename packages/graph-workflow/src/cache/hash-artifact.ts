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
 * Pure function — sha256 is sourced from `@noble/hashes` (pure JS, no
 * Node-builtin imports) so this helper is reachable from Temporal
 * workflow code in addition to the worker and backend.
 */

import {
  isDocumentShape,
  isSegmentShape,
  type SegmentShape,
} from "./artifact-shapes";
import { sha256Hex } from "./sha256-hex";
import { stableJson } from "./stable-json";

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
