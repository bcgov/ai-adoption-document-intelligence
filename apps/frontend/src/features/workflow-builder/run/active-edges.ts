/**
 * `computeActiveEdges` — pure helper mapping the live node-status map to
 * the set of xyflow edge ids that should render with the active-edge
 * "currently flowing" animation on the canvas.
 *
 * Per [REQUIREMENTS.md L33](../../../../../../feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md)
 * and [TRY_IN_PLACE_DESIGN.md §3.4](../../../../../../docs-md/workflows/TRY_IN_PLACE_DESIGN.md):
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

/**
 * Node statuses that mean "this node finished and the graph carried on past
 * it". `skipped` counts — a cache-served node still routes onward.
 */
const ROUTED_ONWARD = new Set(["succeeded", "skipped"]);

/**
 * G-014 — the set of edge ids on the path this run **actually took**.
 *
 * `computeActiveEdges` answers "what is flowing right now", which is empty
 * by definition once a run is over. This answers "which way did it go", and
 * so is the thing a replay needs: without it a finished run shows no path at
 * all and there is no way to tell which branch of a switch was chosen.
 *
 * The rules mirror the engine's own routing (`computeReadySet` in
 * `apps/temporal/src/graph-engine/graph-algorithms.ts`):
 *
 *   - a node with `selectedEdgeId` made a branch decision — exactly that one
 *     edge was taken and every sibling was not (switch case / default edge,
 *     humanGate fallback, `errorPolicy: "fallback"` diversion);
 *   - a node that succeeded or was served from cache, with no recorded
 *     decision, routed down **every** outgoing `normal` edge — that is the
 *     engine's implicit fan-out;
 *   - a node that failed without a recorded fallback, or that never finished,
 *     took nothing.
 *
 * Deliberately independent of `computeActiveEdges`: during a live run both
 * are meaningful at once (walked hops are "taken", the in-flight hop is
 * "active") and the canvas renders them differently.
 */
export function computeTakenEdges(
  config: GraphWorkflowConfig,
  statuses: Record<string, NodeRunStatus>,
): Set<string> {
  const taken = new Set<string>();
  for (const edge of config.edges) {
    const source = statuses[edge.source];
    if (!source) continue;
    if (source.selectedEdgeId !== undefined) {
      if (source.selectedEdgeId === edge.id) taken.add(edge.id);
      continue;
    }
    if (!ROUTED_ONWARD.has(source.status)) continue;
    // No recorded decision → the engine fans out down every normal edge.
    // Error edges are only ever traversed via a recorded fallback, which
    // the branch above already handled.
    if (edge.type === "error") continue;
    taken.add(edge.id);
  }
  return taken;
}
