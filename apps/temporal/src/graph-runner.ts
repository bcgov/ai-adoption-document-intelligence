/**
 * Graph Runner - Core DAG Execution Engine
 *
 * Implements topological sort, ready set computation, and the main execution loop
 * for the generic graph workflow interpreter.
 *
 * See docs/DAG_WORKFLOW_ENGINE.md Section 5.2
 */

import {
  proxyActivities,
  ApplicationFailure,
  sleep,
  condition,
  defineSignal,
  setHandler,
  executeChild,
  workflowInfo,
} from '@temporalio/workflow';
import type { Duration, RetryPolicy } from '@temporalio/common';
import type {
  GraphWorkflowInput,
  GraphWorkflowResult,
  GraphWorkflowConfig,
  GraphNode,
  ActivityNode,
  SwitchNode,
  MapNode,
  JoinNode,
  PollUntilNode,
  HumanGateNode,
  ChildWorkflowNode,
  NodeStatus,
} from './graph-workflow-types';
import { isRegisteredActivityType } from './activity-types';
import { evaluateCondition } from './expression-evaluator';

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
  selectedEdges: Map<string, string>; // nodeId -> selected edgeId for switch nodes
  mapBranchResults: Map<string, unknown[]>; // mapNodeId -> array of branch results
  configHash: string;
  runnerVersion: string;
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

  state.configHash = input.configHash;
  state.runnerVersion = input.runnerVersion;

  // Step 1: Initialize context from defaults + initialCtx
  state.ctx = initializeContext(config, input.initialCtx);

  // Step 2: Validate DAG structure (cycle detection via topological sort)
  computeTopologicalOrder(config);

  // Step 3: Main execution loop
  // Note: Not all nodes may complete (e.g., unselected switch branches)
  // Loop until no more nodes are ready
  while (true) {
    // Check for immediate cancellation
    if (state.cancelled() && state.cancelMode() === 'immediate') {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: 'cancelled',
      };
    }

    // Compute ready set
    const readyNodeIds = computeReadySet(config, state);

    if (readyNodeIds.length === 0) {
      // No more nodes ready - execution complete
      break;
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
          // Handle switch nodes specially - they determine routing
          if (node.type === 'switch') {
            const selectedEdgeId = executeSwitchNode(node as SwitchNode, state.ctx);
            state.selectedEdges.set(nodeId, selectedEdgeId);
          } else {
            await executeNode(node, config, state);
          }

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
 * Compute ready set: nodes whose all incoming edges have completed sources
 *
 * A node is ready if:
 * - It has at least one satisfied incoming edge, AND
 * - All source nodes with edges to this node are either:
 *   - Completed with at least one edge satisfied, OR
 *   - Not yet reached
 */
function computeReadySet(
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
      const selectedEdgeId = state.selectedEdges.get(sourceNodeId);
      const anyEdgeSatisfied = edges.some((edge) => {
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
      await executeMapNode(node as MapNode, _config, state);
      break;

    case 'join':
      await executeJoinNode(node as JoinNode, state);
      break;

    case 'pollUntil':
      await executePollUntilNode(node as PollUntilNode, state);
      break;

    case 'humanGate':
      await executeHumanGateNode(node as HumanGateNode, state);
      break;

    case 'childWorkflow':
      await executeChildWorkflowNode(node as ChildWorkflowNode, state);
      break;

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

/**
 * Execute a switch node
 *
 * US-008: Switch node handler
 *
 * Switch nodes determine routing by evaluating condition expressions.
 * They don't modify context - they just select which edge to follow.
 */
function executeSwitchNode(
  node: SwitchNode,
  ctx: Record<string, unknown>,
): string {
  // Evaluate cases in array order
  for (const switchCase of node.cases) {
    if (evaluateCondition(switchCase.condition, ctx)) {
      return switchCase.edgeId;
    }
  }

  // No case matched - return default edge
  // Validator ensures defaultEdge exists
  if (!node.defaultEdge) {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: `Switch node ${node.id} missing defaultEdge`,
      nonRetryable: true,
    });
  }
  return node.defaultEdge;
}

/**
 * Execute a map node (fan-out)
 *
 * US-009: Map node handler
 *
 * Map nodes iterate over a collection and execute a subgraph for each item.
 * Each branch gets an isolated context copy with the item and optional index.
 *
 * For simplicity, this executes branches in-process rather than using child workflows.
 * Future optimization: Use child workflows for large collections (> 50 items).
 */
async function executeMapNode(
  node: MapNode,
  config: GraphWorkflowConfig,
  state: ExecutionState,
): Promise<void> {
  // Step 1: Get collection from context
  const collection = resolvePortBinding(node.collectionCtxKey, state.ctx);

  if (!Array.isArray(collection)) {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: `Collection at ${node.collectionCtxKey} is not an array`,
      nonRetryable: true,
    });
  }

  // Step 2: Execute branches with concurrency limiting
  const maxConcurrency = node.maxConcurrency || Infinity;
  const results = await executeWithConcurrencyLimit(
    collection,
    maxConcurrency,
    async (item: unknown, index: number) => {
      // Create branch context (shallow copy with item and index)
      const branchCtx: Record<string, unknown> = { ...state.ctx };
      branchCtx[node.itemCtxKey] = item;
      if (node.indexCtxKey) {
        branchCtx[node.indexCtxKey] = index;
      }

      // Execute the subgraph for this branch
      const branchResult = await executeBranchSubgraph(
        config,
        node.bodyEntryNodeId,
        node.bodyExitNodeId,
        branchCtx,
        state,
      );

      return branchResult;
    },
  );

  // Step 3: Store branch results for join node
  state.mapBranchResults.set(node.id, results);
}

