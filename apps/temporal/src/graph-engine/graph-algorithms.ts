/**
 * Graph Algorithms
 *
 * DAG structural operations: topological sort and ready-set computation.
 */

import { ApplicationFailure } from '@temporalio/workflow';
import type { GraphWorkflowConfig, GraphEdge } from '../graph-workflow-types';
import type { ExecutionState } from './execution-state';

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
    if (edge.type === 'normal') {
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
      type: 'GRAPH_EXECUTION_ERROR',
      message: 'Cycle detected in graph',
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

    // Check if all source nodes are satisfied
    let hasAnySatisfiedEdge = false;
    let allSourcesSatisfied = true;

    for (const [sourceNodeId, edges] of edgesBySource) {
      // Source node must be completed
      if (!state.completedNodeIds.has(sourceNodeId)) {
        allSourcesSatisfied = false;
        break;
      }

      // Check if any edge from this source is satisfied
      const anyEdgeSatisfied = isAnyEdgeSatisfied(edges, state.selectedEdges.get(sourceNodeId));

      if (anyEdgeSatisfied) {
        hasAnySatisfiedEdge = true;
      } else {
        // This source is completed but none of its edges to this node were satisfied
        allSourcesSatisfied = false;
        break;
      }
    }

    if (allSourcesSatisfied && hasAnySatisfiedEdge) {
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

    // Check if all source nodes are satisfied
    let hasAnySatisfiedEdge = false;
    let allSourcesSatisfied = true;

    for (const [sourceNodeId, edges] of edgesBySource) {
      // Source node must be completed
      if (!state.completedNodeIds.has(sourceNodeId)) {
        allSourcesSatisfied = false;
        break;
      }

      // Check if any edge from this source is satisfied
      const anyEdgeSatisfied = isAnyEdgeSatisfied(edges, state.selectedEdges.get(sourceNodeId));

      if (anyEdgeSatisfied) {
        hasAnySatisfiedEdge = true;
      } else {
        allSourcesSatisfied = false;
        break;
      }
    }

    if (allSourcesSatisfied && hasAnySatisfiedEdge) {
      readyNodes.push(nodeId);
    }
  }

  return readyNodes;
}

/**
 * Helper: Check if any edge from a set is satisfied
 *
 * Shared logic between computeReadySet and computeReadySetForSubgraph
 */
function isAnyEdgeSatisfied(edges: GraphEdge[], selectedEdgeId?: string): boolean {
  return edges.some((edge) => {
    if (selectedEdgeId) {
      return selectedEdgeId === edge.id;
    }
    if (edge.type === 'normal') {
      return true; // Normal edges are always satisfied if source completed
    }
    if (edge.type === 'conditional') {
      // Conditional edge satisfied if it was selected by the switch
      return selectedEdgeId === edge.id;
    }
    if (edge.type === 'error') {
      return selectedEdgeId === edge.id;
    }
    return false;
  });
}
