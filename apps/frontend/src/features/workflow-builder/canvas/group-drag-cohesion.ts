/**
 * Group move-together (Inderdeep walkthrough 2026-07-29, item 6).
 *
 * Inderdeep came to the canvas from Figma and expected a group to behave as
 * one object: "when I move one, the other one also moves". It did not — every
 * member dragged independently, so a group you had arranged came apart the
 * first time you tidied it.
 *
 * The decision (2026-08-02) was to take Figma's *move* semantics and leave its
 * *delete* semantics alone: a group here is an annotation over an executable
 * graph, and deleting three real pipeline steps because one was selected is
 * destructive out of proportion to the click. So dragging is cohesive;
 * selection is not. Clicking a member still selects exactly that node, and the
 * settings panel still edits exactly that node — only the drag carries the
 * others along.
 *
 * Synthetic map-body groups (`__map_body_*`) are deliberately excluded: they
 * are derived from a map node rather than authored, and their members already
 * have their own layout rules.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";
import { isSyntheticMapBodyGroupId } from "./map-body-groups";

/**
 * The user group containing `nodeId`, or `null` when the node is ungrouped
 * (or only in a synthetic map-body group).
 */
export function userGroupMembersOf(
  config: GraphWorkflowConfig,
  nodeId: string,
): readonly string[] | null {
  for (const [groupId, group] of Object.entries(config.nodeGroups ?? {})) {
    if (isSyntheticMapBodyGroupId(groupId)) continue;
    if (group.nodeIds.includes(nodeId)) return group.nodeIds;
  }
  return null;
}

/**
 * The extra nodes a drag of `draggedIds` must carry along — every co-member of
 * every user group represented in the drag, minus the nodes xyflow is already
 * moving itself (a multi-selection drag moves its whole selection natively).
 *
 * Returned ids are guaranteed to exist in `config.nodes`: a group can outlive
 * a member's deletion, and moving a phantom would write a position for a node
 * that is not there.
 */
export function resolveGroupDragExtras(
  config: GraphWorkflowConfig,
  draggedIds: readonly string[],
): string[] {
  const alreadyMoving = new Set(draggedIds);
  const extras = new Set<string>();
  for (const draggedId of draggedIds) {
    const members = userGroupMembersOf(config, draggedId);
    if (!members) continue;
    for (const memberId of members) {
      if (alreadyMoving.has(memberId)) continue;
      if (!config.nodes[memberId]) continue;
      extras.add(memberId);
    }
  }
  return [...extras];
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
  /** The node under the cursor — the drag's frame of reference. */
  anchorId: string;
  anchorStart: { x: number; y: number };
  /** Extra members → where each sat when the gesture began. */
  startPositions: Map<string, { x: number; y: number }>;
}

/**
 * Capture what a drag beginning at `anchor` must carry, or `null` when there
 * is nothing extra to move (ungrouped node, or the whole group is already in
 * the dragged selection).
 *
 * Positions are snapshotted here rather than read per-tick so the whole
 * gesture stays relative to one origin — reading live positions each tick
 * would compound rounding drift across a long drag.
 */
export function captureGroupDragCohort(
  config: GraphWorkflowConfig,
  anchorId: string,
  anchorStart: { x: number; y: number },
  draggedIds: readonly string[],
): GroupDragCohort | null {
  const extras = resolveGroupDragExtras(config, draggedIds);
  if (extras.length === 0) return null;
  const startPositions = new Map<string, { x: number; y: number }>();
  for (const id of extras) {
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
