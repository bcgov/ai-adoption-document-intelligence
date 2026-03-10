/**
 * Graph Algorithms
 *
 * DAG structural operations: topological sort and ready-set computation.
 */

import { ApplicationFailure } from "@temporalio/workflow";
import type { GraphWorkflowConfig } from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";

/**
 * Compute stable topological order using Kahn's algorithm with alphabetical tiebreaker
 */
export function computeTopologicalOrder(config: GraphWorkflowConfig): string[] {
  const nodes = Object.keys(config.nodes);
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // Initialize
  for (const nodeId of nodes) {
    inDegree.set(nodeId, 0);
    adjacencyList.set(nodeId, []);
  }

  // Build graph (only count normal edges for topological sort)
  for (const edge of config.edges) {
    if (edge.type === "normal") {
      const currentDegree = inDegree.get(edge.target) ?? 0;
      inDegree.set(edge.target, currentDegree + 1);

      const neighbors = adjacencyList.get(edge.source) ?? [];
      neighbors.push(edge.target);
      adjacencyList.set(edge.source, neighbors);
    }
  }

  // Kahn's algorithm with alphabetical ordering
  const queue: string[] = [];
  const result: string[] = [];

  // Start with entry node (zero in-degree)
  for (const nodeId of nodes) {
    if ((inDegree.get(nodeId) ?? 0) === 0) {
      queue.push(nodeId);
    }
  }

  // Sort queue alphabetically for stable ordering
  queue.sort();

  while (queue.length > 0) {
    // Always sort queue for stable ordering
    queue.sort();

    const current = queue.shift()!;
    result.push(current);

    const neighbors = adjacencyList.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (result.length !== nodes.length) {
    throw ApplicationFailure.create({
      type: "GRAPH_EXECUTION_ERROR",
      message: "Cycle detected in graph",
      nonRetryable: true,
    });
  }

  return result;
}

/**
 * Compute ready set: nodes whose all incoming edges have completed sources
 *
 * A node is ready if:
 * - It has at least one satisfied incoming edge, AND
 * - All source nodes with edges to this node are either:
 *   - Completed with at least one edge satisfied, OR
 *   - Not yet reached
 */
export function computeReadySet(
  config: GraphWorkflowConfig,
  state: ExecutionState,
): string[] {
  const readyNodes: string[] = [];

  for (const nodeId of Object.keys(config.nodes)) {
    // Skip if already completed
    if (state.completedNodeIds.has(nodeId)) {
      continue;
    }

    // Entry node is ready if not completed
    if (nodeId === config.entryNodeId) {
      readyNodes.push(nodeId);
      continue;
    }

    // Find all incoming edges
    const incomingEdges = config.edges.filter((e) => e.target === nodeId);

    if (incomingEdges.length === 0) {
      continue; // Not the entry node and no incoming edges - skip
    }

    // Group edges by source node
    const edgesBySource = new Map<string, typeof incomingEdges>();
    for (const edge of incomingEdges) {
      const edges = edgesBySource.get(edge.source) || [];
      edges.push(edge);
      edgesBySource.set(edge.source, edges);
    }

    // Check if all reachable source nodes with relevant edges are completed
    let hasAnySatisfiedEdge = false;
    let allRelevantSourcesSatisfied = true;

    for (const [sourceNodeId, edges] of edgesBySource) {
      const isSourceCompleted = state.completedNodeIds.has(sourceNodeId);
      const selectedEdgeFromSource = state.selectedEdges.get(sourceNodeId);

      // Check if any outgoing edges from this source to our target node are relevant
      const hasRelevantEdges = edges.some((edge) => {
        if (selectedEdgeFromSource === undefined) {
          // No explicit edge selection - normal edges are implicitly selected
          return edge.type === "normal";
        } else {
          // Explicit edge selection - only the selected edge is relevant
          return selectedEdgeFromSource === edge.id;
        }
      });

      if (!hasRelevantEdges) {
        // No relevant edges from this source - skip it (source chose different branch)
        continue;
      }

      if (!isSourceCompleted) {
        // Source has relevant edges but hasn't completed - check if it's reachable
        const incomingEdges = config.edges.filter(
          (e) => e.target === sourceNodeId,
        );
        const isReachable =
          incomingEdges.length === 0 || // Entry node - always reachable
          incomingEdges.some((e) => {
            if (e.type === "normal") {
              // Has normal incoming edge - check if source of that edge completed
              return state.completedNodeIds.has(e.source);
            }
            if (e.type === "conditional" || e.type === "error") {
              // Incoming conditional was selected
              return state.selectedEdges.get(e.source) === e.id;
            }
            return false;
          });

        if (isReachable) {
          // Source is reachable but not completed - need to wait for it
          allRelevantSourcesSatisfied = false;
          break;
        } else {
          // Source is unreachable - skip it (will never execute)
          continue;
        }
      }

      // Source completed and has relevant edges
      hasAnySatisfiedEdge = true;
    }

    if (allRelevantSourcesSatisfied && hasAnySatisfiedEdge) {
      readyNodes.push(nodeId);
    }
  }

  return readyNodes;
}

/**
 * Compute ready set for a subgraph (scoped to specific nodes)
 */
export function computeReadySetForSubgraph(
  config: GraphWorkflowConfig,
  state: ExecutionState,
  subgraphNodeIds: Set<string>,
  entryNodeId: string,
): string[] {
  const readyNodes: string[] = [];

  for (const nodeId of subgraphNodeIds) {
    // Skip if already completed
    if (state.completedNodeIds.has(nodeId)) {
      continue;
    }

    // Entry node is ready if not completed
    if (nodeId === entryNodeId) {
      readyNodes.push(nodeId);
      continue;
    }

    // Find all incoming edges
    const incomingEdges = config.edges.filter((e) => e.target === nodeId);

    if (incomingEdges.length === 0) {
      continue; // Not the entry node and no incoming edges - skip
    }

    // Group edges by source node
    const edgesBySource = new Map<string, typeof incomingEdges>();
    for (const edge of incomingEdges) {
      const edges = edgesBySource.get(edge.source) || [];
      edges.push(edge);
      edgesBySource.set(edge.source, edges);
    }

    // Check if all reachable source nodes with relevant edges are completed
    let hasAnySatisfiedEdge = false;
    let allRelevantSourcesSatisfied = true;

    for (const [sourceNodeId, edges] of edgesBySource) {
      const isSourceCompleted = state.completedNodeIds.has(sourceNodeId);
      const selectedEdgeFromSource = state.selectedEdges.get(sourceNodeId);

      // Check if any outgoing edges from this source to our target node are relevant
      const hasRelevantEdges = edges.some((edge) => {
        if (selectedEdgeFromSource === undefined) {
          // No explicit edge selection - normal edges are implicitly selected
          return edge.type === "normal";
        } else {
          // Explicit edge selection - only the selected edge is relevant
          return selectedEdgeFromSource === edge.id;
        }
      });

      if (!hasRelevantEdges) {
        // No relevant edges from this source - skip it (source chose different branch)
        continue;
      }

      if (!isSourceCompleted) {
        // Source has relevant edges but hasn't completed - check if it's reachable
        const incomingEdges = config.edges.filter(
          (e) => e.target === sourceNodeId,
        );
        const isReachable =
          incomingEdges.length === 0 || // Entry node - always reachable
          incomingEdges.some((e) => {
            if (e.type === "normal") {
              // Has normal incoming edge - check if source of that edge completed
              return state.completedNodeIds.has(e.source);
            }
            if (e.type === "conditional" || e.type === "error") {
              // Incoming conditional was selected
              return state.selectedEdges.get(e.source) === e.id;
            }
            return false;
          });

        if (isReachable) {
          // Source is reachable but not completed - need to wait for it
          allRelevantSourcesSatisfied = false;
          break;
        } else {
          // Source is unreachable - skip it (will never execute)
          continue;
        }
      }

      // Source completed and has relevant edges
      hasAnySatisfiedEdge = true;
    }

    if (allRelevantSourcesSatisfied && hasAnySatisfiedEdge) {
      readyNodes.push(nodeId);
    }
  }

  return readyNodes;
}
