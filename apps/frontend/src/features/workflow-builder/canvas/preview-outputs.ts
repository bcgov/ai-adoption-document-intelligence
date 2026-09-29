/**
 * `computePreviewOutputs` — the canvas projection's per-node list of
 * previewable outputs (G-011).
 *
 * The projection used to emit `primaryOutputCtxKey: node.outputs?.[0]?.ctxKey`
 * and hand only that to the preview overlay, so a node with more than one
 * output port — the whole reason `<PortRows>` renders one row per port — had
 * every output after the first invisible during a run, with no affordance to
 * switch. The only workaround (the wire peek) exists solely where a data wire
 * was drawn, so an UNCONSUMED second output was unobservable.
 *
 * Kinds come from the activity catalog's output descriptors, not from the
 * cache row: `ActivityOutputCache.outputKind` records only the FIRST output
 * port's kind (see `resolveOutputKind` in apps/temporal/src/cache/
 * cached-activity.ts), so it cannot type outputs 2..n.
 */

import { getActivityCatalogEntry } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import type { PreviewOutputBinding } from "../preview/preview.types";

/**
 * Every output binding of `nodeId` that can be previewed, in the node's own
 * declaration order. A binding without a `ctxKey` is skipped: there is no
 * location in the cached `outputCtx` delta to read it from.
 *
 * Nodes without a static catalog entry (`dyn.*` activity types, deleted
 * entries) still yield their bindings — the value can be read and shown
 * through the generic fallback; only the port label and kind are unknown.
 */
export function computePreviewOutputs(
  config: GraphWorkflowConfig,
  nodeId: string,
): PreviewOutputBinding[] {
  const node = config.nodes[nodeId];
  if (!node) return [];

  const catalogEntry =
    node.type === "activity" || node.type === "pollUntil"
      ? getActivityCatalogEntry(node.activityType)
      : undefined;

  const bindings: PreviewOutputBinding[] = [];
  for (const binding of node.outputs ?? []) {
    if (!binding.ctxKey) continue;
    const descriptor = catalogEntry?.outputs.find(
      (d) => d.name === binding.port,
    );
    bindings.push({
      port: binding.port,
      label: descriptor?.label ?? binding.port,
      ctxKey: binding.ctxKey,
      kind: descriptor?.kind,
    });
  }
  return bindings;
}
