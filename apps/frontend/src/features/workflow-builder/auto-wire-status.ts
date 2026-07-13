import {
  getActivityCatalogEntry,
  type KindRef,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";

export type NodeStatus = "ok" | "ambiguous" | "unsatisfied";

/** A single input port that couldn't be auto-resolved. */
export interface NodeInputProblem {
  port: string;
  /** Human-readable label for user-facing messages; falls back to `port`. */
  label: string;
  kind: KindRef;
  status: "ambiguous" | "unsatisfied";
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
    // Ports with no kind or the base Artifact kind are identifier-style ports
    // that should not participate in auto-wire status computation.
    if (!shouldAutoWirePort(port)) continue;
    const result = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: port.kind,
    });
    if (result.status === "ambiguous" || result.status === "unsatisfied") {
      problemPorts.push({
        port: port.name,
        label: port.label ?? port.name,
        // `shouldAutoWirePort` guarantees a defined, non-Artifact kind here.
        kind: port.kind as KindRef,
        status: result.status,
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

export function computeNodeStatus(
  config: GraphWorkflowConfig,
  nodeId: string,
): NodeStatus {
  return computeNodeInputIssues(config, nodeId).status;
}
