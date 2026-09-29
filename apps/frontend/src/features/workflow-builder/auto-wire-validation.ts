import {
  type GraphValidationError,
  isAutoCtxKey,
  resolveCtxKeySource,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";
import {
  computeNodeInputIssues,
  type NodeInputProblem,
} from "./auto-wire-status";
import type { DynamicNodeCatalogEntry } from "./canvas/port-rows";

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
 *
 * `dynamicEntries` — the merged catalog's published `dyn.*` entries
 * (`useActivityCatalog().entries`) — extends the accounting to dynamic
 * nodes; without it they contribute no warnings (static-catalog activities
 * are unaffected either way).
 */
export function autoWireIssuesToValidationErrors(
  config: GraphWorkflowConfig,
  dynamicEntries: readonly DynamicNodeCatalogEntry[] = [],
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  for (const nodeId of Object.keys(config.nodes)) {
    const node = config.nodes[nodeId];
    // Ports the author explicitly bound to a real (non-auto) ctx variable
    // usually HAVE a source — a workflow input or another node's output —
    // even when the auto-wire resolver can't infer a producer, so flagging
    // them would be a false positive. That suppression used to be
    // unconditional, which is exactly G-002: the moment the producer behind
    // the key is deleted the binding points at nothing and still read as
    // healthy. Suppress only while `resolveCtxKeySource` can still name a
    // source for the key; a dangling one falls through and is reported.
    const manuallyBoundPorts = new Set(
      (node.inputs ?? [])
        .filter(
          (b) =>
            b.ctxKey &&
            !isAutoCtxKey(b.ctxKey) &&
            resolveCtxKeySource(config, b.ctxKey, nodeId) !== null,
        )
        .map((b) => b.port),
    );
    const { problemPorts } = computeNodeInputIssues(
      config,
      nodeId,
      dynamicEntries,
    );
    for (const problem of problemPorts) {
      if (manuallyBoundPorts.has(problem.port)) continue;
      errors.push({
        path: `nodes.${nodeId}.inputs.${problem.port}`,
        message: problemMessage(problem),
        severity: "warning",
      });
    }
    // A port bound (but not locked) to a ctx key that lost its source never
    // reaches `problemPorts` — the resolver reports it "unsatisfied" only
    // when it ALSO can't auto-bind, and it may happily auto-bind elsewhere
    // while the author's own binding is dead. Report those separately so a
    // hand-bound port whose producer was deleted always surfaces.
    for (const binding of node.inputs ?? []) {
      if (!binding.ctxKey) continue;
      if (manuallyBoundPorts.has(binding.port)) continue;
      if (problemPorts.some((p) => p.port === binding.port)) continue;
      if (resolveCtxKeySource(config, binding.ctxKey, nodeId) !== null)
        continue;
      errors.push({
        path: `nodes.${nodeId}.inputs.${binding.port}`,
        message: `Input "${binding.port}" reads "${binding.ctxKey}", which nothing writes any more — pick a new source`,
        severity: "warning",
      });
    }
  }
  return errors;
}

function problemMessage(problem: NodeInputProblem): string {
  switch (problem.status) {
    case "ambiguous":
      return `Input "${problem.label}" has multiple possible sources — pick one`;
    case "locked-unbound":
      return `Input "${problem.label}" was disconnected — pick a source or revert to automatic`;
    case "locked-dangling":
      return `Input "${problem.label}" is pinned to "${problem.ctxKey}", which nothing writes any more — pick a new source`;
    case "locked-kind-mismatch":
      return `Input "${problem.label}" is pinned to "${problem.ctxKey}", which holds the wrong kind of value — pick a new source`;
    default:
      return `Input "${problem.label}" needs a source — choose where it comes from`;
  }
}
