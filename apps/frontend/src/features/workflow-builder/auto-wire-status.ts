import {
  getActivityCatalogEntry,
  isAssignable,
  type KindRef,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";

/**
 * The aggregate a node's input health rolls up to.
 *
 * G-081 — there used to be a `computeNodeStatus(config, nodeId)` returning this
 * directly. It had NO production caller: every real surface goes through
 * `autoWireIssuesToValidationErrors`, which applies a `manuallyBoundPorts`
 * filter that `computeNodeStatus` did not, so the two disagreed about a
 * ctx-bound port — one concept, two implementations, and the unreachable one
 * was the wrong one. Deleted rather than reconciled: an unused second answer is
 * a drift trap waiting for someone to call it.
 */
export type NodeStatus = "ok" | "ambiguous" | "unsatisfied";

/** A single input port that couldn't be auto-resolved. */
export interface NodeInputProblem {
  port: string;
  /** Human-readable label for user-facing messages; falls back to `port`. */
  label: string;
  kind: KindRef;
  status:
    | "ambiguous"
    | "unsatisfied"
    | "locked-unbound"
    | "locked-dangling"
    | "locked-kind-mismatch";
  /** `locked-dangling` / `locked-kind-mismatch` only: the broken binding's key. */
  ctxKey?: string;
}

/**
 * Full breakdown of a node's auto-wire input health, in port-declaration
 * order. `status` is the aggregate the status dot colours by (`ambiguous`
 * dominates `unsatisfied`); `problemPorts` is what drives the dot's tooltip
 * count and the click-to-fix deep-link (the consumer opens the picker for
 * `problemPorts[0]`).
 */
export interface NodeInputIssues {
  status: NodeStatus;
  problemPorts: NodeInputProblem[];
}

export function computeNodeInputIssues(
  config: GraphWorkflowConfig,
  nodeId: string,
): NodeInputIssues {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil")) {
    return { status: "ok", problemPorts: [] };
  }
  const entry = getActivityCatalogEntry(node.activityType);
  if (!entry) return { status: "ok", problemPorts: [] };

  const problemPorts: NodeInputProblem[] = [];
  for (const port of entry.inputs) {
    // Two port populations feed the problems surface:
    //   1. auto-wireable typed ports (kind defined, not base Artifact);
    //   2. REQUIRED base-`Artifact` identifier ports — the amber ring
    //      already fires for these on canvas, so the badge/drawer must
    //      count them too (ring/badge reconciliation, PORT_WIRING §4.2).
    // Optional identifier ports stay invisible — both the legacy
    // base-`Artifact` shape AND the typed Identifier family (2026-08-02
    // retag): an optional documentId/groupId with no upstream producer is
    // convention-fed (initialCtx / server default), not a problem.
    const isTypedIdentifier =
      port.kind !== undefined &&
      port.kind !== "Artifact" &&
      isAssignable(port.kind, "Identifier");
    if (isTypedIdentifier && port.required !== true) continue;
    const identifierPort = port.kind === "Artifact" && port.required === true;
    if (!shouldAutoWirePort(port) && !identifierPort) continue;
    const result = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: port.kind,
    });
    const isProblem =
      result.status === "ambiguous" ||
      result.status === "unsatisfied" ||
      // A pin whose ctx key lost its source, or whose source can't satisfy
      // the port, is broken however deliberately it was made (G-005). Unlike
      // a disconnect, this is NOT gated on `required`: the author asked for
      // this binding and it no longer works.
      result.status === "locked-dangling" ||
      result.status === "locked-kind-mismatch" ||
      // A disconnect is deliberate — only nag when the port is required.
      (result.status === "locked-unbound" && port.required === true);
    if (isProblem) {
      problemPorts.push({
        port: port.name,
        label: port.label ?? port.name,
        // `shouldAutoWirePort` guarantees a defined kind here; identifier
        // ports admitted above are kind "Artifact".
        kind: port.kind as KindRef,
        status: result.status as NodeInputProblem["status"],
        ...("ctxKey" in result ? { ctxKey: result.ctxKey } : {}),
      });
    }
  }

  const status: NodeStatus = problemPorts.some((p) => p.status === "ambiguous")
    ? "ambiguous"
    : problemPorts.length > 0
      ? "unsatisfied"
      : "ok";
  return { status, problemPorts };
}
