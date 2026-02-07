/**
 * Graph Runner - Core DAG Execution Engine
 *
 * Implements topological sort, ready set computation, and the main execution loop
 * for the generic graph workflow interpreter.
 *
 * See docs/DAG_WORKFLOW_ENGINE.md Section 5.2
 */

import { proxyActivities, ApplicationFailure } from '@temporalio/workflow';
import type { Duration, RetryPolicy } from '@temporalio/common';
import type {
  GraphWorkflowInput,
  GraphWorkflowResult,
  GraphWorkflowConfig,
  GraphNode,
  ActivityNode,
  NodeStatus,
} from './graph-workflow-types';
import { isRegisteredActivityType } from './activity-types';

/**
 * Execution state shared between workflow function and runner
 */
export interface ExecutionState {
  currentNodeIds: string[];
  completedNodeIds: Set<string>;
  nodeStatuses: Map<string, NodeStatus>;
  cancelled: () => boolean;
  cancelMode: () => 'graceful' | 'immediate';
  ctx: Record<string, unknown>;
}

/**
 * Main graph execution function
 *
 * Runs the DAG workflow using topological sort and ready set computation.
 */
export async function runGraphExecution(
  input: GraphWorkflowInput,
  state: ExecutionState,
): Promise<GraphWorkflowResult> {
  const config = input.graph;

  // Step 1: Initialize context from defaults + initialCtx
  state.ctx = initializeContext(config, input.initialCtx);

  // Step 2: Compute topological order
  const topologicalOrder = computeTopologicalOrder(config);

  // Step 3: Main execution loop
  while (state.completedNodeIds.size < topologicalOrder.length) {
    // Check for immediate cancellation
    if (state.cancelled() && state.cancelMode() === 'immediate') {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: 'cancelled',
      };
    }

    // Compute ready set
    const readyNodeIds = computeReadySet(config, state.completedNodeIds);

    if (readyNodeIds.length === 0) {
      // No nodes ready but not all complete = deadlock or waiting
      if (state.completedNodeIds.size < topologicalOrder.length) {
        throw ApplicationFailure.create({
          type: 'GRAPH_EXECUTION_ERROR',
          message: 'Deadlock detected: no nodes ready to execute',
          nonRetryable: true,
        });
      }
      break; // All nodes complete
    }

    // Sort ready nodes alphabetically for determinism
    const sortedReadyNodeIds = readyNodeIds.sort();
    state.currentNodeIds = sortedReadyNodeIds;

    // Execute ready nodes in parallel
    await Promise.all(
      sortedReadyNodeIds.map(async (nodeId) => {
        const node = config.nodes[nodeId];
        if (!node) {
          throw ApplicationFailure.create({
            type: 'GRAPH_EXECUTION_ERROR',
            message: `Node not found: ${nodeId}`,
            nonRetryable: true,
          });
        }

        // Mark node as running
        state.nodeStatuses.set(nodeId, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });

        try {
          await executeNode(node, config, state);

          // Mark node as completed
          state.completedNodeIds.add(nodeId);
          state.nodeStatuses.set(nodeId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          // Mark node as failed
          state.nodeStatuses.set(nodeId, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error; // Propagate error to workflow
        }
      }),
    );

    // Check for graceful cancellation
    if (state.cancelled() && state.cancelMode() === 'graceful') {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: 'cancelled',
      };
    }
  }

  // All nodes completed successfully
  return {
    ctx: state.ctx,
    completedNodes: Array.from(state.completedNodeIds),
    status: 'completed',
  };
}

/**
 * Initialize runtime context by merging initialCtx over config ctx defaults
 */
function initializeContext(
  config: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  // Apply defaults from config
  for (const [key, declaration] of Object.entries(config.ctx)) {
    if (declaration.defaultValue !== undefined) {
      ctx[key] = declaration.defaultValue;
    }
  }

  // Overlay initial values
  for (const [key, value] of Object.entries(initialCtx)) {
    ctx[key] = value;
  }

  return ctx;
}

/**
 * Compute stable topological order using Kahn's algorithm with alphabetical tiebreaker
 */
