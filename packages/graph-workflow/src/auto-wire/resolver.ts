// packages/graph-workflow/src/auto-wire/resolver.ts
import { getActivityCatalogEntry } from "../catalog";
import type {
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../types";
import { resolveInputPort } from "./resolve-input-port";
import { synthesiseCtxKey } from "./synthesise-ctx-key";
import { getLockedInputPorts, getLockedOutputPorts } from "./lock-list";
import { upstreamNodesWithDistance } from "./upstream-walk";

/**
 * Walks every typed input port on every consumer node, fills unlocked
 * ports with auto-bindings, and stamps matching output bindings on
 * producers. Idempotent. Pure. See AUTO_WIRE_DESIGN.md §2.
 */
export function resolveBindings(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  // Start from a shallow node copy so per-node mutations don't escape.
  const nextNodes: Record<string, GraphNode> = { ...config.nodes };

  // Per-map pass: auto-bind map.collectionCtxKey to the nearest upstream T[]
  // producer when collectionCtxKey is empty and the port is not locked.
  // This MUST run before the activity input port resolution loop so that the
  // synthetic-producer pass in resolve-input-port.ts can find the element kind.
  for (const [mapId, mapNode] of Object.entries(nextNodes)) {
    if (mapNode.type !== "map") continue;
    const lockList = getLockedInputPorts(mapNode);
    if (lockList.includes("collection")) continue;
    if (mapNode.collectionCtxKey) continue;
    const distances = upstreamNodesWithDistance(
      { ...config, nodes: nextNodes },
      mapId,
    );
    const candidates: {
      producerNodeId: string;
      producerPort: string;
      distance: number;
    }[] = [];
    for (const [producerNodeId, distance] of distances) {
      const producer = nextNodes[producerNodeId];
      if (
        !producer ||
        (producer.type !== "activity" && producer.type !== "pollUntil")
      ) {
        continue;
      }
      const activityType = producer.activityType;
      const entry = getActivityCatalogEntry(activityType);
      if (!entry) continue;
      for (const out of entry.outputs) {
        if (!out.kind?.endsWith("[]")) continue;
        candidates.push({
          producerNodeId,
          producerPort: out.name,
          distance,
        });
      }
    }
    if (candidates.length === 0) continue;
    const minDistance = Math.min(...candidates.map((c) => c.distance));
    const closest = candidates.filter((c) => c.distance === minDistance);
    if (closest.length !== 1) continue; // ambiguous — leave for user
    const winner = closest[0];
    const ctxKey = ensureProducerOutputBinding(
      nextNodes,
      winner.producerNodeId,
      winner.producerPort,
    );
    nextNodes[mapId] = { ...mapNode, collectionCtxKey: ctxKey };
  }

  // Per-join pass: auto-fill join.resultsCtxKey when absent and not locked.
  for (const [joinId, joinNode] of Object.entries(nextNodes)) {
    if (joinNode.type !== "join") continue;
    const lockList = getLockedOutputPorts(joinNode);
    if (lockList.includes("results")) continue;
    if (joinNode.resultsCtxKey) continue;
    nextNodes[joinId] = {
      ...joinNode,
      resultsCtxKey: synthesiseCtxKey(joinId, "results"),
    };
  }

  // Activity / pollUntil input port resolution — runs after the map pass so
  // that map.collectionCtxKey is already populated and the synthetic-producer
  // element-kind lookup in resolve-input-port.ts can succeed.
  for (const [consumerId, consumer] of Object.entries(nextNodes)) {
    if (consumer.type !== "activity" && consumer.type !== "pollUntil") {
      continue;
    }
    const activityType = consumer.activityType;
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) continue;

    let nextInputs = consumer.inputs ? [...consumer.inputs] : [];
    let inputsChanged = false;

    for (const port of entry.inputs) {
      // Skip kindless ports and base-Artifact ports. `kind: "Artifact"` is
      // the catalog's "non-taxonomy" marker per the all-or-nothing invariant
      // (US-103). It is too broad to auto-wire: any Artifact subtype is
      // assignable to it, which would spuriously bind identifier / config
      // ports (groupId, documentId, apimRequestId, enrichmentSummary, …) to
      // unrelated upstream producers. See AUTO_WIRE_DESIGN.md §2.
      if (!port.kind || port.kind === "Artifact") continue;
      const result = resolveInputPort(
        { ...config, nodes: nextNodes },
        consumerId,
        { name: port.name, kind: port.kind },
      );
      if (result.status !== "auto-bound") continue;

      const producerNode = nextNodes[result.producerNodeId];
      let producerCtxKey: string;
      if (producerNode?.type === "map") {
        producerCtxKey = producerNode.itemCtxKey;
      } else {
        producerCtxKey = ensureProducerOutputBinding(
          nextNodes,
          result.producerNodeId,
          result.producerPort,
        );
      }

      const existing = nextInputs.find((b) => b.port === port.name);
      if (existing && existing.ctxKey === producerCtxKey) continue;
      nextInputs = nextInputs.filter((b) => b.port !== port.name);
      nextInputs.push({ port: port.name, ctxKey: producerCtxKey });
      inputsChanged = true;
    }

    if (inputsChanged) {
      nextNodes[consumerId] = {
        ...consumer,
        inputs: nextInputs,
      } as GraphNode;
    }
  }

  if (sameNodes(config.nodes, nextNodes)) return config;
  return { ...config, nodes: nextNodes };
}

/**
 * Ensure the producer node carries an `outputs[]` row for `portName`.
 * Returns the ctx key the row resolves to (reusing the existing key if
 * any, synthesising one otherwise).
 */
function ensureProducerOutputBinding(
  nodes: Record<string, GraphNode>,
  producerId: string,
  portName: string,
): string {
  const producer = nodes[producerId];
  if (!producer) return synthesiseCtxKey(producerId, portName);
  const existingOutputs: PortBinding[] = producer.outputs
    ? [...producer.outputs]
    : [];
  const existing = existingOutputs.find((b) => b.port === portName);
  if (existing) return existing.ctxKey;

  const ctxKey = synthesiseCtxKey(producerId, portName);
  existingOutputs.push({ port: portName, ctxKey });
  nodes[producerId] = { ...producer, outputs: existingOutputs } as GraphNode;
  return ctxKey;
}

function sameNodes(
  before: Record<string, GraphNode>,
  after: Record<string, GraphNode>,
): boolean {
  const beforeKeys = Object.keys(before);
  if (beforeKeys.length !== Object.keys(after).length) return false;
  for (const k of beforeKeys) {
    if (before[k] !== after[k]) return false;
  }
  return true;
}
