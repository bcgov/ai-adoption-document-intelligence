/**
 * Render-time helpers that synthesise a derived `nodeGroups` entry for every
 * `map` node's body in a workflow config (Spec §6).
 *
 * The synthesis is purely a projection — it is never written into the saved
 * JSON. Callers merge the result with `config.nodeGroups` and strip the
 * synthetic entries again before persistence (see `stripSyntheticMapBodyGroups`).
 */

import type { GraphWorkflowConfig, NodeGroup } from "../../../types/workflow";

export const SYNTHETIC_MAP_BODY_PREFIX = "__map_body_";

export function isSyntheticMapBodyGroupId(groupId: string): boolean {
  return groupId.startsWith(SYNTHETIC_MAP_BODY_PREFIX);
}

/**
 * Walks every `map` node with both `bodyEntryNodeId` and `bodyExitNodeId`
 * set, BFS-traverses the edges from entry to exit, and returns one
 * synthetic `NodeGroup` per map keyed by `__map_body_<mapNodeId>`. The
 * group's `nodeIds` is the union of entry, exit, and every reachable
 * node between them.
 */
export function synthesizeMapBodyGroups(
  config: GraphWorkflowConfig,
): Record<string, NodeGroup> {
  const out: Record<string, NodeGroup> = {};
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as {
      id: string;
      label?: string;
      bodyEntryNodeId?: string;
      bodyExitNodeId?: string;
    };
    if (!mapNode.bodyEntryNodeId || !mapNode.bodyExitNodeId) continue;

    const bodyIds = collectReachable(
      config,
      mapNode.bodyEntryNodeId,
      mapNode.bodyExitNodeId,
    );
    if (bodyIds.size === 0) continue;

    const groupId = `${SYNTHETIC_MAP_BODY_PREFIX}${mapNode.id}`;
    out[groupId] = {
      label: `${mapNode.label ?? mapNode.id} · body`,
      description: `Body of map node "${mapNode.label ?? mapNode.id}". Updates automatically.`,
      color: "#22c55e",
      nodeIds: [...bodyIds],
      exposedParams: [],
    };
  }
  return out;
}

/**
 * BFS from `entryId` following outgoing edges; stops at `exitId` (inclusive)
 * but continues exploring siblings so all body branches are collected.
 */
function collectReachable(
  config: GraphWorkflowConfig,
  entryId: string,
  exitId: string,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of config.edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  const visited = new Set<string>();
  const queue: string[] = [entryId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (visited.has(id)) continue;
    if (!config.nodes[id]) continue;
    visited.add(id);
    if (id === exitId) continue;
    const next = adjacency.get(id) ?? [];
    for (const target of next) {
      if (!visited.has(target)) queue.push(target);
    }
  }
  // Ensure exit is present even if unreachable through edges (defensive).
  if (config.nodes[exitId]) visited.add(exitId);
  return visited;
}

/**
 * Strips synthetic map-body groups from a `nodeGroups` map. Callers use this
 * to guarantee they never persist synthetic entries into `config.nodeGroups`.
 */
export function stripSyntheticMapBodyGroups(
  groups: Record<string, NodeGroup> | undefined,
): Record<string, NodeGroup> {
  const out: Record<string, NodeGroup> = {};
  for (const [key, value] of Object.entries(groups ?? {})) {
    if (isSyntheticMapBodyGroupId(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Combines user-named groups with synthetic map-body groups. User-named
 * groups win on overlapping `nodeIds`: any node already in a user-named
 * group is removed from the synthetic entry's `nodeIds`. A synthetic
 * entry whose `nodeIds` ends up empty is dropped.
 */
export function mergeNodeGroups(
  userGroups: Record<string, NodeGroup>,
  syntheticGroups: Record<string, NodeGroup>,
): Record<string, NodeGroup> {
  const claimedByUser = new Set<string>();
  for (const group of Object.values(userGroups)) {
    for (const id of group.nodeIds) claimedByUser.add(id);
  }

  const out: Record<string, NodeGroup> = { ...userGroups };
  for (const [groupId, group] of Object.entries(syntheticGroups)) {
    const filteredIds = group.nodeIds.filter((id) => !claimedByUser.has(id));
    if (filteredIds.length === 0) continue;
    out[groupId] = { ...group, nodeIds: filteredIds };
  }
  return out;
}
