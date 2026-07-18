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
  type KindRef,
  synthesiseCtxKey,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import type {
  ConditionExpression,
  GraphWorkflowConfig,
  ValueRef,
} from "../../../types/workflow";

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
  /** Catalog kind of the producing port, when declared. */
  portKind?: KindRef;
  /** Field path AFTER the producer's ctx key ("status", "a.b") for drilled refs. */
  fieldPath?: string;
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
  let bestIsExact = false;
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) continue;
    for (const out of entry.outputs) {
      const key = producerCtxKey(config, nodeId, out.name);
      const isExact = key === ctxKey;
      // Drilled ref: the ctx key is `<producerKey>.<field...>`. Match only on
      // a dot boundary so `ocrResultX` never resolves to the `ocrResult` port.
      const isDrilled = !isExact && ctxKey.startsWith(`${key}.`);
      if (!isExact && !isDrilled) continue;
      // Prefer an exact producer over a drilled one; among equals, nearer wins.
      if (best !== null && bestIsExact && !isExact) continue;
      const order = distances?.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
      const beatsBest =
        best === null || (isExact && !bestIsExact) || order < bestOrder;
      if (beatsBest) {
        best = {
          producerNodeId: nodeId,
          nodeLabel: node.label || nodeId,
          port: out.name,
          portLabel: out.label,
          portKind: out.kind,
          fieldPath: isDrilled ? ctxKey.slice(key.length + 1) : undefined,
        };
        bestOrder = order;
        bestIsExact = isExact;
      }
    }
  }
  return best;
}

function collectValueRef(v: ValueRef, out: string[]): void {
  if ("ref" in v && typeof v.ref === "string" && v.ref !== "") out.push(v.ref);
}

/** Collect every non-empty ValueRef `ref` in a condition expression tree. */
function collectConditionRefs(
  expr: ConditionExpression | undefined,
  out: string[] = [],
): string[] {
  if (!expr) return out;
  switch (expr.operator) {
    case "and":
    case "or":
      for (const op of expr.operands) collectConditionRefs(op, out);
      break;
    case "not":
      collectConditionRefs(expr.operand, out);
      break;
    case "is-null":
    case "is-not-null":
      collectValueRef(expr.value, out);
      break;
    case "in":
    case "not-in":
      collectValueRef(expr.value, out);
      collectValueRef(expr.list, out);
      break;
    case "equals":
    case "not-equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      collectValueRef(expr.left, out);
      collectValueRef(expr.right, out);
      break;
  }
  return out;
}

/**
 * Reconcile producer output bindings for a control-flow node's condition(s):
 * for every ValueRef `ref` inside the node's condition(s) that resolves to a
 * producer port, guarantee that producer carries the matching `outputs[]`
 * binding (so the executor writes the ctx key the condition reads). Idempotent;
 * returns the SAME config reference when nothing needs adding. Covers `switch`
 * (each case condition) and `pollUntil` (the single condition); any other node
 * type is returned unchanged.
 */
export function ensureConditionProducerBindings(
  config: GraphWorkflowConfig,
  nodeId: string,
): GraphWorkflowConfig {
  const node = config.nodes[nodeId];
  if (!node) return config;
  const refs: string[] = [];
  if (node.type === "switch") {
    for (const c of node.cases) collectConditionRefs(c.condition, refs);
  } else if (node.type === "pollUntil") {
    collectConditionRefs(node.condition, refs);
  } else {
    return config;
  }
  let next = config;
  for (const ref of refs) {
    const producer = resolveCtxKeyToProducer(next, ref);
    if (producer) {
      next = ensureProducerOutputBinding(
        next,
        producer.producerNodeId,
        producer.port,
      );
    }
  }
  return next;
}
