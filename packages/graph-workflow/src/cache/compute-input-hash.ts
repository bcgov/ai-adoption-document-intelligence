/**
 * Phase 4 — consumed-input hash for the activity-output cache.
 *
 * For each port binding declared on `node.inputs`, look up the ctx value
 * at execution time and build a canonical, content-addressable map keyed
 * by port name. The map is then hashed via sha256(stableJson(...)) to
 * produce the `inputHash` cache-key component.
 *
 * Per `docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md` §2.3, Document
 * and Segment ctx values are normalised by content identity BEFORE the
 * outer canonicalisation runs — that's what makes the inputHash stable
 * across presigned-URL drift between Try clicks.
 *
 * Rules (Scenarios 1–6 in US-129):
 *   - Iterate `node.inputs ?? []`. Source nodes have no inputs[]; an
 *     empty/absent list collapses to the empty-object hash sha256("{}"),
 *     which is the correct shared sentinel — their cache rows are
 *     differentiated by `nodeId + configHash` (Scenario 2).
 *   - Each binding contributes one entry whose key is `binding.port`
 *     and whose value is:
 *       • the artifact's content hash (a 64-char hex string) when the
 *         ctx value matches a Document/Segment shape (or an array of
 *         such), via `hashArtifact()` (Scenario 3);
 *       • the raw primitive otherwise — `stableJson` handles strings,
 *         numbers, booleans, null, and arbitrary plain objects directly
 *         (Scenario 4);
 *       • the stable sentinel `null` when `ctx[binding.ctxKey]` is
 *         `undefined` or the key is absent (Scenario 5). We MUST emit
 *         `null` and not `undefined` because `stableJson` omits
 *         undefined property values — the slot would silently disappear
 *         and two distinct missing/present states would collide.
 *   - Ctx keys that NO binding references are ignored (Scenario 1 —
 *     unrelated-ctx-keys-don't-leak).
 *   - Port-order independence is automatic: `stableJson` sorts object
 *     keys alphabetically (Scenario 6).
 *
 * Pure function — sha256 is sourced from `@noble/hashes` (pure JS, no
 * Node-builtin imports) so this helper is reachable from Temporal
 * workflow code in addition to the worker and backend.
 */

import type { GraphNode } from "../types";
import { hashArtifact } from "./hash-artifact";
import { sha256Hex } from "./sha256-hex";
import { stableJson } from "./stable-json";

/**
 * Heuristic mirroring `hashArtifact`'s detection: when the ctx value
 * looks like a Document, Segment, or an array of either, route it
 * through `hashArtifact` so its content hash (not its presigned URL)
 * lands in the consumed map. Otherwise the value flows through to
 * `stableJson` verbatim.
 *
 * Detection is intentionally loose — we delegate the actual decision
 * back to `hashArtifact`, which silently falls through partial shapes
 * to `stableJson + sha256`. Routing an arbitrary plain object through
 * `hashArtifact` would replace it with its sha256 hex, which is NOT
 * what Scenario 4 wants. So we only re-route values that pass strict
 * artifact detection here.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDocumentShape(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.blobKey !== "string") {
    return false;
  }
  return typeof value.url === "string" || typeof value.mimeType === "string";
}

function isSegmentShape(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.parentDocId !== "string") {
    return false;
  }
  return Array.isArray(value.polygon);
}

function isArtifactValue(value: unknown): boolean {
  if (isDocumentShape(value) || isSegmentShape(value)) {
    return true;
  }
  if (Array.isArray(value) && value.length > 0) {
    // Treat arrays as artifact arrays only when every element is an
    // artifact shape. Mixed/primitive arrays go through stableJson so
    // the consumed map keeps them as readable JSON.
    return value.every((element) => isDocumentShape(element) || isSegmentShape(element));
  }
  return false;
}

export function computeInputHash(
  node: GraphNode,
  ctx: Record<string, unknown>,
): string {
  const consumed: Record<string, unknown> = {};

  for (const binding of node.inputs ?? []) {
    const raw = Object.prototype.hasOwnProperty.call(ctx, binding.ctxKey)
      ? ctx[binding.ctxKey]
      : undefined;

    if (raw === undefined) {
      // Stable sentinel for absent / undefined slots — see Scenario 5.
      // Must be `null` (not `undefined`) so `stableJson` preserves the
      // key and missing/present states don't collide.
      consumed[binding.port] = null;
      continue;
    }

    if (isArtifactValue(raw)) {
      consumed[binding.port] = hashArtifact(raw);
      continue;
    }

    consumed[binding.port] = raw;
  }

  return sha256Hex(stableJson(consumed));
}
