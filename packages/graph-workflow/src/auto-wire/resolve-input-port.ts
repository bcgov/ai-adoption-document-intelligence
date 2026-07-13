// packages/graph-workflow/src/auto-wire/resolve-input-port.ts
import { getActivityCatalogEntry } from "../catalog";
import type { GraphWorkflowConfig } from "../types";
import type { KindRef } from "../types/artifacts";
import { isAssignable } from "../types/subtype-check";
import { getLockedInputPorts } from "./lock-list";
import { upstreamNodesWithDistance } from "./upstream-walk";

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

  // Base-`Artifact` ports are wildcard identifier ports (apimRequestId,
  // ocrResponse, modelId, documentId). Kind-matching is meaningless — every
  // artifact is assignable to the base type — so bind ONLY to a UNIQUE upstream
  // output whose port name exactly matches; otherwise leave the port for the
  // user rather than guessing. This is what lets Artifact-heavy chains (Azure
  // OCR submit→poll→extract) wire without hand-binding, while genuine config
  // ports with no upstream producer (modelId) stay unsatisfied.
  if (port.kind === "Artifact") {
    const named: Candidate[] = [];
    for (const [producerNodeId, distance] of distances) {
      const producer = config.nodes[producerNodeId];
      if (!producer) continue;
      for (const output of outputPortsFor(producer)) {
        if (output.name === port.name) {
          named.push({ producerNodeId, producerPort: output.name, distance });
        }
      }
    }
    const pick = uniqueNearest(named);
    return pick
      ? {
          status: "auto-bound",
          producerNodeId: pick.producerNodeId,
          producerPort: pick.producerPort,
        }
      : { status: "unsatisfied" };
  }

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

  // Name-match disambiguation. A kind-based tie is resolved when exactly one
  // candidate's OUTPUT PORT shares the consumer port's exact name — a strong
  // signal it's the intended source (e.g. `apimRequestId` → `apimRequestId`).
  // Prefer a unique same-named producer among the nearest tie; otherwise across
  // all distances. This only fires when kind-matching is ALREADY ambiguous, so
  // it never changes a port that auto-binds today — it just lets Artifact-heavy
  // chains (Azure OCR: apimRequestId, ocrResponse, …) wire without hand-binding.
  const uniqueByName = (pool: Candidate[]): Candidate | null => {
    const named = pool.filter((c) => c.producerPort === port.name);
    return named.length === 1 ? named[0] : null;
  };
  const nameMatch = uniqueByName(closest) ?? uniqueByName(candidates);
  if (nameMatch) {
    return {
      status: "auto-bound",
      producerNodeId: nameMatch.producerNodeId,
      producerPort: nameMatch.producerPort,
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

/**
 * From a list of same-named producer candidates, pick the single unambiguous
 * one: the sole candidate overall, or the sole candidate at the minimum
 * distance. Returns null when the choice is still ambiguous (don't guess).
 */
function uniqueNearest<
  T extends { producerNodeId: string; producerPort: string; distance: number },
>(list: T[]): T | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const min = Math.min(...list.map((c) => c.distance));
  const nearest = list.filter((c) => c.distance === min);
  return nearest.length === 1 ? nearest[0] : null;
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
