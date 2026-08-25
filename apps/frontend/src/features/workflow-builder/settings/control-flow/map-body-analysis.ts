/**
 * Pure reachability analysis for a map node's per-iteration body.
 *
 * A map node marks its body with two node-id references: `bodyEntryNodeId`
 * (where each iteration starts) and `bodyExitNodeId` (the terminal node whose
 * output the matching Join collects). At runtime the engine runs the body
 * subgraph until the exit node completes, and **throws** if the ready set
 * empties before the exit is reached (see `executeBranchSubgraph` in
 * apps/temporal/src/graph-engine/node-executors.ts). That means the exit must
 * be reachable on *every* path out of the entry — a branching body that never
 * reconverges will stall on the branches that don't lead to the exit.
 *
 * These helpers surface that runtime constraint at author-time so the map
 * settings panel can warn before the workflow is ever run.
 */

import type { GraphWorkflowConfig } from "../../../../types/workflow";

export interface MapBodyAnalysis {
  /** True once both entry and exit are set and exist in the graph. */
  computed: boolean;
  /** Nodes reachable from the entry within the body (BFS stopping at exit). */
  bodyNodeIds: string[];
  /** Whether the exit node is reachable from the entry node. */
  exitReachable: boolean;
  /**
   * Body nodes (other than the exit) with no outgoing edge to another body
   * node — branches that terminate WITHOUT reaching the exit. An iteration
   * taking such a branch stalls at runtime because the exit never completes.
   */
  deadEndNodeIds: string[];
}

function buildAdjacency(config: GraphWorkflowConfig): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of config.edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  return adjacency;
}

/**
 * All nodes reachable from `entryNodeId` following outgoing edges (no early
 * stop). Used to restrict the body-exit picker to nodes that could actually be
 * an exit — a node outside the entry's reachable set can never be reached by an
 * iteration and so is never a valid exit. The entry itself is always included
 * (a single-node body is its own exit).
 */
export function nodesReachableFrom(
  config: GraphWorkflowConfig,
  entryNodeId: string | undefined,
): Set<string> {
  const reachable = new Set<string>();
  if (!entryNodeId || !config.nodes[entryNodeId]) return reachable;
  const adjacency = buildAdjacency(config);
  const queue: string[] = [entryNodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (reachable.has(id)) continue;
    if (!config.nodes[id]) continue;
    reachable.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }
  return reachable;
}

/**
 * Analyse a map body's reachability. Mirrors the runtime's BFS: it walks
 * outgoing edges from the entry but does NOT expand past the exit, then reports
 * whether the exit is reachable and which body branches dead-end before it.
 */
export function analyzeMapBody(
  config: GraphWorkflowConfig,
  entryNodeId: string | undefined,
  exitNodeId: string | undefined,
): MapBodyAnalysis {
  const empty: MapBodyAnalysis = {
    computed: false,
    bodyNodeIds: [],
    exitReachable: false,
    deadEndNodeIds: [],
  };
  if (!entryNodeId || !exitNodeId) return empty;
  if (!config.nodes[entryNodeId] || !config.nodes[exitNodeId]) return empty;

  const adjacency = buildAdjacency(config);

  const body = new Set<string>();
  const queue: string[] = [entryNodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (body.has(id)) continue;
    if (!config.nodes[id]) continue;
    body.add(id);
    if (id === exitNodeId) continue; // don't traverse past the exit
    for (const target of adjacency.get(id) ?? []) {
      if (!body.has(target)) queue.push(target);
    }
  }

  const exitReachable = body.has(exitNodeId);

  const deadEndNodeIds: string[] = [];
  for (const id of body) {
    if (id === exitNodeId) continue;
    const targets = adjacency.get(id) ?? [];
    const reachesBody = targets.some((t) => t !== id && body.has(t));
    if (!reachesBody) deadEndNodeIds.push(id);
  }

  return {
    computed: true,
    bodyNodeIds: [...body],
    exitReachable,
    deadEndNodeIds,
  };
}
