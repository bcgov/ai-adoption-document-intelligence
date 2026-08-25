/**
 * The single node-removal implementation, shared by every delete path (the
 * settings-panel trash button, the canvas context menu, and the keyboard /
 * multi-select gesture). Extracted from `WorkflowEditorCanvas` so the page's
 * `deleteSelected` uses the same code rather than re-implementing it.
 */
import {
  findOrphanedCtxKeys,
  pruneCtxDeclarations,
  pruneEdgeReferences,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { pruneNodesFromGroups } from "../group/prune-node-from-groups";

/**
 * Removes the given node ids from the config: the nodes themselves, every
 * edge touching one, the entry pointer (re-seated onto any survivor), group
 * memberships (via `pruneNodesFromGroups` — emptied groups + orphaned
 * exposedParams go too, so the save-time validator doesn't report "references
 * non-existent node"), and the ctx declarations the removed nodes were the
 * sole writer of.
 *
 * **The ctx prune is unconditional and lives here on purpose.** This is the
 * choke point every delete path funnels through, so no future path can forget
 * it. That does not make the delete unguarded: each entry point asks the
 * author first (via `describeOrphanedDelete`) and a cancelled delete returns
 * early without ever calling this function.
 *
 * Consumer detection reads port bindings, `map.collectionCtxKey`,
 * childWorkflow input mappings and condition refs — never edges — so it is
 * unaffected by the edge filtering below and by callers that strip edges in a
 * later pass (`handleDelete`).
 *
 * **The edge-reference sweep runs last** (G-029). Four node fields name an edge
 * by id rather than through the edge list — `switch.cases[].edgeId`,
 * `switch.defaultEdge`, `humanGate.fallbackEdgeId` and any node's
 * `errorPolicy.fallbackEdgeId` — so an edge removed here as collateral of a
 * node delete would otherwise leave them pointing at nothing. It runs on the
 * post-filter config because that is when "which edges are gone" is knowable.
 * Callers that strip further edges afterwards must sweep again; `handleDelete`
 * does.
 *
 * Pure; never mutates the input config.
 */
/**
 * G-039 — which node becomes the entry point when the current one is deleted.
 *
 * This used to be `Object.keys(nodesCopy)[0]`: whichever node happened to be
 * first in the record. That is arbitrary (record order is insertion order, not
 * graph order), so it usually promoted a node with inbound edges — an entry
 * point that cannot be an entry point — and the graph was invalid the instant
 * the delete landed.
 *
 * The preference order picks something that can actually start a run:
 *   1. a surviving `source` node — the graph's own declared front door;
 *   2. a survivor with no inbound edges — a real root;
 *   3. any survivor, as a last resort (a fully-cyclic remainder).
 *
 * Exported so `describeOrphanedDelete` can name the SAME node the delete will
 * choose. Two implementations of "which node is promoted" would drift, and the
 * toast would eventually name a node the config did not adopt.
 */
export function resolveNextEntryNodeId(
  config: GraphWorkflowConfig,
  removedIds: ReadonlySet<string>,
): string {
  if (!removedIds.has(config.entryNodeId)) return config.entryNodeId;

  const survivors = Object.keys(config.nodes).filter(
    (id) => !removedIds.has(id),
  );
  if (survivors.length === 0) return "";

  const source = survivors.find((id) => config.nodes[id]?.type === "source");
  if (source) return source;

  const hasInbound = new Set(
    config.edges
      .filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target))
      .map((e) => e.target),
  );
  return survivors.find((id) => !hasInbound.has(id)) ?? survivors[0];
}

export function removeNodesFromConfig(
  config: GraphWorkflowConfig,
  removedIds: ReadonlySet<string>,
): GraphWorkflowConfig {
  // Computed against the PRE-removal config — "which keys lose their sole
  // writer" is only answerable while the writers are still present.
  const orphaned = findOrphanedCtxKeys(config, removedIds);

  const nodesCopy = { ...config.nodes };
  for (const id of removedIds) delete nodesCopy[id];
  const filteredEdges = config.edges.filter(
    (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
  );
  const nextEntryNodeId = resolveNextEntryNodeId(config, removedIds);
  const prunedGroups = pruneNodesFromGroups(config, removedIds);
  const withoutNodes: GraphWorkflowConfig = {
    ...config,
    nodes: nodesCopy,
    edges: filteredEdges,
    entryNodeId: nextEntryNodeId,
    nodeGroups: prunedGroups.nodeGroups,
  };
  const withoutCtx = pruneCtxDeclarations(
    withoutNodes,
    orphaned.map((entry) => entry.ctxKey),
  );
  return pruneEdgeReferences(withoutCtx);
}
