/**
 * Pure projection helper that collapses `nodeGroups` into single
 * "chips" for the simplified-view canvas (US-043).
 *
 * Given a `GraphWorkflowConfig`, returns:
 *   - `visibleNodes`   — nodes NOT in any group.
 *   - `visibleEdges`   — edges with grouped endpoints rewritten to point
 *                        at the corresponding chip id; edges between two
 *                        members of the same group are dropped.
 *   - `chips`          — one `GroupChip` per group entry, positioned at
 *                        the centroid of its members' `metadata.position`.
 *   - `nodeToGroup`    — lookup: original node id → owning group id.
 *
 * Pure: never mutates input; never reads from React; only depends on
 * `@ai-di/graph-workflow` types.
 *
 * Chip id is deterministic — `group-chip-${groupId}` — so xyflow's
 * selection state survives projection refreshes.
 */

import type {
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";

export interface GroupChip {
  /** Deterministic xyflow node id: `group-chip-${groupId}`. */
  id: string;
  /** Underlying `nodeGroups[groupId]` key. */
  groupId: string;
  label: string;
  icon?: string;
  color?: string;
  nodeCount: number;
  position: { x: number; y: number };
  /**
   * Original ids of the nodes folded into the chip. Used by the V2
   * canvas's aggregate `NodeStatusBadge` (US-138 Scenario 5) — the chip
   * surfaces the rolled-up run status of its members.
   */
  memberNodeIds: readonly string[];
}

export interface ProjectedConfig {
  visibleNodes: GraphNode[];
  visibleEdges: GraphEdge[];
  chips: GroupChip[];
  /** Original node id → owning group id. Only includes grouped nodes. */
  nodeToGroup: Record<string, string>;
}

const FALLBACK_POSITION = { x: 80, y: 80 } as const;

/** Stable chip id from a group id — exported so callers can find a chip
 *  on the canvas without re-walking the projection. */
export function chipIdForGroup(groupId: string): string {
  return `group-chip-${groupId}`;
}

/**
 * Inverse of `chipIdForGroup`: given an xyflow node id, returns the
 * underlying group id if the node is a chip, or `null` if it's a normal
 * node id. Used by the canvas's selection handler to route chip clicks
 * through `onGroupChipClick` without re-walking the projection.
 */
export function groupIdFromChipId(nodeId: string): string | null {
  const prefix = "group-chip-";
  if (!nodeId.startsWith(prefix)) return null;
  const rest = nodeId.slice(prefix.length);
  return rest.length > 0 ? rest : null;
}

function readPositionFromNode(node: GraphNode | undefined): {
  x: number;
  y: number;
} {
  if (!node) return { ...FALLBACK_POSITION };
  const fromMeta = (node.metadata as { position?: { x: number; y: number } })
    ?.position;
  if (
    fromMeta &&
    typeof fromMeta.x === "number" &&
    typeof fromMeta.y === "number"
  ) {
    return { x: fromMeta.x, y: fromMeta.y };
  }
  return { ...FALLBACK_POSITION };
}

export function projectGroupedConfig(
  config: GraphWorkflowConfig,
): ProjectedConfig {
  const groups = config.nodeGroups ?? {};
  const groupIds = Object.keys(groups);

  // Fast-path: no groups → identity projection.
  if (groupIds.length === 0) {
    return {
      visibleNodes: Object.values(config.nodes),
      visibleEdges: config.edges,
      chips: [],
      nodeToGroup: {},
    };
  }

  // Build nodeId → groupId index.
  const nodeToGroup: Record<string, string> = {};
  for (const groupId of groupIds) {
    const group = groups[groupId];
    for (const nodeId of group.nodeIds) {
      // First-wins is fine — `createGroupFromSelection` enforces
      // single-membership, so collisions shouldn't happen in valid configs.
      if (!nodeToGroup[nodeId]) {
        nodeToGroup[nodeId] = groupId;
      }
    }
  }

  // Visible nodes — every node NOT in a group.
  const visibleNodes: GraphNode[] = [];
  for (const node of Object.values(config.nodes)) {
    if (!nodeToGroup[node.id]) visibleNodes.push(node);
  }

  // Chips — one per group, positioned at the centroid of member positions.
  const chips: GroupChip[] = groupIds.map((groupId) => {
    const group = groups[groupId];
    const positions = group.nodeIds.map((id) =>
      readPositionFromNode(config.nodes[id]),
    );
    const count = positions.length || 1;
    let sumX = 0;
    let sumY = 0;
    for (const p of positions) {
      sumX += p.x;
      sumY += p.y;
    }
    return {
      id: chipIdForGroup(groupId),
      groupId,
      label: group.label,
      icon: group.icon,
      color: group.color,
      nodeCount: group.nodeIds.length,
      position: { x: sumX / count, y: sumY / count },
      memberNodeIds: [...group.nodeIds],
    };
  });

  // Visible edges — remap endpoints to chip ids; drop intra-group edges.
  const visibleEdges: GraphEdge[] = [];
  for (const edge of config.edges) {
    const sourceGroup = nodeToGroup[edge.source];
    const targetGroup = nodeToGroup[edge.target];
    if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
      // Both endpoints belong to the same group → hide.
      continue;
    }
    const nextSource = sourceGroup ? chipIdForGroup(sourceGroup) : edge.source;
    const nextTarget = targetGroup ? chipIdForGroup(targetGroup) : edge.target;
    if (nextSource === edge.source && nextTarget === edge.target) {
      // Neither endpoint changed — preserve the original edge reference so
      // downstream identity comparisons (e.g., edge-fingerprint) stay
      // stable.
      visibleEdges.push(edge);
      continue;
    }
    visibleEdges.push({
      ...edge,
      source: nextSource,
      target: nextTarget,
    });
  }

  return { visibleNodes, visibleEdges, chips, nodeToGroup };
}
