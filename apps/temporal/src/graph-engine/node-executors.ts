/**
 * Node Executors
 *
 * Execution handlers for all node types and branch subgraph execution.
 */

import type { Duration, RetryPolicy } from "@temporalio/common";
import {
  ApplicationFailure,
  condition,
  defineSignal,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import { isRegisteredActivityType } from "../activity-types";
import { evaluateCondition } from "../expression-evaluator";
import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphNode,
  GraphWorkflowConfig,
  GraphWorkflowResult,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SwitchNode,
} from "../graph-workflow-types";
import { resolvePortBinding, writeToCtx } from "./context-utils";
import { handleNodeError, throwPollTimeout } from "./error-handling";
import type { ExecutionState } from "./execution-state";
import { computeReadySetForSubgraph } from "./graph-algorithms";
import { executeWithConcurrencyLimit, parseDurationToMs } from "./runner-utils";

const AZURE_OCR_CACHE_ACTIVITY_TYPES = new Set([
  "azureOcr.submit",
  "azureOcr.poll",
  "azureOcr.extract",
]);

/**
 * Inject benchmark OCR replay payload from ctx.__benchmarkOcrCache into Azure OCR
 * activities so submit/poll/extract can short-circuit without graph definition changes.
 */
function isOcrCachePayload(value: unknown): value is { ocrResponse?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "ocrResponse" in value
  );
}

function mergeBenchmarkOcrCacheParams(
  activityType: string,
  activityParams: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const raw: unknown = ctx.__benchmarkOcrCache;
  if (
    !isOcrCachePayload(raw) ||
    !AZURE_OCR_CACHE_ACTIVITY_TYPES.has(activityType)
  ) {
    return activityParams;
  }
  const cache = raw;
  const merged: Record<string, unknown> = {
    ...activityParams,
    __benchmarkOcrCache: raw,
  };
  if (activityType === "azureOcr.extract" && cache.ocrResponse !== undefined) {
    merged.ocrResponse = cache.ocrResponse;
  }
  return merged;
}

/**
 * Build the parameter object passed to a registered activity, applying the
 * standard merge order:
 *   1. resolved port-binding inputs
 *   2. static node parameters
 *   3. system fields (requestId, groupId, documentId) — spread last so they always win
 *
 * SECURITY: groupId is the tenant scope set by the workflow caller. It lives
 * on ExecutionState (not in ctx) so graph workflow authors (MEMBER role)
 * cannot forge or override it via ctx defaults, port bindings, or static
 * parameters to access another group's data. Every executor that invokes an
 * activity must build its parameter object through this helper so the rule
 * is applied consistently.
 *
 * documentId is taken from initialCtx (ctx.documentId) set by the upload/start
 * path so pollUntil and other nodes that omit an explicit port binding still
 * pass documentId into OCR blob activities.
 */
function buildActivityParams(
  node: { parameters?: Record<string, unknown> },
  state: ExecutionState,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const ctxDocumentId = state.ctx.documentId;
  return {
    ...inputs,
    ...node.parameters,
    ...(state.requestId && { requestId: state.requestId }),
    ...(state.groupId != null && { groupId: state.groupId }),
    ...(typeof ctxDocumentId === "string" &&
      ctxDocumentId.length > 0 && { documentId: ctxDocumentId }),
  };
}

/**
 * Execute a node based on its type
 */
