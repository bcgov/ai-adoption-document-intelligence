/**
 * Pure config transforms behind the port-wiring gestures
 * (PORT_WIRING_DESIGN.md §6). One module so the canvas drag gesture, the
 * wire context menu, the delete path, and the settings panel's
 * "Change source" all write bindings identically. Every function returns a
 * NEW config (or the input config unchanged when the operation is a no-op);
 * callers dispatch the result through `onConfigChange`, where
 * `resolveBindings` runs as usual.
 */
import { getLockedInputPorts, synthesiseCtxKey } from "@ai-di/graph-workflow";
import type {
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";

export interface ProducerSelection {
  producerNodeId: string;
  producerPort: string;
}

/** Matches the canvas's existing edge-id shape. */
export function makeEdgeId(): string {
  return `edge-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * §6.1 — pin `consumerPort` to the selected producer output: stamp the
 * consumer `inputs[]` row, ensure the producer carries a matching
 * `outputs[]` row (reusing its ctx key when present), and add the port to
 * `metadata.lockedInputPorts`.
 */
export function pinPortBinding(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  consumerPort: string,
  selection: ProducerSelection,
): GraphWorkflowConfig {
  if (consumerNodeId === selection.producerNodeId) return config;
  const consumer = config.nodes[consumerNodeId];
  const producer = config.nodes[selection.producerNodeId];
  if (!consumer || !producer) return config;

  const existingOutputBinding = producer.outputs?.find(
    (b) => b.port === selection.producerPort,
  );
  const ctxKey =
    existingOutputBinding?.ctxKey ??
    synthesiseCtxKey(selection.producerNodeId, selection.producerPort);
  const nextProducerOutputs = existingOutputBinding
    ? (producer.outputs ?? [])
    : [...(producer.outputs ?? []), { port: selection.producerPort, ctxKey }];
  const nextConsumerInputs = [
    ...(consumer.inputs ?? []).filter((b) => b.port !== consumerPort),
    { port: consumerPort, ctxKey },
  ];
  const nextLocks = Array.from(
    new Set([...getLockedInputPorts(consumer), consumerPort]),
  );
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [selection.producerNodeId]: {
        ...producer,
        outputs: nextProducerOutputs,
      } as GraphNode,
      [consumerNodeId]: {
        ...consumer,
        inputs: nextConsumerInputs,
        metadata: {
          ...(consumer.metadata ?? {}),
          lockedInputPorts: nextLocks,
        },
      } as GraphNode,
    },
  };
}

/**
 * §6.3 — delete a data wire: remove the consumer's input binding and lock
 * the port WITHOUT a binding ("pinned unbound"), so the resolver reports
 * `locked-unbound` instead of instantly re-creating the same wire. The
 * producer's outputs row stays — other consumers may read the same ctx key.
 */
export function disconnectDataWire(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  consumerPort: string,
): GraphWorkflowConfig {
  const consumer = config.nodes[consumerNodeId];
  if (!consumer) return config;
  const nextInputs = (consumer.inputs ?? []).filter(
    (b) => b.port !== consumerPort,
  );
  const nextLocks = Array.from(
    new Set([...getLockedInputPorts(consumer), consumerPort]),
  );
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [consumerNodeId]: {
        ...consumer,
        inputs: nextInputs,
        metadata: {
          ...(consumer.metadata ?? {}),
          lockedInputPorts: nextLocks,
        },
      } as GraphNode,
    },
  };
}

/**
 * §7 — hand the port back to the resolver: drop the lock (and the
 * metadata field when the list empties). The next `resolveBindings` pass
 * re-derives the binding.
 */
export function revertPortToAutomatic(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): GraphWorkflowConfig {
  const node = config.nodes[nodeId];
  if (!node) return config;
  const nextLocks = getLockedInputPorts(node).filter((p) => p !== portName);
  const nextMetadata: Record<string, unknown> = { ...(node.metadata ?? {}) };
  if (nextLocks.length > 0) {
    nextMetadata.lockedInputPorts = nextLocks;
  } else {
    delete nextMetadata.lockedInputPorts;
  }
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [nodeId]: { ...node, metadata: nextMetadata } as GraphNode,
    },
  };
}

/**
 * §6.1 — one gesture = data + order: make sure an edge connects the pair.
 * Skipped when ANY edge already links the two nodes in either direction
 * (a reverse edge means adding a forward one would mint a 2-cycle — the
 * data wire renders regardless of execution path, per §5.1). Switch
 * sources stamp `conditional`, everything else `normal`.
 */
export function ensureEdgeBetween(
  config: GraphWorkflowConfig,
  sourceId: string,
  targetId: string,
): GraphWorkflowConfig {
  const connected = config.edges.some(
    (e) =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId),
  );
  if (connected) return config;
  const sourceNode = config.nodes[sourceId];
  const newEdge: GraphEdge = {
    id: makeEdgeId(),
    source: sourceId,
    target: targetId,
    type: sourceNode?.type === "switch" ? "conditional" : "normal",
  };
  return { ...config, edges: [...config.edges, newEdge] };
}
