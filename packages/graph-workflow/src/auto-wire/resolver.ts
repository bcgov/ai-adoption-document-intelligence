// packages/graph-workflow/src/auto-wire/resolver.ts
import { getActivityCatalogEntry } from "../catalog";
import type {
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../types";
import { resolveInputPort } from "./resolve-input-port";
import { synthesiseCtxKey } from "./synthesise-ctx-key";

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

  for (const [consumerId, consumer] of Object.entries(config.nodes)) {
    if (consumer.type !== "activity" && consumer.type !== "pollUntil") {
      continue;
    }
    const activityType = consumer.activityType;
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) continue;

    let nextInputs = consumer.inputs ? [...consumer.inputs] : [];
    let inputsChanged = false;

    for (const port of entry.inputs) {
      if (!port.kind) continue;
      const result = resolveInputPort(
        { ...config, nodes: nextNodes },
        consumerId,
        { name: port.name, kind: port.kind },
      );
      if (result.status !== "auto-bound") continue;

      const producerCtxKey = ensureProducerOutputBinding(
        nextNodes,
        result.producerNodeId,
        result.producerPort,
      );

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
