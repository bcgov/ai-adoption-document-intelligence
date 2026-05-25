/**
 * Phase 4 — Source-node ctx-merge cache writer (US-133 Scenario 3).
 *
 * Source nodes are the workflow's edge to the outside world (Phase 8).
 * They have no `inputs[]` and therefore can't be hashed via the
 * standard `computeInputHash` (which sha256s `sha256(stableJson({}))`
 * — the same hash for every source node, which would conflate
 * unrelated inbound payloads).
 *
 * Per REQUIREMENTS.md L16, a source node's cache row is keyed by:
 *   - `configHash = sha256(stableJson(sourceNode.parameters ?? {}))`
 *   - `inputHash  = sha256(stableJson(initialCtx))`   — the inbound payload
 *   - `outputCtx  = initialCtx`                       — the source's "output"
 *   - `outputKind = sourceCatalogEntry.outputKind`    — resolved via SOURCE_CATALOG
 *
 * The `inputHash` of every downstream activity then naturally
 * incorporates the source's contribution (via the standard
 * `computeInputHash` reading the ctx values the source merged in).
 * That's how source nodes "participate in the same hash chain"
 * (TRY_IN_PLACE_DESIGN.md §2.3).
 *
 * This helper is invoked from `graph-workflow.ts` once at workflow start
 * for each `SourceNode` in the graph. It is intentionally separate from
 * `executeCachedActivity` (which expects a `rawExecute` to run) because
 * the source's ctx-merge already happened before this function runs —
 * there's nothing to execute, only a cache row to persist.
 */

import type { SourceNode } from "@ai-di/graph-workflow";
import {
  getSourceCatalogEntry,
  sha256Hex,
  stableJson,
} from "@ai-di/graph-workflow";

import type { CachedActivityDeps } from "./cached-activity";

/**
 * Resolve a source node's declared output kind via the source catalog.
 * Returns `null` for unknown source types (validator catches these at
 * save time; this is defence-in-depth at runtime).
 */
function resolveSourceOutputKind(sourceType: string): string | null {
  const entry = getSourceCatalogEntry(sourceType);
  if (!entry) {
    return null;
  }
  const kind = entry.outputKind;
  if (typeof kind === "string") {
    return kind;
  }
  // Phase 3 `KindRef` may be a `{ name: ... }` shape. Normalise to a
  // string for the cache column; only the leaf name is meaningful for
  // preview-widget dispatch.
  if (
    kind !== null &&
    typeof kind === "object" &&
    "name" in kind &&
    typeof (kind as { name?: unknown }).name === "string"
  ) {
    return (kind as { name: string }).name;
  }
  return null;
}

/**
 * Write the source node's cache row at workflow start. Idempotent —
 * uses `upsert` so repeated invocations with the same `initialCtx`
 * overwrite the existing row (per the design's racetrack handling in
 * `cached-activity.ts`).
 *
 * Errors are caught and silently dropped — a failed cache write must
 * not abort the workflow. The decorator handles the same case the
 * same way (`Object.assign` first, then attempt upsert).
 */
export async function writeSourceNodeCache(
  deps: CachedActivityDeps,
  node: SourceNode,
  initialCtx: Record<string, unknown>,
  workflowLineageId: string,
): Promise<void> {
  const configHash = sha256Hex(stableJson(node.parameters ?? {}));
  const inputHash = sha256Hex(stableJson(initialCtx));
  const outputKind = resolveSourceOutputKind(node.sourceType);

  await deps.upsert({
    workflowLineageId,
    nodeId: node.id,
    configHash,
    inputHash,
    outputCtx: initialCtx,
    outputKind,
  });
}
