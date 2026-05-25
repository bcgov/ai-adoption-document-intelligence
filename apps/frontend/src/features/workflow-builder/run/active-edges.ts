/**
 * `computeActiveEdges` — pure helper mapping the live node-status map to
 * the set of xyflow edge ids that should render with the active-edge
 * "currently flowing" animation on the canvas.
 *
 * Per [REQUIREMENTS.md L33](../../../../../../feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md)
 * and [TRY_IN_PLACE_DESIGN.md §3.4](../../../../../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md):
 *
 *   An edge `{ id, source, target }` is "active" when the source node is
 *   `"running"` AND the target node is `"pending"`. Nodes that are absent
 *   from the status map are treated as `"pending"` (consistent with
 *   `useNodeRunStatus`' contract — `absent ≡ pending`).
 *
 * The helper is intentionally free of React / xyflow concerns so it can be
 * exercised under plain vitest without rendering anything.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";
import type { NodeRunStatus } from "./node-status.types";

/**
 * Returns the set of edge ids that should render with the active-edge
 * animation given the supplied `config` + live `statuses` map.
 *
 *   - Source `running` + target `pending` (or absent) → active.
 *   - Any other combination → inactive (edge id omitted from the set).
 */
export function computeActiveEdges(
  config: GraphWorkflowConfig,
  statuses: Record<string, NodeRunStatus>,
): Set<string> {
  const active = new Set<string>();
  for (const edge of config.edges) {
    const sourceStatus = statuses[edge.source]?.status;
    if (sourceStatus !== "running") continue;
    const targetEntry = statuses[edge.target];
    // Target absent ≡ pending (same contract `useNodeRunStatus` follows).
    const targetStatus = targetEntry?.status ?? "pending";
    if (targetStatus !== "pending") continue;
    active.add(edge.id);
  }
  return active;
}
