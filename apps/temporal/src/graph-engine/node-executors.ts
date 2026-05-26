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
import { executeCachedActivity } from "../cache/cached-activity";
import {
  DYN_RUN_ACTIVITY_OPTIONS,
  type DynRunActivityInput,
  type DynRunActivityResult,
} from "../dynamic-nodes/dyn-run.types";
import {
  RESOLVE_LINEAGE_ACTIVITY_OPTIONS,
  type ResolveLineageActivityInput,
  type ResolveLineageActivityResult,
} from "../dynamic-nodes/resolve-lineage.types";
import { evaluateCondition } from "../expression-evaluator";
import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphNode,
  GraphWorkflowConfig,
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

/**
 * Phase 6 Milestone C (US-171) — workflow-side proxy for the two new
 * dynamic-node activities. Lives at module level (Temporal pattern: one
 * proxy per (options, signature) tuple).
 *
 * `dynamicNode.resolveLineage` MUST be marked `nonCacheable: true` because
 * the lineage head pointer can change between executions — caching the
 * resolution would defeat hot-reload.
 *
 * `dyn.run` does NOT carry the `nonCacheable` marker — it goes through
 * Phase 4's cache decorator (which derives caching decisions from the
 * activity's own arguments — `versionId` is part of the input, so the
 * cache row's `configHash` naturally varies by version).
 */
type DynamicNodeActivities = {
  "dynamicNode.resolveLineage": (
    input: ResolveLineageActivityInput,
  ) => Promise<ResolveLineageActivityResult>;
};
type DynRunActivities = {
  "dyn.run": (input: DynRunActivityInput) => Promise<DynRunActivityResult>;
};

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
 *   3. system fields (requestId, groupId) — spread last so they always win
 *
 * SECURITY: groupId is the tenant scope set by the workflow caller. It lives
 * on ExecutionState (not in ctx) so graph workflow authors (MEMBER role)
 * cannot forge or override it via ctx defaults, port bindings, or static
 * parameters to access another group's data. Every executor that invokes an
 * activity must build its parameter object through this helper so the rule
 * is applied consistently.
 */
function buildActivityParams(
  node: { parameters?: Record<string, unknown> },
  state: ExecutionState,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...inputs,
    ...node.parameters,
    ...(state.requestId && { requestId: state.requestId }),
    ...(state.groupId != null && { groupId: state.groupId }),
  };
}

/**
 * Outcome of executing a single non-switch node. Drives the per-node
 * status map (US-135) — when an `activity` node short-circuits through
 * the Phase 4 cache decorator (US-133) it is marked `"skipped"` with
 * the cache row's hashes; otherwise the node is marked `"succeeded"`.
 */
export type NodeExecutionResult =
  | { kind: "completed" }
  | { kind: "skipped"; cacheHit: { configHash: string; inputHash: string } };

/**
 * Execute a node based on its type. Returns a `NodeExecutionResult` so
 * the caller (graph-runner) can distinguish cache-hit skips from real
 * completions when populating the live status map.
 */
