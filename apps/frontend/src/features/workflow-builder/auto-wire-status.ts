import {
  getActivityCatalogEntry,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../types/workflow";

export type NodeStatus = "ok" | "ambiguous" | "unsatisfied";

export function computeNodeStatus(
  config: GraphWorkflowConfig,
  nodeId: string,
): NodeStatus {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil")) {
    return "ok";
  }
  const activityType = node.activityType;
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return "ok";
  let sawUnsatisfied = false;
  for (const port of entry.inputs) {
    // Ports with no kind or the base Artifact kind are identifier-style ports
    // that should not participate in auto-wire status computation.
    if (!shouldAutoWirePort(port)) continue;
    const result = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: port.kind,
    });
    if (result.status === "ambiguous") return "ambiguous";
    if (result.status === "unsatisfied") sawUnsatisfied = true;
  }
  return sawUnsatisfied ? "unsatisfied" : "ok";
}
