/**
 * `recordErrorEdge` — the other half of G-001.
 *
 * Dragging from a node's bottom `error` handle stamps `type: "error"` on the
 * new edge but used to leave `errorPolicy.fallbackEdgeId` unset. The
 * validator then reported "requires fallbackEdgeId when onError is
 * 'fallback'" on a node the author had just wired, with nothing in the UI
 * able to clear it. Drawing the path IS the author saying "this is the error
 * path", so record it.
 *
 * Deliberately conservative:
 *   - only fires for `error`-typed edges;
 *   - only fills an UNSET `fallbackEdgeId` — a node that already names an
 *     error path keeps it, so drawing a second error edge never silently
 *     re-points the first;
 *   - only when the source node's policy is already `fallback`, because
 *     that is the only state in which the handle is mounted at all. An
 *     `error` edge on a node with a different policy is a hand-authored /
 *     API-supplied shape the canvas anchors at the node-level handle
 *     (`mountsErrorHandle`); rewriting that node's policy from a drag would
 *     change how it runs.
 */

import type { GraphEdge, GraphWorkflowConfig } from "../../../types/workflow";
import { replaceNode } from "../replace-node";

export function recordErrorEdge(
  config: GraphWorkflowConfig,
  edge: GraphEdge,
): GraphWorkflowConfig {
  if (edge.type !== "error") return config;
  const source = config.nodes[edge.source];
  if (!source) return config;
  const policy = source.errorPolicy;
  if (!policy || policy.onError !== "fallback") return config;
  if (policy.fallbackEdgeId) return config;
  return replaceNode(config, edge.source, {
    ...source,
    errorPolicy: { ...policy, fallbackEdgeId: edge.id },
  });
}