/**
 * Execute a join node (fan-in)
 *
 * US-009: Join node handler
 *
 * Join nodes collect results from map node branches.
 */
async function executeJoinNode(
  node: JoinNode,
  state: ExecutionState,
): Promise<void> {
  // Step 1: Get results from the source map node
  const results = state.mapBranchResults.get(node.sourceMapNodeId);

  if (!results) {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: `No results found for map node ${node.sourceMapNodeId}`,
      nonRetryable: true,
    });
  }

  // Step 2: Apply strategy
  // Note: For "all" strategy, we already collected all results in executeMapNode
  // For "any" strategy, we would have used Promise.race (not implemented yet)
  if (node.strategy === 'any') {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: 'Join strategy "any" not yet implemented',
      nonRetryable: true,
    });
  }

  // Step 3: Write results to context
  writeToCtx(node.resultsCtxKey, results, state.ctx);
}

/**
 * Execute a pollUntil node
 *
 * US-010: PollUntil node handler
 *
 * Polls an activity until a condition evaluates to true, or until
 * maxAttempts / timeout is exceeded.
 */
async function executePollUntilNode(
  node: PollUntilNode,
  state: ExecutionState,
): Promise<void> {
  if (!isRegisteredActivityType(node.activityType)) {
    throw ApplicationFailure.create({
      type: 'ACTIVITY_NOT_FOUND',
      message: `Activity type not found: ${node.activityType}`,
      nonRetryable: true,
    });
  }

  const maxAttempts = node.maxAttempts ?? 100;
  const timeoutMs = node.timeout ? parseDurationToMs(node.timeout) : undefined;
  const startTimeMs = Date.now();

  const timeout = '2m' as Duration;
  const retry = { maximumAttempts: 3 } as RetryPolicy;

  const activityProxy = proxyActivities({
    startToCloseTimeout: timeout,
    retry,
  });

  const activityFn = activityProxy[node.activityType] as (
    ...args: unknown[]
  ) => Promise<unknown>;

  if (node.initialDelay) {
    await sleep(node.initialDelay as Duration);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (timeoutMs !== undefined && Date.now() - startTimeMs >= timeoutMs) {
      throwPollTimeout(node.id, attempt, 'timeout');
    }

    const inputs: Record<string, unknown> = {};
    if (node.inputs) {
      for (const binding of node.inputs) {
        inputs[binding.port] = resolvePortBinding(binding.ctxKey, state.ctx);
      }
    }

    const activityParams = {
      ...inputs,
      ...node.parameters,
    };

    const result = (await activityFn(activityParams)) as Record<string, unknown>;

    if (node.outputs) {
      for (const binding of node.outputs) {
        const value = result[binding.port];
        writeToCtx(binding.ctxKey, value, state.ctx);
      }
    }

    if (evaluateCondition(node.condition, state.ctx)) {
      return;
    }

    if (attempt >= maxAttempts) {
      break;
    }

    if (timeoutMs !== undefined && Date.now() - startTimeMs >= timeoutMs) {
      throwPollTimeout(node.id, attempt, 'timeout');
    }

    await sleep(node.interval as Duration);
  }

  throwPollTimeout(node.id, maxAttempts, 'maxAttempts');
}

