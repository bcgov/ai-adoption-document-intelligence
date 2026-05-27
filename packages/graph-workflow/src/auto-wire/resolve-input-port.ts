// packages/graph-workflow/src/auto-wire/resolve-input-port.ts
import { getActivityCatalogEntry } from "../catalog";
import { isAssignable } from "../types/subtype-check";
import type { KindRef } from "../types/artifacts";
import type { GraphWorkflowConfig } from "../types";
import { upstreamNodesWithDistance } from "./upstream-walk";
import { getLockedInputPorts } from "./lock-list";

export type PortResolution =
  | { status: "auto-bound"; producerNodeId: string; producerPort: string }
  | {
      status: "ambiguous";
      candidates: { producerNodeId: string; producerPort: string }[];
    }
  | { status: "unsatisfied" }
  | { status: "locked"; ctxKey: string };

interface PortSpec {
  name: string;
  kind?: KindRef;
}

/**
 * Resolve a single input port on `consumerNodeId`. Lock check first; then
 * upstream BFS; then a kind-filtered candidate pass; then the
 * nearest-vs-tied decision. See AUTO_WIRE_DESIGN.md §2.1.
 */
export function resolveInputPort(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  port: PortSpec,
): PortResolution {
  const consumer = config.nodes[consumerNodeId];
  if (!consumer) return { status: "unsatisfied" };

  const lockList = getLockedInputPorts(consumer);

  if (lockList.includes(port.name)) {
    const existing = consumer.inputs?.find((b) => b.port === port.name);
    return { status: "locked", ctxKey: existing?.ctxKey ?? "" };
  }

  if (port.kind === undefined) {
    return { status: "unsatisfied" };
  }

  const distances = upstreamNodesWithDistance(config, consumerNodeId);
  type Candidate = {
    producerNodeId: string;
    producerPort: string;
    distance: number;
  };
  const candidates: Candidate[] = [];

  for (const [producerNodeId, distance] of distances) {
    const producer = config.nodes[producerNodeId];
    if (!producer) continue;
    const producerOutputs = outputPortsFor(producer);
    for (const output of producerOutputs) {
      if (output.kind === undefined) continue;
      if (isAssignable(output.kind, port.kind)) {
        candidates.push({
          producerNodeId,
          producerPort: output.name,
          distance,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { status: "unsatisfied" };
  }

  const minDistance = Math.min(...candidates.map((c) => c.distance));
  const closest = candidates.filter((c) => c.distance === minDistance);
  if (closest.length === 1) {
    return {
      status: "auto-bound",
      producerNodeId: closest[0].producerNodeId,
      producerPort: closest[0].producerPort,
    };
  }
  return {
    status: "ambiguous",
    candidates: closest.map((c) => ({
      producerNodeId: c.producerNodeId,
      producerPort: c.producerPort,
    })),
  };
}

interface OutputPortInfo {
  name: string;
  kind?: KindRef;
}

function outputPortsFor(
  node: GraphWorkflowConfig["nodes"][string],
): OutputPortInfo[] {
  if (node.type === "activity" || node.type === "pollUntil") {
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) return [];
    return entry.outputs.map((p) => ({ name: p.name, kind: p.kind }));
  }
  // Control-flow nodes have no catalog-declared outputs in v1 of this
  // resolver — `map`/`join`/`switch` get special-case treatment in later
  // tasks (Tasks 13–15). For now they contribute no producer candidates.
  return [];
}