export async function executeNode(
  node: GraphNode,
  config: GraphWorkflowConfig,
  state: ExecutionState,
): Promise<void> {
  switch (node.type) {
    case "activity":
      await executeActivityNode(node, state);
      break;

    case "switch":
      // Switch nodes don't "execute" - routing is handled by main loop
      break;

    case "map":
      await executeMapNode(node as MapNode, config, state);
      break;

    case "join":
      await executeJoinNode(node as JoinNode, state);
      break;

    case "pollUntil":
      await executePollUntilNode(node as PollUntilNode, state);
      break;

    case "humanGate":
      await executeHumanGateNode(node as HumanGateNode, state);
      break;

    case "childWorkflow":
      await executeChildWorkflowNode(node as ChildWorkflowNode, state);
      break;

    default:
      throw ApplicationFailure.create({
        type: "GRAPH_EXECUTION_ERROR",
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
      type: "ACTIVITY_NOT_FOUND",
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

  // Step 3: Merge static parameters with resolved inputs; inject system fields
  let activityParams = buildActivityParams(node, state, inputs);
  activityParams = mergeBenchmarkOcrCacheParams(
    node.activityType,
    activityParams,
    state.ctx,
  );

  // Step 4: Create activity proxy with timeout and retry configuration
  // Use defaults if not specified in node config
  const timeout = (node.timeout?.startToClose ?? "2m") as Duration;
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
export function executeSwitchNode(
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
      type: "GRAPH_EXECUTION_ERROR",
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
 * Collections with more than 20 items use child graphWorkflow per branch (ref-only history).
 * Smaller collections run in-process in the parent workflow.
 */
const MAP_CHILD_WORKFLOW_THRESHOLD = 20;

async function executeMapNode(
  node: MapNode,
  config: GraphWorkflowConfig,
  state: ExecutionState,
): Promise<void> {
  const collection = resolvePortBinding(node.collectionCtxKey, state.ctx);

  if (!Array.isArray(collection)) {
    throw ApplicationFailure.create({
      type: "GRAPH_EXECUTION_ERROR",
      message: `Collection at ${node.collectionCtxKey} is not an array`,
      nonRetryable: true,
    });
  }

  const maxConcurrency = node.maxConcurrency || Infinity;
  const useChildWorkflows =
    collection.length > MAP_CHILD_WORKFLOW_THRESHOLD &&
    state.workflowVersionId !== undefined;

  const results = await executeWithConcurrencyLimit(
    collection,
    maxConcurrency,
    async (item: unknown, index: number) => {
      const branchCtx: Record<string, unknown> = { ...state.ctx };
      branchCtx[node.itemCtxKey] = item;
      if (node.indexCtxKey) {
        branchCtx[node.indexCtxKey] = index;
      }

      if (useChildWorkflows) {
        const childResult = (await executeChild("graphWorkflow", {
          args: [
            {
              workflowVersionId: state.workflowVersionId!,
              configHash: state.configHash,
              initialCtx: branchCtx,
              runnerVersion: state.runnerVersion,
              parentWorkflowId: workflowInfo().workflowId,
              groupId: state.groupId ?? null,
              requestId: state.requestId,
              ...(state.workflowConfigOverrides &&
              Object.keys(state.workflowConfigOverrides).length > 0
                ? { workflowConfigOverrides: state.workflowConfigOverrides }
                : {}),
            },
          ],
        })) as GraphWorkflowResult;
        return childResult.refs ?? {};
      }

      return executeBranchSubgraph(
        config,
        node.bodyEntryNodeId,
        node.bodyExitNodeId,
        branchCtx,
        state,
      );
    },
  );

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
      type: "GRAPH_EXECUTION_ERROR",
      message: `No results found for map node ${node.sourceMapNodeId}`,
      nonRetryable: true,
    });
  }

  // Step 2: Apply strategy
  // Note: For "all" strategy, we already collected all results in executeMapNode
  // For "any" strategy, we would have used Promise.race (not implemented yet)
  if (node.strategy === "any") {
    throw ApplicationFailure.create({
      type: "GRAPH_EXECUTION_ERROR",
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
      type: "ACTIVITY_NOT_FOUND",
      message: `Activity type not found: ${node.activityType}`,
      nonRetryable: true,
    });
  }

  const maxAttempts = node.maxAttempts ?? 100;
  const timeoutMs = node.timeout ? parseDurationToMs(node.timeout) : undefined;
  const startTimeMs = Date.now();

  const timeout = "2m" as Duration;
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
      throwPollTimeout(node.id, attempt, "timeout");
    }

    const inputs: Record<string, unknown> = {};
    if (node.inputs) {
      for (const binding of node.inputs) {
        inputs[binding.port] = resolvePortBinding(binding.ctxKey, state.ctx);
      }
    }

    let activityParams = buildActivityParams(node, state, inputs);
    activityParams = mergeBenchmarkOcrCacheParams(
      node.activityType,
      activityParams,
      state.ctx,
    );

    const result = (await activityFn(activityParams)) as Record<
      string,
      unknown
    >;

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
      throwPollTimeout(node.id, attempt, "timeout");
    }

    await sleep(node.interval as Duration);
  }

  throwPollTimeout(node.id, maxAttempts, "maxAttempts");
}

/**
 * Execute a humanGate node
 *
 * US-011: HumanGate node handler
 *
 * Waits for a human signal (approved/rejected) or times out.
 * Sets document status to `awaiting_review` before waiting so the HITL queue
 * can show documents that need human review without querying Temporal.
 */