/**
 * Execute a humanGate node
 *
 * US-011: HumanGate node handler
 *
 * Waits for a human signal (approved/rejected) or times out.
 */
async function executeHumanGateNode(
  node: HumanGateNode,
  state: ExecutionState,
): Promise<void> {
  let payload: Record<string, unknown> | null = null;

  const signalDefinition = defineSignal<[Record<string, unknown>]>(
    node.signal.name,
  );

  setHandler(signalDefinition, (signalPayload: Record<string, unknown>) => {
    payload = signalPayload;
  });

  const received = await condition(
    () => payload !== null,
    node.timeout as Duration,
  );

  if (!received) {
    if (node.onTimeout === 'continue') {
      return;
    }

    if (node.onTimeout === 'fallback') {
      if (!node.fallbackEdgeId) {
        throw ApplicationFailure.create({
          type: 'GRAPH_EXECUTION_ERROR',
          message: `HumanGate node ${node.id} missing fallbackEdgeId`,
          nonRetryable: true,
        });
      }
      state.selectedEdges.set(node.id, node.fallbackEdgeId);
      return;
    }

    throw ApplicationFailure.create({
      type: 'HUMAN_GATE_TIMEOUT',
      message: `HumanGate node ${node.id} timed out waiting for signal ${node.signal.name}`,
      nonRetryable: true,
    });
  }

  const payloadValue: Record<string, unknown> = payload ?? {};
  if (node.outputs && node.outputs.length > 0) {
    for (const binding of node.outputs) {
      const value = payloadValue[binding.port];
      writeToCtx(binding.ctxKey, value, state.ctx);
    }
  } else {
    writeToCtx(`${node.id}Payload`, payloadValue, state.ctx);
  }

  if (payloadValue['approved'] === false) {
    throw ApplicationFailure.create({
      type: 'HUMAN_GATE_REJECTED',
      message: `HumanGate node ${node.id} rejected by signal ${node.signal.name}`,
      nonRetryable: true,
    });
  }
}

/**
 * Execute a childWorkflow node
 *
 * US-012: ChildWorkflow node handler
 *
 * Starts a child graphWorkflow using an inline graph or a library reference.
 */
