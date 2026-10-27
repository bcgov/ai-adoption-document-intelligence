/**
 * Folds map-body reachability problems into the unified validation surface
 * (top-bar count + per-node badge + Validation drawer), mirroring how
 * `autoWireIssuesToValidationErrors` folds in auto-wire input health.
 *
 * The same analysis already drives the inline Alerts in `MapNodeSettings`;
 * this lifts it into the drawer so an author doesn't have to select the map
 * node to discover that a branch of its body can't reach the exit (and would
 * stall at run time). Emitted as warnings — the server-side validator accepts
 * these configs, so surfacing them as blocking errors would diverge from what
 * Save actually enforces.
 */

import type { GraphValidationError } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig, MapNode } from "../../../types/workflow";
import { analyzeMapBody } from "../settings/control-flow/map-body-analysis";

export function mapBodyIssuesToValidationErrors(
  config: GraphWorkflowConfig,
): GraphValidationError[] {
  const out: GraphValidationError[] = [];
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "map") continue;
    const map = node as MapNode;
    if (!map.bodyEntryNodeId || !map.bodyExitNodeId) continue;

    const analysis = analyzeMapBody(
      config,
      map.bodyEntryNodeId,
      map.bodyExitNodeId,
    );
    if (!analysis.computed) continue;

    const mapLabel = map.label ?? map.id;
    // Anchor at bodyExitNodeId so `nodeIdFromPath` buckets the entry under the
    // map node (its badge + drawer entry), consistent with the validator's
    // own bodyExitNodeId checks.
    const path = `nodes.${map.id}.bodyExitNodeId`;

    if (!analysis.exitReachable) {
      out.push({
        path,
        message: `Map "${mapLabel}": no path leads from the body-entry node to the exit node — every iteration must reach the exit, or the run stalls.`,
        severity: "warning",
      });
      // Exit-unreachable subsumes the dead-end report; don't double-warn.
      continue;
    }

    if (analysis.deadEndNodeIds.length > 0) {
      const labels = analysis.deadEndNodeIds
        .map((id) => config.nodes[id]?.label ?? id)
        .join(", ");
      out.push({
        path,
        message: `Map "${mapLabel}": these body branches never reach the exit node (${labels}). An iteration that follows one will stall at run time — make every branch lead to the exit.`,
        severity: "warning",
      });
    }
  }
  return out;
}
