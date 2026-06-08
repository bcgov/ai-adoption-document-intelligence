/**
 * Pure helper that removes one or more deleted node ids from every
 * `nodeGroups[*].nodeIds` membership list and prunes the fallout
 * (US-042 / US-044):
 *
 *   - The deleted id is filtered out of every group's `nodeIds`.
 *   - Any group left with an empty `nodeIds` is dropped from
 *     `config.nodeGroups` entirely.
 *   - Any `exposedParams[i]` whose `nodeId` referenced a deleted node is
 *     pruned (a parameter can't be exposed for a node that no longer
 *     exists).
 *
 * Mirrors the per-node removal logic in `GroupNodeSettings.removeNodeId`
 * so node deletion (canvas / page delete paths) and in-panel member
 * removal stay in sync. Unlike the settings path, this helper performs
 * no `window.confirm` / toast — those are interactive concerns owned by
 * the settings UI; the delete paths simply prune to keep the config
 * valid for the save-time validator (which otherwise reports
 * "references non-existent node").
 *
 * Side-effect-free — never mutates the input config. Returns the input
 * reference unchanged when there is nothing to prune so callers can
 * skip redundant state updates.
 */

import type {
  ExposedParam,
  GraphWorkflowConfig,
  NodeGroup,
} from "../../../types/workflow";

export function pruneNodesFromGroups(
  config: GraphWorkflowConfig,
  removedNodeIds: Iterable<string>,
): GraphWorkflowConfig {
  const removed = new Set(removedNodeIds);
  if (removed.size === 0) return config;

  const existingGroups = config.nodeGroups;
  if (!existingGroups || Object.keys(existingGroups).length === 0) {
    return config;
  }

  const nextGroups: Record<string, NodeGroup> = {};
  let changed = false;

  for (const [groupId, group] of Object.entries(existingGroups)) {
    const remainingNodeIds = group.nodeIds.filter((id) => !removed.has(id));

    // Group emptied by the deletion → drop it entirely.
    if (remainingNodeIds.length === 0) {
      changed = true;
      continue;
    }

    const membershipChanged =
      remainingNodeIds.length !== group.nodeIds.length;

    let nextExposedParams: ExposedParam[] | undefined = group.exposedParams;
    if (group.exposedParams) {
      const pruned = group.exposedParams.filter(
        (param) => param.nodeId === undefined || !removed.has(param.nodeId),
      );
      if (pruned.length !== group.exposedParams.length) {
        nextExposedParams = pruned;
      }
    }
    const paramsChanged = nextExposedParams !== group.exposedParams;

    if (!membershipChanged && !paramsChanged) {
      nextGroups[groupId] = group;
      continue;
    }

    changed = true;
    const nextGroup: NodeGroup = { ...group, nodeIds: remainingNodeIds };
    if (nextExposedParams !== undefined) {
      nextGroup.exposedParams = nextExposedParams;
    }
    nextGroups[groupId] = nextGroup;
  }

  if (!changed) return config;

  return { ...config, nodeGroups: nextGroups };
}

/** Single-id convenience wrapper around {@link pruneNodesFromGroups}. */
export function pruneNodeFromGroups(
  config: GraphWorkflowConfig,
  removedNodeId: string,
): GraphWorkflowConfig {
  return pruneNodesFromGroups(config, [removedNodeId]);
}
