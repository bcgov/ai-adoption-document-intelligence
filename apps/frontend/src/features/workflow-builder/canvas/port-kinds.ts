/**
 * Catalog kind lookups for a node's per-port handles. Pure. Used by the
 * connect-gesture layer (drag-to-bind and the upcoming connect-time
 * validation) — NOT by rendering, which already gets kinds via
 * `computePortRows`.
 */
import { getActivityCatalogEntry, type KindRef } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

export function outputPortKind(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): KindRef | undefined {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil"))
    return undefined;
  return getActivityCatalogEntry(node.activityType)?.outputs.find(
    (p) => p.name === portName,
  )?.kind;
}

export function inputPortKind(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): KindRef | undefined {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil"))
    return undefined;
  return getActivityCatalogEntry(node.activityType)?.inputs.find(
    (p) => p.name === portName,
  )?.kind;
}

/** `in-<port>` / `out-<port>` → port name; null for node-level handles. */
export function portFromHandleId(
  handleId: string | null | undefined,
  direction: "input" | "output",
): string | null {
  const prefix = direction === "input" ? "in-" : "out-";
  if (!handleId || !handleId.startsWith(prefix)) return null;
  return handleId.slice(prefix.length);
}
