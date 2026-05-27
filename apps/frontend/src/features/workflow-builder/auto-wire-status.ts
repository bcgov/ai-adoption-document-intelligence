import {
  getActivityCatalogEntry,
  resolveInputPort,
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
    const result = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: port.kind,
    });
    if (result.status === "ambiguous") return "ambiguous";
    if (result.status === "unsatisfied") sawUnsatisfied = true;
  }
  return sawUnsatisfied ? "unsatisfied" : "ok";
}