async function executeHumanGateNode(
  node: HumanGateNode,
  state: ExecutionState,
): Promise<void> {
  // Update document status to awaiting_review if documentId is in context
  const documentId = state.ctx.documentId;
  if (documentId && typeof documentId === "string") {
    const activityProxy = proxyActivities({
      startToCloseTimeout: "30s" as Duration,
      retry: { maximumAttempts: 3 } as RetryPolicy,
    });

    const updateStatusActivity = activityProxy[
      "document.updateStatus"
    ] as (params: { documentId: string; status: string }) => Promise<void>;

    if (updateStatusActivity) {
      await updateStatusActivity({
        documentId,
        status: "awaiting_review",
      });
    }
  }

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
    if (node.onTimeout === "continue") {
      return;
    }

    if (node.onTimeout === "fallback") {
      if (!node.fallbackEdgeId) {
        throw ApplicationFailure.create({
          type: "GRAPH_EXECUTION_ERROR",
          message: `HumanGate node ${node.id} missing fallbackEdgeId`,
          nonRetryable: true,
        });
      }
      state.selectedEdges.set(node.id, node.fallbackEdgeId);
      return;
    }

    throw ApplicationFailure.create({
      type: "HUMAN_GATE_TIMEOUT",
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

  if (payloadValue.approved === false) {
    throw ApplicationFailure.create({
      type: "HUMAN_GATE_REJECTED",
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
function resolveChildOutputPort(
  port: string,
  childResult: GraphWorkflowResult,
): unknown {
  const refs = childResult.refs;
  if (port === "ocrResponse" && refs?.ocrResponseRef) {
    return refs.ocrResponseRef;
  }
  if (port === "ocrResult" && refs?.ocrResultRef) {
    return refs.ocrResultRef;
  }
  if (port === "cleanedResult" && refs?.cleanedResultRef) {
    return refs.cleanedResultRef;
  }
  if (refs && port in refs) {
    return refs[port as keyof typeof refs];
  }
  return undefined;
}

async function executeChildWorkflowNode(
  node: ChildWorkflowNode,
  state: ExecutionState,
): Promise<void> {
  const activityProxy = proxyActivities({
    startToCloseTimeout: "30s" as Duration,
    retry: { maximumAttempts: 3 } as RetryPolicy,
  });

  if (node.workflowRef.type === "inline") {
    throw ApplicationFailure.create({
      type: "GRAPH_EXECUTION_ERROR",
      message:
        "Inline childWorkflow graphs are not supported; use library workflowRef",
      nonRetryable: true,
    });
  }

  const { workflowVersionId, configHash } = (await (
    activityProxy.getWorkflowGraphConfig as (
      params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>
  )({ workflowId: node.workflowRef.workflowId })) as {
    workflowVersionId: string;
    configHash: string;
  };

  const initialCtx: Record<string, unknown> = {};
  if (node.inputMappings) {
    for (const mapping of node.inputMappings) {
      initialCtx[mapping.port] = resolvePortBinding(mapping.ctxKey, state.ctx);
    }
  }

  const childResult = (await executeChild("graphWorkflow", {
    args: [
      {
        workflowVersionId,
        configHash,
        initialCtx,
        runnerVersion: state.runnerVersion,
        parentWorkflowId: workflowInfo().workflowId,
        groupId: state.groupId ?? null,
        requestId: state.requestId,
      },
    ],
  })) as GraphWorkflowResult;

  if (node.outputMappings) {
    for (const mapping of node.outputMappings) {
      const value = resolveChildOutputPort(mapping.port, childResult);
      if (value !== undefined) {
        writeToCtx(mapping.ctxKey, value, state.ctx);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Branch Subgraph Execution
// ---------------------------------------------------------------------------

/**
 * Execute a branch subgraph for a single map iteration
 *
 * Executes nodes from entryNodeId to exitNodeId with isolated branch context.
 */
export async function executeBranchSubgraph(
  config: GraphWorkflowConfig,
  entryNodeId: string,
  exitNodeId: string,
  branchCtx: Record<string, unknown>,
  parentState: ExecutionState,
): Promise<Record<string, unknown>> {
  // Create isolated state for this branch
  const branchState: ExecutionState = {
    currentNodes: [],
    completedNodeIds: new Set<string>(),
    nodeStatuses: new Map(),
    cancelled: parentState.cancelled,
    cancelMode: parentState.cancelMode,
    ctx: branchCtx,
    selectedEdges: new Map<string, string>(),
    mapBranchResults: new Map<string, unknown[]>(),
    workflowVersionId: parentState.workflowVersionId,
    configHash: parentState.configHash,
    runnerVersion: parentState.runnerVersion,
    groupId: parentState.groupId,
    requestId: parentState.requestId,
    lastError: parentState.lastError,
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
    if (branchState.cancelled() && branchState.cancelMode() === "immediate") {
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
        type: "GRAPH_EXECUTION_ERROR",
        message: `Branch execution stalled before completing exit node ${exitNodeId}`,
        nonRetryable: true,
      });
    }

    // Sort ready nodes alphabetically for determinism
    const sortedReadyNodeIds = readyNodeIds.sort();
    branchState.currentNodes.length = 0;
    branchState.currentNodes.push(...sortedReadyNodeIds);

    // Execute ready nodes in parallel
    await Promise.all(
      sortedReadyNodeIds.map(async (nodeId) => {
        const node = config.nodes[nodeId];
        if (!node) {
          throw ApplicationFailure.create({
            type: "GRAPH_EXECUTION_ERROR",
            message: `Node not found: ${nodeId}`,
            nonRetryable: true,
          });
        }

        // Mark node as running
        branchState.nodeStatuses.set(nodeId, {
          status: "running",
          startedAt: new Date().toISOString(),
        });

        try {
          // Handle switch nodes specially
          if (node.type === "switch") {
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
            status: "completed",
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          handleNodeError(nodeId, node, error, branchState, config);
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
