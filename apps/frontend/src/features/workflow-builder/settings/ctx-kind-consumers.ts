/**
 * G-049 — which inputs a ctx variable's declared kind no longer satisfies.
 *
 * Retyping a declaration's `kind` writes the new kind straight into the config.
 * Every pinned input bound to that key is re-resolved against it, and one that
 * can no longer accept it becomes `locked-kind-mismatch` — which the validation
 * drawer already reports per node. What was missing is the report *at the place
 * the edit happens*: the author changes a kind in the settings drawer and has
 * no way to see, without opening every node, what they just broke.
 *
 * This reads the SAME resolution `computeNodeInputIssues` feeds the drawer, so
 * the two surfaces can never disagree about what is broken. It reports state,
 * not an event: a graph loaded already-mismatched reports too, and the notice
 * clears the moment the mismatch is resolved from either end.
 */
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { computeNodeInputIssues } from "../auto-wire-status";

export interface KindMismatchedConsumer {
  nodeId: string;
  /** The node's label, falling back to its id. */
  nodeLabel: string;
  port: string;
  /** The port's catalog label, falling back to its name. */
  portLabel: string;
}

/**
 * Every input pinned to `ctxKey` whose port cannot accept the kind the
 * declaration currently carries, in node-record then port-declaration order.
 *
 * Only PINNED bindings are reported. An auto-wired port that stops matching
 * after a retype simply re-resolves elsewhere or goes unsatisfied, and the
 * resolver cannot attribute that to any particular key — so claiming this key
 * broke it would be a guess.
 */
export function findKindMismatchedConsumers(
  config: GraphWorkflowConfig,
  ctxKey: string,
): KindMismatchedConsumer[] {
  const found: KindMismatchedConsumer[] = [];
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    const { problemPorts } = computeNodeInputIssues(config, nodeId);
    for (const problem of problemPorts) {
      if (problem.status !== "locked-kind-mismatch") continue;
      if (problem.ctxKey !== ctxKey) continue;
      found.push({
        nodeId,
        nodeLabel: node.label || nodeId,
        port: problem.port,
        portLabel: problem.label,
      });
    }
  }
  return found;
}

/** `1 input no longer accepts this kind` / `3 inputs …`. */
export function describeKindMismatch(
  consumers: readonly KindMismatchedConsumer[],
): string {
  const noun = consumers.length === 1 ? "input" : "inputs";
  return `${consumers.length} ${noun} no longer accept${
    consumers.length === 1 ? "s" : ""
  } this kind`;
}
