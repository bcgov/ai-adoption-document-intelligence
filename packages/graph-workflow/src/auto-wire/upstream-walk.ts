import type { GraphWorkflowConfig, MapNode } from "../types";

/**
 * Reverse BFS from `consumerNodeId` over `config.edges`. Returns a map
 * from ancestor nodeId → shortest distance (in edges) to the consumer.
 *
 * **A map's body counts as inside the map (G-106, ruling A).** A map reaches
 * its body through the `bodyEntryNodeId` *setting*, not through an edge — so a
 * pure `config.edges` walk starting inside the body reaches nothing at all:
 * not the map (so the loop item never auto-binds) and not anything before it
 * (because the map was the only way back out). Both shipped maps have exactly
 * that shape, which is why every map-item binding in the product had to be
 * hand-typed and loaded as "Pinned by you".
 *
 * We therefore treat `map ⇢ bodyEntryNodeId` as an edge for reachability. The
 * resulting distances give the ordering the ruling asks for at no extra cost:
 * an in-body producer outranks the map (it is more local than the item), and
 * the map outranks anything outside the loop (so the item wins a same-kind tie
 * instead of turning every in-loop binding ambiguous).
 *
 * This makes auto-wire agree with the three subsystems that already treat a
 * body node as inside the map — the canvas body box, the variable picker's
 * scope (`analyzeMapBody`) and the runtime.
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
  const addPredecessor = (target: string, source: string): void => {
    const bucket = edgesByTarget.get(target);
    if (bucket) {
      // A hand-drawn map→bodyEntry edge and the implicit one are the same
      // link; recording it twice would not change BFS distance but would
      // make the buckets misleading to read.
      if (!bucket.includes(source)) bucket.push(source);
    } else {
      edgesByTarget.set(target, [source]);
    }
  };

  for (const edge of config.edges) addPredecessor(edge.target, edge.source);

  // Implicit map ⇢ body-entry link. Self-referential bodies are malformed but
  // must not be recorded, or the map becomes its own predecessor.
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "map") continue;
    const { bodyEntryNodeId } = node as MapNode;
    if (!bodyEntryNodeId || bodyEntryNodeId === node.id) continue;
    addPredecessor(bodyEntryNodeId, node.id);
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
