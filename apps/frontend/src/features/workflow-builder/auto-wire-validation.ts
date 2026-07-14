import { type GraphValidationError, isAutoCtxKey } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { computeNodeInputIssues } from "./auto-wire-status";

/**
 * Project the graph's auto-wire input health into the same
 * `GraphValidationError[]` shape the workflow validator emits, so unbound /
 * ambiguous inputs feed the ONE unified "problems" surface (top-bar count,
 * per-node badge, validation drawer) rather than a separate status-dot system.
 *
 * These are **warnings**, not errors: like the reachability warnings they sit
 * beside, they're design-time advisories that don't block Save (the backend
 * validator never sees them — auto-wire resolution is a frontend concern).
 * Each entry anchors at `nodes.<id>.inputs.<port>` so the drawer can deep-link
 * a click to that input's source picker.
 */
export function autoWireIssuesToValidationErrors(
  config: GraphWorkflowConfig,
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  for (const nodeId of Object.keys(config.nodes)) {
    const node = config.nodes[nodeId];
    // Ports the author explicitly bound to a real (non-auto) ctx variable
    // HAVE a source — a workflow input or another node's output — even if the
    // auto-wire resolver can't infer a producer. Don't flag those; only ports
    // with no such binding (unbound, or auto-wire ambiguous) are real problems.
    const manuallyBoundPorts = new Set(
      (node.inputs ?? [])
        .filter((b) => b.ctxKey && !isAutoCtxKey(b.ctxKey))
        .map((b) => b.port),
    );
    const { problemPorts } = computeNodeInputIssues(config, nodeId);
    for (const problem of problemPorts) {
      if (manuallyBoundPorts.has(problem.port)) continue;
      const message =
        problem.status === "ambiguous"
          ? `Input "${problem.label}" has multiple possible sources — pick one`
          : problem.status === "locked-unbound"
            ? `Input "${problem.label}" was disconnected — pick a source or revert to automatic`
            : `Input "${problem.label}" needs a source — choose where it comes from`;
      errors.push({
        path: `nodes.${nodeId}.inputs.${problem.port}`,
        message,
        severity: "warning",
      });
    }
  }
  return errors;
}
