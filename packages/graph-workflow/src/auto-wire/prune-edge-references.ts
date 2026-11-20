// packages/graph-workflow/src/auto-wire/prune-edge-references.ts
import type { ErrorPolicy, GraphNode, GraphWorkflowConfig } from "../types";

/**
 * A control-flow field still naming an edge that is no longer in
 * `config.edges`.
 */
export interface DanglingEdgeReference {
  nodeId: string;
  edgeId: string;
  kind:
    | "switch-case"
    | "switch-default"
    | "human-gate-fallback"
    | "error-policy-fallback";
}

/**
 * G-029's counterpart to `findOrphanedCtxKeys`: four node fields point at an
 * edge *by id* rather than through the edge list, so removing an edge — either
 * directly, or as a side effect of deleting one of its endpoints — leaves them
 * naming something that is gone.
 *
 * Reports every such reference in node-record order. Call it AFTER the edges
 * have been filtered; unlike the ctx case, the answer is still available then
 * (a missing edge id stays missing), so this needs no pre-delete snapshot.
 */
export function findDanglingEdgeReferences(
  config: GraphWorkflowConfig,
): DanglingEdgeReference[] {
  const edgeIds = new Set((config.edges ?? []).map((e) => e.id));
  const dangling: DanglingEdgeReference[] = [];
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node) continue;
    if (node.type === "switch") {
      for (const branch of node.cases ?? []) {
        if (branch.edgeId && !edgeIds.has(branch.edgeId)) {
          dangling.push({ nodeId, edgeId: branch.edgeId, kind: "switch-case" });
        }
      }
      if (node.defaultEdge && !edgeIds.has(node.defaultEdge)) {
        dangling.push({
          nodeId,
          edgeId: node.defaultEdge,
          kind: "switch-default",
        });
      }
    }
    if (
      node.type === "humanGate" &&
      node.fallbackEdgeId &&
      !edgeIds.has(node.fallbackEdgeId)
    ) {
      dangling.push({
        nodeId,
        edgeId: node.fallbackEdgeId,
        kind: "human-gate-fallback",
      });
    }
    const policyEdge = node.errorPolicy?.fallbackEdgeId;
    if (policyEdge && !edgeIds.has(policyEdge)) {
      dangling.push({
        nodeId,
        edgeId: policyEdge,
        kind: "error-policy-fallback",
      });
    }
  }
  return dangling;
}

/**
 * Clears every reference `findDanglingEdgeReferences` reports.
 *
 * **Why a "fallback" policy is downgraded rather than just emptied.** Both
 * fallback modes are *defined by* their edge: with the edge gone the runtime
 * throws a non-retryable `GRAPH_EXECUTION_ERROR` (`error-handling.ts` and the
 * humanGate executor both do this), so clearing the id alone would leave a mode
 * that cannot run. Rewriting it to `"fail"` is therefore behaviour-preserving —
 * the run stops either way — and it is the conservative reading: the
 * alternatives (`"continue"` / `"skip"`) would silently carry on down a path
 * the author never chose.
 *
 * A dangling `switch.defaultEdge` is only cleared, never replaced. Which branch
 * should become the default is an authoring decision, and the validator already
 * reports the resulting "must have a defaultEdge", so the author is told rather
 * than guessed for.
 *
 * Returns the SAME config reference when nothing dangles — the common case, and
 * what lets callers `===`-skip a re-render. Pure.
 */
export function pruneEdgeReferences(
  config: GraphWorkflowConfig,
): GraphWorkflowConfig {
  const dangling = findDanglingEdgeReferences(config);
  if (dangling.length === 0) return config;

  const touched = new Set(dangling.map((ref) => ref.nodeId));
  const edgeIds = new Set((config.edges ?? []).map((e) => e.id));
  const nextNodes: Record<string, GraphNode> = { ...config.nodes };
  for (const nodeId of touched) {
    const node = config.nodes[nodeId];
    if (!node) continue;
    nextNodes[nodeId] = pruneNode(node, edgeIds);
  }
  return { ...config, nodes: nextNodes };
}

function pruneNode(node: GraphNode, edgeIds: ReadonlySet<string>): GraphNode {
  let next: GraphNode = node;
  if (next.type === "switch") {
    next = {
      ...next,
      cases: (next.cases ?? []).filter((branch) => edgeIds.has(branch.edgeId)),
      defaultEdge:
        next.defaultEdge && edgeIds.has(next.defaultEdge)
          ? next.defaultEdge
          : undefined,
    };
  }
  if (
    next.type === "humanGate" &&
    next.fallbackEdgeId &&
    !edgeIds.has(next.fallbackEdgeId)
  ) {
    const { fallbackEdgeId: _dropped, ...rest } = next;
    next = {
      ...rest,
      onTimeout: next.onTimeout === "fallback" ? "fail" : next.onTimeout,
    };
  }
  const policyEdge = next.errorPolicy?.fallbackEdgeId;
  if (next.errorPolicy && policyEdge && !edgeIds.has(policyEdge)) {
    const { fallbackEdgeId: _dropped, ...rest } = next.errorPolicy;
    const nextPolicy: ErrorPolicy = {
      ...rest,
      onError: rest.onError === "fallback" ? "fail" : rest.onError,
    };
    next = { ...next, errorPolicy: nextPolicy };
  }
  return next;
}