function computeTopologicalOrder(config: GraphWorkflowConfig): string[] {
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
 * Compute ready set: nodes whose all incoming normal edges have completed sources
 */
function computeReadySet(
  config: GraphWorkflowConfig,
  completedNodes: Set<string>,
): string[] {
  const readyNodes: string[] = [];

  for (const nodeId of Object.keys(config.nodes)) {
    // Skip if already completed
    if (completedNodes.has(nodeId)) {
      continue;
    }

    // Find all incoming normal edges
    const incomingNormalEdges = config.edges.filter(
      (e) => e.target === nodeId && e.type === 'normal',
    );

    // Node is ready if all incoming normal edge sources are completed
    const allSourcesCompleted = incomingNormalEdges.every((edge) =>
      completedNodes.has(edge.source),
    );

    // Special case: entry node has no incoming edges
    const isEntryNode = nodeId === config.entryNodeId;

    if (allSourcesCompleted || isEntryNode) {
      readyNodes.push(nodeId);
    }
  }

  return readyNodes;
}

/**
 * Execute a node based on its type
 */
async function executeNode(
  node: GraphNode,
  _config: GraphWorkflowConfig,
  state: ExecutionState,
): Promise<void> {
  switch (node.type) {
    case 'activity':
      await executeActivityNode(node, state);
      break;

    case 'switch':
      // Switch nodes don't "execute" - routing is handled by main loop
      break;

    case 'map':
      // TODO: Implement in US-009
      throw new Error('Map nodes not yet implemented');

    case 'join':
      // TODO: Implement in US-009
      throw new Error('Join nodes not yet implemented');

    case 'pollUntil':
      // TODO: Implement in US-010
      throw new Error('PollUntil nodes not yet implemented');

    case 'humanGate':
      // TODO: Implement in US-011
      throw new Error('HumanGate nodes not yet implemented');

    case 'childWorkflow':
      // TODO: Implement in US-012
      throw new Error('ChildWorkflow nodes not yet implemented');

    default:
      throw ApplicationFailure.create({
        type: 'GRAPH_EXECUTION_ERROR',
        message: `Unknown node type: ${(node as GraphNode).type}`,
        nonRetryable: true,
      });
  }
}

// ---------------------------------------------------------------------------
// Node Type Handlers
// ---------------------------------------------------------------------------

/**
 * Execute an activity node
 *
 * US-007: Activity node handler
 */
async function executeActivityNode(
  node: ActivityNode,
  state: ExecutionState,
): Promise<void> {
  // Step 1: Check activity type is registered
  if (!isRegisteredActivityType(node.activityType)) {
    throw ApplicationFailure.create({
      type: 'ACTIVITY_NOT_FOUND',
      message: `Activity type not found: ${node.activityType}`,
      nonRetryable: true,
    });
  }

  // Step 2: Resolve input port bindings
  const inputs: Record<string, unknown> = {};
  if (node.inputs) {
    for (const binding of node.inputs) {
      inputs[binding.port] = resolvePortBinding(binding.ctxKey, state.ctx);
    }
  }

  // Step 3: Merge static parameters with resolved inputs
  const activityParams = {
    ...inputs,
    ...node.parameters,
  };

  // Step 4: Create activity proxy with timeout and retry configuration
  // Use defaults if not specified in node config
  const timeout = (node.timeout?.startToClose ?? '2m') as Duration;
  const retry = (node.retry ?? { maximumAttempts: 3 }) as RetryPolicy;

  const activityProxy = proxyActivities({
    startToCloseTimeout: timeout,
    retry,
  });

  // Step 5: Invoke activity
  // Convert params object to positional args based on activity signature
  const activityFn = activityProxy[node.activityType] as (
    ...args: unknown[]
  ) => Promise<unknown>;

  // Most activities take object parameters, so pass activityParams as single arg
  const result = (await activityFn(activityParams)) as Record<string, unknown>;

  // Step 6: Write output port bindings to ctx
  if (node.outputs) {
    for (const binding of node.outputs) {
      const value = result[binding.port];
      writeToCtx(binding.ctxKey, value, state.ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Resolve a port binding from context using dot notation
 *
 * Supports:
 * - Simple keys: "documentId"
 * - Dot notation: "currentSegment.blobKey"
 * - Namespaces: "doc.field" -> "ctx.documentMetadata.field"
 */
function resolvePortBinding(
  ctxKey: string,
  ctx: Record<string, unknown>,
): unknown {
  // Handle namespaces
  let resolvedKey = ctxKey;
  if (ctxKey.startsWith('doc.')) {
    resolvedKey = `documentMetadata.${ctxKey.slice(4)}`;
  } else if (ctxKey.startsWith('segment.')) {
    resolvedKey = `currentSegment.${ctxKey.slice(8)}`;
  }

  // Traverse path using dot notation
  const keys = resolvedKey.split('.');
  let value: unknown = ctx;

  for (const key of keys) {
    if (value == null || typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }

  return value;
}

/**
 * Write a value to context using dot notation
 */
function writeToCtx(
  ctxKey: string,
  value: unknown,
  ctx: Record<string, unknown>,
): void {
  // Handle namespaces
  let resolvedKey = ctxKey;
  if (ctxKey.startsWith('doc.')) {
    resolvedKey = `documentMetadata.${ctxKey.slice(4)}`;
  } else if (ctxKey.startsWith('segment.')) {
    resolvedKey = `currentSegment.${ctxKey.slice(8)}`;
  }

  const keys = resolvedKey.split('.');
  let current = ctx;

  // Navigate to parent of target key
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  // Set the final key
  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}
