/**
 * The single node-removal implementation, shared by every delete path (the
 * settings-panel trash button, the canvas context menu, and the keyboard /
 * multi-select gesture). Extracted from `WorkflowEditorCanvas` so the page's
 * `deleteSelected` uses the same code rather than re-implementing it.
 */
import {
  findOrphanedCtxKeys,
  pruneCtxDeclarations,
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
 * Pure; never mutates the input config.
 */
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
  const nextEntryNodeId = removedIds.has(config.entryNodeId)
    ? (Object.keys(nodesCopy)[0] ?? "")
    : config.entryNodeId;
  const prunedGroups = pruneNodesFromGroups(config, removedIds);
  const withoutNodes: GraphWorkflowConfig = {
    ...config,
    nodes: nodesCopy,
    edges: filteredEdges,
    entryNodeId: nextEntryNodeId,
    nodeGroups: prunedGroups.nodeGroups,
  };
  return pruneCtxDeclarations(
    withoutNodes,
    orphaned.map((entry) => entry.ctxKey),
  );
}
