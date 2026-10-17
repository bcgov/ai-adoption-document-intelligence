/**
 * What a drag begun on a step's node-level dot may become: a run-order wire,
 * or, from a switch or a step's error handle, a branch or an error path.
 *
 * Two such wires are refused, each with its reason:
 *
 *   - one that changes nothing: an edge of the same type already joins the
 *     two steps. A data wire carries a `normal` edge too, so a run-order wire
 *     drawn over a data wire is the same edge twice. Edges of DIFFERENT types
 *     between one pair are distinct connections (an error path alongside a
 *     run-order wire, say) and stay allowed.
 *   - one that would close a loop: the target already runs before the
 *     source, directly or through other steps. The workflow validator rejects
 *     any cycle, over every edge type, so the canvas refuses exactly that set
 *     as the wire is drawn.
 *
 * A wire to a step that already runs later by another route (A → B → C, then
 * A → C) is neither, and is allowed: it is harmless, and it is a real wire
 * the author can see and remove.
 *
 * Pure — the same config and endpoints always yield the same verdict. Shared
 * by `isValidConnection` (which refuses the drop, so the wire never snaps),
 * `handleConnect` (which never writes a refused edge) and `handleConnectEnd`
 * (which says why), so the three can never disagree.
 */

import type { GraphEdge, GraphWorkflowConfig } from "../../../types/workflow";
import { deriveWires } from "./derive-wires";

export type RunOrderDropVerdict =
  /** Nothing in the way — draw it. */
  | { kind: "ok" }
  /** `edgeId` already joins the two steps with an edge of the same type. */
  | { kind: "duplicate"; edgeId: string }
  /** The target already runs before the source. */
  | { kind: "loop" };

/**
 * The edge type a drag from a node-level dot becomes (US-025): `error` from
 * the error handle, `conditional` out of a switch, `normal` otherwise. The
 * handle id wins over the source's type, so an error-handle drag from a
 * switch is still tagged as an error path.
 */
export function nodeLevelEdgeType(
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  sourceHandle: string | null | undefined,
): GraphEdge["type"] {
  if (sourceHandle === "error") return "error";
  return config.nodes[sourceNodeId]?.type === "switch"
    ? "conditional"
    : "normal";
}

/** Decide whether a node-level drag from `sourceNodeId` to `targetNodeId` may be drawn. */
export function resolveRunOrderDrop(
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: GraphEdge["type"],
): RunOrderDropVerdict {
  const existing = config.edges.find(
    (e) =>
      e.source === sourceNodeId &&
      e.target === targetNodeId &&
      e.type === edgeType,
  );
  if (existing) return { kind: "duplicate", edgeId: existing.id };
  if (reaches(config, targetNodeId, sourceNodeId)) return { kind: "loop" };
  return { kind: "ok" };
}

/** Whether `to` can be reached from `from` along edges of any type. */
function reaches(
  config: GraphWorkflowConfig,
  from: string,
  to: string,
): boolean {
  const targetsBySource = new Map<string, string[]>();
  for (const e of config.edges) {
    const targets = targetsBySource.get(e.source);
    if (targets) targets.push(e.target);
    else targetsBySource.set(e.source, [e.target]);
  }
  const queue = [from];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] === to) return true;
    for (const next of targetsBySource.get(queue[i]) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * The sentence shown when a node-level drag is refused, naming both cards by
 * their own labels. A refused run-order wire says what already sets the
 * order — the data wire between the two steps, or a run-order wire already
 * drawn — so the author can see why nothing new appeared.
 */
export function runOrderRefusalMessage(
  verdict: RunOrderDropVerdict,
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: GraphEdge["type"],
): string | null {
  if (verdict.kind === "ok") return null;
  const source = config.nodes[sourceNodeId]?.label ?? sourceNodeId;
  const target = config.nodes[targetNodeId]?.label ?? targetNodeId;
  if (verdict.kind === "loop") {
    return `That would make a loop: "${source}" already runs after "${target}".`;
  }
  if (edgeType === "conditional") {
    return `"${source}" already branches to "${target}".`;
  }
  if (edgeType === "error") {
    return `"${source}" already sends its errors to "${target}".`;
  }
  // `deriveWires` stamps a normal edge's id onto the data wires it carries;
  // an edge that carries none is drawn as the dashed run-order wire.
  const carriesData = deriveWires(config).some(
    (wire) => wire.variant === "data" && wire.edgeId === verdict.edgeId,
  );
  return carriesData
    ? `"${target}" already runs after "${source}": the data wire between them sets the order.`
    : `"${target}" already runs after "${source}": a run-order wire already joins them.`;
}
