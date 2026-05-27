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

  // Map synthetic-producer pass: any reachable `map` node contributes one
  // synthetic producer of element type T, where T is derived by stripping
  // `[]` from the kind of the producer feeding the map's collection.
  for (const [producerNodeId, distance] of distances) {
    const producer = config.nodes[producerNodeId];
    if (!producer || producer.type !== "map") continue;
    const elementKind = resolveMapElementKind(config, producerNodeId);
    if (!elementKind) continue;
    if (isAssignable(elementKind, port.kind)) {
      candidates.push({
        producerNodeId,
        producerPort: producer.itemCtxKey,
        distance,
      });
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

/**
 * Resolves the element kind T for a map node whose collection has kind T[].
 * Walks every activity/pollUntil node to find the one whose output ctxKey
 * matches the map's collectionCtxKey, then strips the `[]` suffix from its
 * kind. Returns `undefined` when the element kind cannot be determined.
 */
function resolveMapElementKind(
  config: GraphWorkflowConfig,
  mapNodeId: string,
): string | undefined {
  const map = config.nodes[mapNodeId];
  if (!map || map.type !== "map") return undefined;
  const collectionKey = map.collectionCtxKey;
  if (!collectionKey) return undefined;
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    const output = node.outputs?.find((b) => b.ctxKey === collectionKey);
    if (!output) continue;
    const activityType = node.activityType;
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) continue;
    const portDescriptor = entry.outputs.find((p) => p.name === output.port);
    const kind = portDescriptor?.kind;
    if (!kind) continue;
    if (kind.endsWith("[]")) return kind.slice(0, -2);
  }
  return undefined;
}
