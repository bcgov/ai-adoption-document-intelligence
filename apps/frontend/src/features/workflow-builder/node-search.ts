/**
 * G-009 — find a node in the CURRENT GRAPH.
 *
 * The editor's only query field is the palette's "Search activities…", which
 * searches the catalog of things you can add, not the workflow you have. On a
 * 16-node master template — never mind the 40+ real workflows reach — "where
 * is the node that writes `preparedFileData`" has no answer but reading the
 * canvas.
 *
 * Pure selector: it matches a node's LABEL and its TYPE (the wrapped activity
 * type for `activity`/`pollUntil`, the `sourceType` for `source`, and the
 * node type itself for control flow), and nothing else — a hit is always
 * something the author can see on the card.
 */

import type { GraphNode, GraphWorkflowConfig } from "../../types/workflow";

export interface NodeSearchResult {
  nodeId: string;
  label: string;
  /** What the card shows as its type: activity type, source type, or node type. */
  typeLabel: string;
  /** Which field the query hit. Label hits rank first. */
  matchedOn: "label" | "type";
}

/**
 * The type string a node's card displays — the same value the search matches
 * on, so a hit is never on something invisible.
 */
export function nodeTypeLabel(node: GraphNode): string {
  if (node.type === "activity" || node.type === "pollUntil") {
    return node.activityType;
  }
  if (node.type === "source") return node.sourceType;
  return node.type;
}

/**
 * Nodes in `config` whose label or type contains `query`, case-insensitively.
 * Label matches come first (an author searching a name means the name), then
 * type matches; each group keeps `config.nodes` insertion order so repeated
 * searches are stable.
 *
 * A blank query returns nothing rather than everything — an unfiltered dump
 * of the graph is what the canvas already is.
 */
export function searchNodes(
  config: GraphWorkflowConfig,
  query: string,
): NodeSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const labelHits: NodeSearchResult[] = [];
  const typeHits: NodeSearchResult[] = [];

  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node) continue;
    const label = node.label ?? "";
    const typeLabel = nodeTypeLabel(node);
    if (label.toLowerCase().includes(needle)) {
      labelHits.push({ nodeId, label, typeLabel, matchedOn: "label" });
      continue;
    }
    if (typeLabel.toLowerCase().includes(needle)) {
      typeHits.push({ nodeId, label, typeLabel, matchedOn: "type" });
    }
  }

  return [...labelHits, ...typeHits];
}