async function executeChildWorkflowNode(
  node: ChildWorkflowNode,
  state: ExecutionState,
): Promise<void> {
  const activityProxy = proxyActivities({
    startToCloseTimeout: '30s' as Duration,
    retry: { maximumAttempts: 3 } as RetryPolicy,
  });

  let childGraph: GraphWorkflowConfig;

  if (node.workflowRef.type === 'inline') {
    childGraph = node.workflowRef.graph;
  } else {
    const result = (await (
      activityProxy.getWorkflowGraphConfig as (
        params: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>
    )({ workflowId: node.workflowRef.workflowId })) as {
      graph: GraphWorkflowConfig;
    };
    childGraph = result.graph;
  }

  const initialCtx: Record<string, unknown> = {};
  if (node.inputMappings) {
    for (const mapping of node.inputMappings) {
      initialCtx[mapping.port] = resolvePortBinding(
        mapping.ctxKey,
        state.ctx,
      );
    }
  }

  const childResult = await executeChild('graphWorkflow', {
    args: [
      {
        graph: childGraph,
        initialCtx,
        configHash: state.configHash,
        runnerVersion: state.runnerVersion,
        parentWorkflowId: workflowInfo().workflowId,
      },
    ],
  });

  if (node.outputMappings) {
    for (const mapping of node.outputMappings) {
      const value = resolvePortBinding(mapping.port, childResult.ctx);
      writeToCtx(mapping.ctxKey, value, state.ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Execute a branch subgraph for a single map iteration
 *
 * Executes nodes from entryNodeId to exitNodeId with isolated branch context.
 */
async function executeBranchSubgraph(
  config: GraphWorkflowConfig,
  entryNodeId: string,
  exitNodeId: string,
  branchCtx: Record<string, unknown>,
  parentState: ExecutionState,
): Promise<Record<string, unknown>> {
  // Create isolated state for this branch
  const branchState: ExecutionState = {
    currentNodeIds: [],
    completedNodeIds: new Set<string>(),
    nodeStatuses: new Map<string, NodeStatus>(),
    cancelled: parentState.cancelled,
    cancelMode: parentState.cancelMode,
    ctx: branchCtx,
    selectedEdges: new Map<string, string>(),
    mapBranchResults: new Map<string, unknown[]>(),
    configHash: parentState.configHash,
    runnerVersion: parentState.runnerVersion,
  };

  // Find all nodes in the subgraph using BFS
  const subgraphNodeIds = new Set<string>();
  const queue: string[] = [entryNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    subgraphNodeIds.add(currentId);

    // Stop traversing beyond exit node
    if (currentId === exitNodeId) {
      continue;
    }

    // Find outgoing edges from current node
    const outgoingEdges = config.edges.filter((e) => e.source === currentId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // Execute subgraph nodes until exitNodeId is completed
  while (true) {
    // Check for cancellation
    if (branchState.cancelled() && branchState.cancelMode() === 'immediate') {
      break;
    }

    // Compute ready set (only within subgraph nodes)
    const readyNodeIds = computeReadySetForSubgraph(
      config,
      branchState,
      subgraphNodeIds,
      entryNodeId,
    );

    if (readyNodeIds.length === 0) {
      // No more nodes ready - check if we completed the exit node
      if (branchState.completedNodeIds.has(exitNodeId)) {
        break;
      }
      // Exit node not completed but no nodes ready - this is an error
      throw ApplicationFailure.create({
        type: 'GRAPH_EXECUTION_ERROR',
        message: `Branch execution stalled before completing exit node ${exitNodeId}`,
        nonRetryable: true,
      });
    }

    // Sort ready nodes alphabetically for determinism
    const sortedReadyNodeIds = readyNodeIds.sort();
    branchState.currentNodeIds = sortedReadyNodeIds;

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
        branchState.nodeStatuses.set(nodeId, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });

        try {
          // Handle switch nodes specially
          if (node.type === 'switch') {
            const selectedEdgeId = executeSwitchNode(
              node as SwitchNode,
              branchState.ctx,
            );
            branchState.selectedEdges.set(nodeId, selectedEdgeId);
          } else {
            await executeNode(node, config, branchState);
          }

          // Mark node as completed
          branchState.completedNodeIds.add(nodeId);
          branchState.nodeStatuses.set(nodeId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          // Mark node as failed
          branchState.nodeStatuses.set(nodeId, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }),
    );

    // Check if we completed the exit node
    if (branchState.completedNodeIds.has(exitNodeId)) {
      break;
    }
  }

  return branchState.ctx;
}

/**
 * Compute ready set for a subgraph (scoped to specific nodes)
 */
function computeReadySetForSubgraph(
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
      const selectedEdgeId = state.selectedEdges.get(sourceNodeId);
      const anyEdgeSatisfied = edges.some((edge) => {
        if (selectedEdgeId) {
          return selectedEdgeId === edge.id;
        }
        if (edge.type === 'normal') {
          return true;
        }
        if (edge.type === 'conditional') {
          return selectedEdgeId === edge.id;
        }
        if (edge.type === 'error') {
          return selectedEdgeId === edge.id;
        }
        return false;
      });

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
 * Execute items with concurrency limiting
 *
 * Uses a semaphore pattern to limit parallel execution.
 */
async function executeWithConcurrencyLimit<T>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T, index: number) => Promise<unknown>,
): Promise<unknown[]> {
  const results: unknown[] = new Array(items.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i;

    // Create promise for this item
    const p = fn(item, index)
      .then((result) => {
        results[index] = result;
      })
      .finally(() => {
        // Remove from executing set when done
        const idx = executing.indexOf(p);
        if (idx !== -1) {
          executing.splice(idx, 1);
        }
      });

    executing.push(p);

    // Wait if we've hit the concurrency limit
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all remaining promises
  await Promise.all(executing);

  return results;
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

function parseDurationToMs(duration: string): number {
  const trimmed = duration.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: `Invalid duration string: ${duration}`,
      nonRetryable: true,
    });
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.round(value * (multiplier[unit] ?? 1));
}

function throwPollTimeout(
  nodeId: string,
  attempt: number,
  reason: 'maxAttempts' | 'timeout',
): never {
  throw ApplicationFailure.create({
    type: 'POLL_TIMEOUT',
    message: `POLL_TIMEOUT: PollUntil node ${nodeId} exceeded ${reason} after ${attempt} attempts`,
    nonRetryable: true,
  });
}
