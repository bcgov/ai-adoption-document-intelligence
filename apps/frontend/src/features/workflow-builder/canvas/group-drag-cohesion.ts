/**
 * Moving a group as one — the maths behind a HEADER drag (R-1, 2026-08-03).
 *
 * The rule: drag a group's header strip and every member moves by the same
 * delta; drag a member and only that member moves, with the box re-fitting
 * around where it landed. Cohesive movement is a target you aim at, not a
 * surprise you trip over, and repositioning one node inside its own group is
 * possible for the first time.
 *
 * This reverses the rule shipped on 2026-08-02, where a drag of ANY member
 * carried its siblings. That rule existed because there was nothing else to
 * grab: an authored group was a dashed outline per card with no surface of its
 * own, so "the group" was only ever reachable through one of its members. G-1
 * gave the group a container box with a header, and the reason expired with it.
 *
 * What did NOT change: selection. Clicking a member still selects exactly that
 * node and the settings panel still edits exactly that node. And deletion is
 * still per-node — a group here is an annotation over an executable graph, so
 * removing three real pipeline steps because one was selected stays far more
 * destructive than the click deserves.
 *
 * Synthetic map-body groups (`__map_body_*`) have no cohesive drag: they are
 * derived from a map node's entry/exit rather than authored, their membership
 * changes when the graph does, and their box is projected, not positioned. The
 * canvas renders their container non-draggable; `resolveGroupDragExtras`
 * refuses them too, so the invariant holds even if a caller asks.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";
import { isSyntheticMapBodyGroupId } from "./map-body-groups";

/**
 * The nodes a drag of `groupId`'s header must carry: every declared member
 * that still exists in `config.nodes`.
 *
 * Existence is checked because a group outlives a member's deletion until
 * something prunes it, and moving a phantom would write a position for a node
 * that is not there. Synthetic map-body groups return nothing (see the module
 * comment), as does an unknown group id.
 */
export function resolveGroupDragExtras(
  config: GraphWorkflowConfig,
  groupId: string,
): string[] {
  if (isSyntheticMapBodyGroupId(groupId)) return [];
  const members = config.nodeGroups?.[groupId]?.nodeIds;
  if (!members) return [];
  return members.filter((id) => config.nodes[id] !== undefined);
}

/** A node's authored canvas position, or `null` when it has none yet. */
export function readNodePosition(
  config: GraphWorkflowConfig,
  nodeId: string,
): { x: number; y: number } | null {
  const position = (
    config.nodes[nodeId]?.metadata as
      | { position?: { x: number; y: number } }
      | undefined
  )?.position;
  if (
    !position ||
    typeof position.x !== "number" ||
    typeof position.y !== "number"
  ) {
    return null;
  }
  return { x: position.x, y: position.y };
}

export interface GroupDragCohort {
  /** The dragged container node — the gesture's frame of reference. */
  anchorId: string;
  anchorStart: { x: number; y: number };
  /** Carried members → where each sat when the gesture began. */
  startPositions: Map<string, { x: number; y: number }>;
}

/**
 * Capture what a header drag of `groupId` must carry, or `null` when there is
 * nothing to move (empty/synthetic/unknown group, or no member has ever been
 * placed).
 *
 * `anchorId` is the container node's own xyflow id and `anchorStart` its
 * position at drag start — the box is what the pointer is holding, so the
 * delta is measured against it rather than against any one member.
 *
 * Member positions are snapshotted here rather than read per-tick so the whole
 * gesture stays relative to one origin — reading live positions each tick
 * would compound rounding drift across a long drag.
 */
export function captureGroupDragCohort(
  config: GraphWorkflowConfig,
  groupId: string,
  anchorId: string,
  anchorStart: { x: number; y: number },
): GroupDragCohort | null {
  const members = resolveGroupDragExtras(config, groupId);
  if (members.length === 0) return null;
  const startPositions = new Map<string, { x: number; y: number }>();
  for (const id of members) {
    const at = readNodePosition(config, id);
    // A member with no authored position has never been placed; leave it
    // where the layout puts it rather than inventing an origin for it.
    if (at) startPositions.set(id, at);
  }
  if (startPositions.size === 0) return null;
  return { anchorId, anchorStart, startPositions };
}

/**
 * Where each carried member sits once the anchor has reached `anchorAt`.
 * Pure: same delta applied to every snapshotted origin.
 */
export function applyGroupDragDelta(
  cohort: GroupDragCohort,
  anchorAt: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const dx = anchorAt.x - cohort.anchorStart.x;
  const dy = anchorAt.y - cohort.anchorStart.y;
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, start] of cohort.startPositions) {
    out.set(id, { x: start.x + dx, y: start.y + dy });
  }
  return out;
}
