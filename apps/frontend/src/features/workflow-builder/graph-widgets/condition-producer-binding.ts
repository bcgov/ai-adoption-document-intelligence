/**
 * Pure producer↔ctxKey mapping behind "conditions from node outputs"
 * (PORT_WIRING_DESIGN §11). The condition step-picker stores the SAME ctx
 * path the resolver uses, so these helpers are the single place that maps a
 * producer port to its ctx key, guarantees the producer's output binding
 * exists (idempotently), and reverses a stored key back to a producer for
 * display. No React; every mutating function returns a NEW config or the
 * SAME reference on a no-op.
 */
import {
  getActivityCatalogEntry,
  synthesiseCtxKey,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

/**
 * The deterministic ctx key a producer port maps to: the producer's existing
 * output binding for that port if present, else the synthesised
 * `__auto.<nodeId>.<port>` key the resolver already understands.
 */
export function producerCtxKey(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): string {
  const producer = config.nodes[producerNodeId];
  const existing = producer?.outputs?.find((b) => b.port === port);
  return existing?.ctxKey ?? synthesiseCtxKey(producerNodeId, port);
}

/**
 * Idempotent. Returns a config in which the producer's output port is bound
 * to `producerCtxKey(...)`. If the binding already exists (or the node is
 * missing) the SAME config reference is returned so callers can `===`-skip a
 * re-render. Mirrors the drag-to-bind gesture's "ensure the producer carries
 * a matching outputs row".
 */
export function ensureProducerOutputBinding(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): GraphWorkflowConfig {
  const producer = config.nodes[producerNodeId];
  if (!producer) return config;
  if (producer.outputs?.some((b) => b.port === port)) return config;
  const ctxKey = synthesiseCtxKey(producerNodeId, port);
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [producerNodeId]: {
        ...producer,
        outputs: [...(producer.outputs ?? []), { port, ctxKey }],
      },
    },
  };
}

export interface ResolvedProducerRef {
  producerNodeId: string;
  nodeLabel: string;
  port: string;
  portLabel: string;
}

/**
 * Reverse-resolve a stored ctx key to its producing step + port for display.
 * Scans every activity/pollUntil node's catalog output ports and matches on
 * `producerCtxKey` (so both explicit bindings and synthesised `__auto` keys
 * resolve). When `consumerNodeId` is given, ties break to the nearest
 * upstream producer; otherwise to node-record order. Returns null when
 * nothing matches (→ raw-key fallback / manual sub-mode).
 */
export function resolveCtxKeyToProducer(
  config: GraphWorkflowConfig,
  ctxKey: string,
  consumerNodeId?: string,
): ResolvedProducerRef | null {
  if (ctxKey === "") return null;
  const distances = consumerNodeId
    ? upstreamNodesWithDistance(config, consumerNodeId)
    : null;
  let best: ResolvedProducerRef | null = null;
  let bestOrder = Number.MAX_SAFE_INTEGER;
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) continue;
    for (const out of entry.outputs) {
      if (producerCtxKey(config, nodeId, out.name) !== ctxKey) continue;
      const order = distances?.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
      if (best === null || order < bestOrder) {
        best = {
          producerNodeId: nodeId,
          nodeLabel: node.label || nodeId,
          port: out.name,
          portLabel: out.label,
        };
        bestOrder = order;
      }
    }
  }
  return best;
}