export async function executeNode(
  node: GraphNode,
  config: GraphWorkflowConfig,
  state: ExecutionState,
): Promise<NodeExecutionResult> {
  switch (node.type) {
    case "activity":
      return executeActivityNode(node, state);

    case "switch":
      // Switch nodes don't "execute" - routing is handled by main loop
      return { kind: "completed" };

    case "map":
      await executeMapNode(node as MapNode, config, state);
      return { kind: "completed" };

    case "join":
      await executeJoinNode(node as JoinNode, state);
      return { kind: "completed" };

    case "pollUntil":
      await executePollUntilNode(node as PollUntilNode, state);
      return { kind: "completed" };

    case "humanGate":
      await executeHumanGateNode(node as HumanGateNode, state);
      return { kind: "completed" };

    case "childWorkflow":
      await executeChildWorkflowNode(node as ChildWorkflowNode, state);
      return { kind: "completed" };

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
 * Compute the set of top-level ctx keys this node's `outputs[]` will write
 * to. Used to construct the ctx delta that the Phase 4 cache decorator
 * stores in `outputCtx` (US-133 — Scenario 1 / Scenario 3).
 *
 * `writeToCtx` resolves namespaced + dotted ctxKey paths; the cache layer
 * stores top-level subtrees so a cache-hit `Object.assign(ctx, delta)`
 * replays the same surface area regardless of nesting depth.
 */
function collectOutputTopLevelKeys(node: ActivityNode): string[] {
  if (!node.outputs || node.outputs.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  for (const binding of node.outputs) {
    // First segment of the (potentially-namespaced) ctxKey path. We don't
    // expand namespace prefixes here — writeToCtx handles that internally,
    // and the cache only needs a stable identifier for "what changed at
    // the top level".
    const head = binding.ctxKey.split(".")[0];
    if (head.length > 0) {
      seen.add(head);
    }
  }
  return Array.from(seen);
}

/**
 * Snapshot the top-level ctx subtrees this node wrote, so the worker
 * cache decorator can persist them as `outputCtx`. A cache-hit replay
 * does `Object.assign(ctx, outputCtx)` which restores the same subtrees.
 */
function snapshotCtxDelta(
  ctx: Record<string, unknown>,
  topLevelKeys: string[],
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const key of topLevelKeys) {
    delta[key] = ctx[key];
  }
  return delta;
}

/**
 * Execute an activity node
 *
 * US-007: Activity node handler
 * US-133 (Phase 4 try-in-place): when `state.workflowLineageId` and
 * `state.cacheDeps` are wired, the activity dispatch is routed through
 * the worker cache decorator (`executeCachedActivity`) so cache reads
 * short-circuit and cache writes happen automatically. Control-flow
 * nodes (switch / map / join / pollUntil / humanGate / childWorkflow)
 * stay on the legacy path — only `activity` and `source` nodes route
 * through the decorator.
 */
async function executeActivityNode(
  node: ActivityNode,
  state: ExecutionState,
): Promise<NodeExecutionResult> {
  // Step 1: Check activity type is registered
  if (!isRegisteredActivityType(node.activityType)) {
    throw ApplicationFailure.create({
      type: "ACTIVITY_NOT_FOUND",
      message: `Activity type not found: ${node.activityType}`,
      nonRetryable: true,
    });
  }

  // Step 2: Create activity proxy with timeout and retry configuration
  // Use defaults if not specified in node config
  const timeout = (node.timeout?.startToClose ?? "2m") as Duration;
  const retry = (node.retry ?? { maximumAttempts: 3 }) as RetryPolicy;

  const activityProxy = proxyActivities({
    startToCloseTimeout: timeout,
    retry,
  });

  // Step 3: Invoke activity. Param-resolution + port-write happen inside
  // the rawExecute closure so the cache decorator can short-circuit
  // without doing any of that work on a hit.
  const outputTopLevelKeys = collectOutputTopLevelKeys(node);

  // Phase 6 Milestone C (US-171) — `dyn.<slug>` nodes take a different
  // path: resolve the lineage → versionId via a nonCacheable Temporal
  // activity, then invoke the single shared `dyn.run` activity with the
  // resolved versionId + ambient context (groupId, workflowRunId, apiKey)
  // baked in. The dispatched activity's input includes the versionId, so
  // Phase 4's cache decorator naturally invalidates head-pinned consumer
  // caches when a republish mints a new versionId.
  const isDynamicNode = node.activityType.startsWith("dyn.");

  // Phase 6 (sweep follow-on #2): for dyn.* nodes, pre-resolve the lineage
  // to an immutable versionId BEFORE entering the cache decorator. We then
  // pass a synthetic node carrying `__dynamicNodeResolvedVersionId` in
  // `parameters` so Phase 4's configHash mixes in the resolved version
  // naturally — republishing a head-pinned lineage mints a new versionId,
  // configHash changes, cache misses, fresh execution. Pinned consumers
  // resolve the same versionId every time → cache hits work as expected.
  //
  // For @deterministic-true scripts this is the load-bearing piece that
  // makes Phase 4 caching meaningful for dynamic nodes.
  let nodeForCache = node;
  let resolvedVersionId: string | undefined;
  if (isDynamicNode) {
    const slug = node.activityType.slice("dyn.".length);
    if (slug.length > 0 && state.groupId != null) {
      const resolveProxy = proxyActivities<DynamicNodeActivities>(
        RESOLVE_LINEAGE_ACTIVITY_OPTIONS,
      );
      const resolved = await resolveProxy["dynamicNode.resolveLineage"]({
        groupId: state.groupId,
        slug,
        version: node.dynamicNodeVersion,
      });
      resolvedVersionId = resolved.versionId;
      nodeForCache = {
        ...node,
        parameters: {
          ...(node.parameters ?? {}),
          __dynamicNodeResolvedVersionId: resolved.versionId,
        },
      };
    }
  }

  const rawExecute = async (): Promise<Record<string, unknown>> => {
    // Resolve input port bindings (deferred until miss so cache hits skip it).
    const inputs: Record<string, unknown> = {};
    if (node.inputs) {
      for (const binding of node.inputs) {
        inputs[binding.port] = resolvePortBinding(binding.ctxKey, state.ctx);
      }
    }

    let result: Record<string, unknown>;

    if (isDynamicNode) {
      result = await dispatchDynamicNode(
        node,
        state,
        inputs,
        resolvedVersionId,
      );
    } else {
      // Merge static parameters with resolved inputs; inject system fields.
      let activityParams = buildActivityParams(node, state, inputs);
      activityParams = mergeBenchmarkOcrCacheParams(
        node.activityType,
        activityParams,
        state.ctx,
      );

      // Convert params object to positional args based on activity signature.
      const activityFn = activityProxy[node.activityType] as (
        ...args: unknown[]
      ) => Promise<unknown>;

      // Most activities take object parameters, so pass activityParams as single arg.
      result = (await activityFn(activityParams)) as Record<string, unknown>;
    }

    // Write output port bindings to ctx.
    if (node.outputs) {
      for (const binding of node.outputs) {
        const value = result[binding.port];
        writeToCtx(binding.ctxKey, value, state.ctx);
      }
    }

    // Return the ctx delta — the top-level subtrees this node touched —
    // so the cache decorator can persist them as `outputCtx`.
    return snapshotCtxDelta(state.ctx, outputTopLevelKeys);
  };

  if (state.cacheDeps && state.workflowLineageId) {
    // Phase 4 cache path (US-133 + US-135). The decorator's `cacheHit`
    // return drives the per-node status map: a hit flips `"running"` →
    // `"skipped"` with the cache row's `(configHash, inputHash)` so the
    // canvas can surface which inputs produced the cached output.
    const result = await executeCachedActivity(
      state.cacheDeps,
      nodeForCache,
      state.ctx,
      state.workflowLineageId,
      rawExecute,
    );
    if (result.cacheHit) {
      return {
        kind: "skipped",
        cacheHit: {
          configHash: result.configHash,
          inputHash: result.inputHash,
        },
      };
    }
    return { kind: "completed" };
  }

  // Legacy uncached path — preserves behaviour for tests / callers that
  // do not wire the cache plumbing.
  await rawExecute();
  return { kind: "completed" };
}

/**
 * Phase 6 Milestone C (US-171) — dispatch a `dyn.<slug>` activity node.
 *
 * Two-step:
 *   (1) `dynamicNode.resolveLineage` activity translates the slug +
 *       optional pinned version → immutable `versionId`. Registered with
 *       `nonCacheable: true` so head movement is picked up on the next
 *       execution.
 *   (2) `dyn.run` activity invokes the deno-runner sidecar with the
 *       resolved versionId + ambient context. Phase 4's cache decorator
 *       handles caching naturally — the cache key derives from the
 *       activity's input which includes `versionId`.
 *
 * Throws if `state.groupId` or `state.workflowRunId` is unset (the
 * workflow entry point must populate both before dispatching a dyn node).
 */
async function dispatchDynamicNode(
  node: ActivityNode,
  state: ExecutionState,
  inputs: Record<string, unknown>,
  /**
   * Phase 6 (sweep follow-on #2): when the executor pre-resolved the
   * versionId before entering the cache decorator (so configHash mixes it
   * in), pass it here to avoid a redundant resolveLineage round-trip.
   * Falls back to inline resolution for legacy / uncached callers.
   */
  preResolvedVersionId?: string,
): Promise<Record<string, unknown>> {
  const slug = node.activityType.slice("dyn.".length);
  if (slug.length === 0) {
    throw ApplicationFailure.create({
      type: "DYNAMIC_NODE_INVALID_TYPE",
      message: `Dynamic node has empty slug: ${node.activityType}`,
      nonRetryable: true,
    });
  }
  if (state.groupId == null) {
    throw ApplicationFailure.create({
      type: "DYNAMIC_NODE_MISSING_GROUP",
      message: `Dynamic node '${slug}' requires a groupId on the workflow context`,
      nonRetryable: true,
    });
  }
  if (state.workflowRunId === undefined) {
    throw ApplicationFailure.create({
      type: "DYNAMIC_NODE_MISSING_RUN_ID",
      message: `Dynamic node '${slug}' requires a workflowRunId on the workflow context`,
      nonRetryable: true,
    });
  }
  const apiKey = state.apiKey ?? "";

  // (1) Resolve lineage → versionId — skipped when the executor already did
  // it above the cache decorator (sweep follow-on #2).
  let versionId: string;
  if (preResolvedVersionId !== undefined) {
    versionId = preResolvedVersionId;
  } else {
    const resolveProxy = proxyActivities<DynamicNodeActivities>(
      RESOLVE_LINEAGE_ACTIVITY_OPTIONS,
    );
    const resolved = await resolveProxy["dynamicNode.resolveLineage"]({
      groupId: state.groupId,
      slug,
      version: node.dynamicNodeVersion,
    });
    versionId = resolved.versionId;
  }

  // (2) Invoke dyn.run with the resolved versionId.
  const dynRunProxy = proxyActivities<DynRunActivities>(
    DYN_RUN_ACTIVITY_OPTIONS,
  );
  return dynRunProxy["dyn.run"]({
    slug,
    versionId,
    parameters: node.parameters ?? {},
    inputCtx: inputs,
    groupId: state.groupId,
    workflowRunId: state.workflowRunId,
    apiKey,
  });
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
      type: "GRAPH_EXECUTION_ERROR",
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
async function executeChildWorkflowNode(
  node: ChildWorkflowNode,
  state: ExecutionState,
): Promise<void> {
  const activityProxy = proxyActivities({
    startToCloseTimeout: "30s" as Duration,
    retry: { maximumAttempts: 3 } as RetryPolicy,
  });

  let childGraph: GraphWorkflowConfig;

  if (node.workflowRef.type === "inline") {
    childGraph = node.workflowRef.graph;
  } else {
    const result = (await (
      activityProxy.getWorkflowGraphConfig as (
        params: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>
    )({
      workflowId: node.workflowRef.workflowId,
      // US-080: forward the optional pinned version. When undefined, the
      // activity falls through to its existing head-resolution lookup.
      version: node.workflowRef.version,
    })) as {
      graph: GraphWorkflowConfig;
    };
    childGraph = result.graph;
  }

  const initialCtx: Record<string, unknown> = {};
  if (node.inputMappings) {
    for (const mapping of node.inputMappings) {
      initialCtx[mapping.port] = resolvePortBinding(mapping.ctxKey, state.ctx);
    }
  }

  const childResult = await executeChild("graphWorkflow", {
    args: [
      {
        graph: childGraph,
        initialCtx,
        configHash: state.configHash,
        runnerVersion: state.runnerVersion,
        parentWorkflowId: workflowInfo().workflowId,
        // SECURITY: propagate the parent's tenant scope so the child runner
        // sets state.groupId and its activity-node executor can inject the
        // trusted groupId. Without this the child would run with
        // state.groupId=null and any activity parameters supplied by the
        // graph author would reach the activity unchecked.
        groupId: state.groupId ?? null,
        // Phase 4 (US-133): propagate the parent's lineage scope so the
        // child runner's cache reads/writes are keyed under the parent
        // lineage. Identical activity configs across parent+child share
        // cache rows.
        workflowLineageId: state.workflowLineageId ?? null,
        // Phase 6 Milestone C (US-170) — child workflows inherit the
        // originating caller's API key so dynamic nodes nested in
        // library child workflows can still call back into the platform.
        apiKey: state.apiKey ?? null,
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
    // Phase 4 (US-135): share the parent's run-status map so the canvas
    // observes per-branch nodes mid-execution. Map subgraphs nest the
    // same node ids across iterations — the last iteration's status
    // wins, which matches the canvas's "show me the latest" semantics.
    nodeRunStatuses: parentState.nodeRunStatuses,
    cancelled: parentState.cancelled,
    cancelMode: parentState.cancelMode,
    ctx: branchCtx,
    selectedEdges: new Map<string, string>(),
    mapBranchResults: new Map<string, unknown[]>(),
    configHash: parentState.configHash,
    runnerVersion: parentState.runnerVersion,
    requestId: parentState.requestId,
    groupId: parentState.groupId,
    // Phase 4 (US-133): propagate cache plumbing so map-branch activities
    // also benefit from the cache layer.
    workflowLineageId: parentState.workflowLineageId,
    cacheDeps: parentState.cacheDeps,
    // Phase 6 Milestone C (US-170) — propagate the dyn.run ambient context
    // so dynamic-node branches inside map subgraphs see the same caller +
    // workflow run.
    apiKey: parentState.apiKey,
    workflowRunId: parentState.workflowRunId,
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

        // Mark node as running (legacy status map + Phase 4 run-status
        // map — both maintained in lockstep, see graph-runner.ts).
        const startedAt = new Date().toISOString();
        branchState.nodeStatuses.set(nodeId, {
          status: "running",
          startedAt,
        });
        branchState.nodeRunStatuses[nodeId] = {
          status: "running",
          startedAt,
        };

        try {
          let executionResult: NodeExecutionResult;
          // Handle switch nodes specially
          if (node.type === "switch") {
            const selectedEdgeId = executeSwitchNode(
              node as SwitchNode,
              branchState.ctx,
            );
            branchState.selectedEdges.set(nodeId, selectedEdgeId);
            executionResult = { kind: "completed" };
          } else {
            executionResult = await executeNode(node, config, branchState);
          }

          // Mark node as completed
          branchState.completedNodeIds.add(nodeId);
          const endedAt = new Date().toISOString();
          branchState.nodeStatuses.set(nodeId, {
            status: "completed",
            completedAt: endedAt,
          });
          // Phase 4 (US-135) — flip the run-status map based on whether
          // the activity-node cache decorator short-circuited.
          if (executionResult.kind === "skipped") {
            branchState.nodeRunStatuses[nodeId] = {
              status: "skipped",
              startedAt,
              endedAt,
              cacheHit: executionResult.cacheHit,
            };
          } else {
            branchState.nodeRunStatuses[nodeId] = {
              status: "succeeded",
              startedAt,
              endedAt,
            };
          }
        } catch (error) {
          // Phase 4 (US-135) — record the failure status BEFORE
          // `handleNodeError` (which re-throws on the default policy).
          const failedAt = new Date().toISOString();
          branchState.nodeRunStatuses[nodeId] = {
            status: "failed",
            startedAt,
            endedAt: failedAt,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          };
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
