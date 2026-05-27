import type { GraphWorkflowConfig } from "../types";

/**
 * Reverse BFS from `consumerNodeId` over `config.edges`. Returns a map
 * from ancestor nodeId → shortest distance (in edges) to the consumer.
 *
 * Pure. O(nodes + edges). Cycle-safe by the visited-set guard.
 */
export function upstreamNodesWithDistance(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: { nodeId: string; distance: number }[] = [
    { nodeId: consumerNodeId, distance: 0 },
  ];
  const visited = new Set<string>([consumerNodeId]);

  // Bucket edges by target for O(1) reverse lookup per step.
  const edgesByTarget = new Map<string, string[]>();
  for (const edge of config.edges) {
    const bucket = edgesByTarget.get(edge.target);
    if (bucket) bucket.push(edge.source);
    else edgesByTarget.set(edge.target, [edge.source]);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const predecessors = edgesByTarget.get(current.nodeId) ?? [];
    for (const predecessor of predecessors) {
      if (visited.has(predecessor)) continue;
      visited.add(predecessor);
      distances.set(predecessor, current.distance + 1);
      queue.push({ nodeId: predecessor, distance: current.distance + 1 });
    }
  }

  return distances;
}
