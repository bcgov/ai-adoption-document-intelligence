/**
 * Pure config transforms behind the port-wiring gestures
 * (PORT_WIRING_DESIGN.md §6). One module so the canvas drag gesture, the
 * wire context menu, the delete path, and the settings panel's
 * "Change source" all write bindings identically. Every function returns a
 * NEW config object; callers dispatch the result through `onConfigChange`,
 * where `resolveBindings` runs as usual. Two kinds of no-op are possible:
 * guard paths (missing node, self-referencing pin/edge, an edge that already
 * connects the pair) return the SAME config reference, so callers can
 * `===`-compare to skip a re-render; semantic no-ops (re-pinning the
 * identical producer/port, disconnecting an already-disconnected port)
 * still return a NEW, deep-equal config.
 */
import {
  getActivityCatalogEntry,
  getLockedInputPorts,
  resolveInputPort,
  synthesiseCtxKey,
} from "@ai-di/graph-workflow";
import type { GraphEdge, GraphWorkflowConfig } from "../../../types/workflow";

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
      },
      [consumerNodeId]: {
        ...consumer,
        inputs: nextConsumerInputs,
        metadata: {
          ...(consumer.metadata ?? {}),
          lockedInputPorts: nextLocks,
        },
      },
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
      },
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
      [nodeId]: { ...node, metadata: nextMetadata },
    },
  };
}

/**
 * §6.3/§7 — "connect again = wire again". When the user draws a fresh
 * node-level execution edge into `targetNodeId`, clear any `locked-unbound`
 * ("Disconnected by you") lock on that node's port(s) that the new upstream
 * edge now makes auto-bindable — so a re-drawn edge auto-wires just like the
 * first connect did, instead of staying stuck behind a stale delete-lock.
 *
 * Only clears locked-UNBOUND ports (no `inputs[]` binding, or a binding with
 * a falsy `ctxKey`). A locked-BOUND port is a source the user explicitly
 * pinned (§6.1) — left untouched. For each candidate, a trial config with
 * that single lock removed is run through `resolveInputPort`; the lock is
 * dropped ONLY when the trial reports `auto-bound`. Ports that would still be
 * `unsatisfied`/`ambiguous` keep their lock (the in-place delete behaviour is
 * preserved — only an explicit connect that actually re-satisfies the port
 * clears it). Returns the SAME config reference when nothing changes, so
 * callers can `===`-skip.
 *
 * Must run against a config that ALREADY includes the new edge, so the new
 * source counts as upstream when the resolver checks. It only DECIDES which
 * locks to drop; the host's `resolveBindings` pass writes the actual binding.
 */
export function clearReconnectableLocks(
  config: GraphWorkflowConfig,
  targetNodeId: string,
): GraphWorkflowConfig {
  const target = config.nodes[targetNodeId];
  if (!target) return config;
  if (target.type !== "activity" && target.type !== "pollUntil") return config;

  const lockedPorts = getLockedInputPorts(target);
  if (lockedPorts.length === 0) return config;

  const entry = getActivityCatalogEntry(target.activityType);
  if (!entry) return config;

  const portsToUnlock: string[] = [];
  for (const portName of lockedPorts) {
    // Locked-BOUND (pinned) ports carry a real binding — never clear those.
    const existing = target.inputs?.find((b) => b.port === portName);
    if (existing?.ctxKey) continue;

    // Only catalog-declared input ports can auto-wire; the descriptor's kind
    // is what the resolver matches against upstream producers.
    const descriptor = entry.inputs.find((p) => p.name === portName);
    if (!descriptor) continue;

    // Trial: unlock just this port, then ask the resolver whether the new
    // upstream now satisfies it.
    const trial = revertPortToAutomatic(config, targetNodeId, portName);
    const resolution = resolveInputPort(trial, targetNodeId, {
      name: portName,
      kind: descriptor.kind,
    });
    if (resolution.status === "auto-bound") {
      portsToUnlock.push(portName);
    }
  }

  if (portsToUnlock.length === 0) return config;

  let next = config;
  for (const portName of portsToUnlock) {
    next = revertPortToAutomatic(next, targetNodeId, portName);
  }
  return next;
}

/**
 * §6.1 — one gesture = data + order: make sure an edge connects the pair.
 * Skipped when ANY edge already links the two nodes in either direction
 * (a reverse edge means adding a forward one would mint a 2-cycle — the
 * data wire renders regardless of execution path, per §5.1). Switch
 * sources stamp `conditional`, everything else `normal`. A pair already
 * linked only by a same-direction edge of a DIFFERENT type (e.g. an
 * `error` or `conditional` edge, with no `normal` edge between them) also
 * counts as "already connected" — no `normal` edge is added, so the data
 * wire renders without a normal-path execution-order guarantee, consistent
 * with how §5.1 renders data wires independent of the underlying edge type.
 */
export function ensureEdgeBetween(
  config: GraphWorkflowConfig,
  sourceId: string,
  targetId: string,
): GraphWorkflowConfig {
  if (sourceId === targetId) return config;
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
