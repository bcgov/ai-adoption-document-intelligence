/**
 * Node Executors
 *
 * Execution handlers for all node types and branch subgraph execution.
 */

import { ACTIVITY_CATALOG } from "@ai-di/graph-workflow";
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
  GraphWorkflowResult,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SwitchNode,
} from "../graph-workflow-types";
import {
  applyCtxNamespace,
  resolvePortBinding,
  writeToCtx,
} from "./context-utils";
import { handleNodeError, throwPollTimeout } from "./error-handling";
import type { ExecutionState } from "./execution-state";
import { computeReadySetForSubgraph } from "./graph-algorithms";
import {
  executeWithConcurrencyLimit,
  fulfilledValues,
  parseDurationToMs,
  rejectedOutcomes,
} from "./runner-utils";

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

/**
 * Inject a benchmark run's OCR replay payload (`ctx.__benchmarkOcrCache`) into
 * an activity's params so it can short-circuit live OCR without graph-definition
 * changes.
 *
 * Which activities participate — and whether they also receive the cached
 * `ocrResponse` — is declared on each activity's `benchmarkOcrCacheRole`
 * catalog-entry field, NOT hard-coded here: the graph engine stays
 * workload-generic (CLAUDE.md) and never names specific OCR activity types.
 */
function isOcrCachePayload(value: unknown): value is { ocrResponse?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "ocrResponse" in value
  );
}

export function mergeBenchmarkOcrCacheParams(
  activityType: string,
  activityParams: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const role = ACTIVITY_CATALOG[activityType]?.benchmarkOcrCacheRole;
  const raw: unknown = ctx.__benchmarkOcrCache;
  if (role === undefined || !isOcrCachePayload(raw)) {
    return activityParams;
  }
  const merged: Record<string, unknown> = {
    ...activityParams,
    __benchmarkOcrCache: raw,
  };
  if (role === "extract" && raw.ocrResponse !== undefined) {
    merged.ocrResponse = raw.ocrResponse;
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
 * Resolve the full dotted ctx paths this node's `outputs[]` write to — the
 * exact paths `writeToCtx` targets. `applyCtxNamespace` remaps the namespace
 * prefixes (`doc.* → documentMetadata.*`, `segment.* → currentSegment.*`), so
 * `doc.field` resolves to `documentMetadata.field`.
 *
 * §3.1: earlier this recorded only the top-level *root* (`documentMetadata`),
 * so the cache snapshot captured the ENTIRE subtree — including whatever a
 * concurrent sibling had written into it — and a later cache hit restored the
 * whole subtree, reverting the sibling's fresh output. Recording the precise
 * leaf paths lets the snapshot capture only what THIS node produced.
 */
function collectOutputLeafPaths(node: ActivityNode): string[] {
  if (!node.outputs || node.outputs.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  for (const binding of node.outputs) {
    const path = applyCtxNamespace(binding.ctxKey);
    if (path.length > 0) {
      seen.add(path);
    }
  }
  return Array.from(seen);
}

/**
 * Snapshot ONLY the leaf paths this node wrote into a nested delta object
 * that mirrors ctx's shape (e.g. `{ documentMetadata: { field: <value> } }`
 * for a `doc.field` output). The Phase 4 cache decorator persists this as
 * `outputCtx`; a cache-hit replay deep-merges it back into ctx
 * (`cached-activity.ts`), setting only these leaves and leaving concurrent
 * siblings' writes into the same subtree intact. Missing leaves (the node
 * produced no value for a declared output) are skipped.
 */
function snapshotCtxDelta(
  ctx: Record<string, unknown>,
  leafPaths: string[],
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const path of leafPaths) {
    const segments = path.split(".");
    // Deep-get the value this node wrote at `path`.
    let src: unknown = ctx;
    let found = true;
    for (const seg of segments) {
      if (
        src === null ||
        typeof src !== "object" ||
        !(seg in (src as Record<string, unknown>))
      ) {
        found = false;
        break;
      }
      src = (src as Record<string, unknown>)[seg];
    }
    if (!found) {
      continue;
    }
    // Deep-set the value into the delta, creating intermediate objects so
    // the delta mirrors ctx's nesting for exactly this leaf path.
    let cursor = delta;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const next = cursor[seg];
      if (typeof next !== "object" || next === null) {
        cursor[seg] = {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = src;
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
  const outputLeafPaths = collectOutputLeafPaths(node);

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
  // §3.3: a `@deterministic:false` dynamic node (external API / randomness)
  // must NOT be cached — re-running it with the same versionId + inputs has
  // to re-execute the script. The static `ACTIVITY_CATALOG` has no `dyn.*`
  // entries, so the cache decorator's `isNonCacheable` can't know this; the
  // executor reads the resolved version's flag and bypasses the cache path.
  let dynamicNodeCacheable = true;
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
      dynamicNodeCacheable = resolved.deterministic;
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

    // Return the ctx delta — the exact leaf paths this node wrote —
    // so the cache decorator can persist them as `outputCtx`.
    return snapshotCtxDelta(state.ctx, outputLeafPaths);
  };

  if (state.cacheDeps && state.workflowLineageId && dynamicNodeCacheable) {
    // Phase 4 cache path (US-133 + US-135). The decorator's `cacheHit`
    // return drives the per-node status map: a hit flips `"running"` →
    // `"skipped"` with the cache row's `(configHash, inputHash)` so the
    // canvas can surface which inputs produced the cached output.
    //
    // Non-deterministic dynamic nodes (`dynamicNodeCacheable === false`) skip
    // this and fall through to the uncached path below so they re-execute.
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
 * Collections with more than 20 items use child graphWorkflow per branch (ref-only history).
 * Smaller collections run in-process in the parent workflow.
 *
 * **Partial failure (G-026).** Branch results are collected by a helper that
 * settles rather than rejecting, so the successful branches survive a failing
 * sibling and are always written to `state.mapBranchResults`. What a failure
 * then MEANS is the map node's `errorPolicy.onError`:
 *   - absent / `"fail"` — the map throws (today's behaviour), naming the
 *     failed branch indices, and preserving the first failure's error type
 *     and retryability;
 *   - `"skip"` — the successful subset stands and the map completes;
 *   - `"fallback"` — throws like `fail`; the node-level fallback routing is
 *     then applied by `handleNodeError`, since a map body has no per-branch
 *     error edge to fall back to.
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

  const outcomes = await executeWithConcurrencyLimit(
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
              // §3.7: propagate the lineage so each child builds its cacheDeps
              // and participates in Phase 4 try-in-place caching. Without it,
              // the map's cache/replay semantics flipped on collection size —
              // ≤20 items (executeBranchSubgraph, which inherits the parent's
              // lineage + cacheDeps) cached, >20 (child workflows) did not.
              workflowLineageId: state.workflowLineageId ?? null,
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

  // G-026. The concurrency helper settles rather than rejecting, so the
  // branches that DID complete are always available here. Record them before
  // deciding anything: a downstream join reads `mapBranchResults`, and the
  // point of this fix is to stop one bad branch destroying its siblings.
  const results = fulfilledValues(outcomes);
  state.mapBranchResults.set(node.id, results);

  const failures = rejectedOutcomes(outcomes);
  if (failures.length === 0) return;

  const summary = failures
    .map(
      (failure) =>
        `#${failure.index}: ${
          failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason)
        }`,
    )
    .join("; ");
  const message = `Map node ${node.id}: ${failures.length} of ${collection.length} branches failed (${summary})`;

  // Recorded on both paths so a downstream `ctx.lastError` reference (and the
  // run's error surface) can see WHICH branches failed, not just that the map
  // as a whole did or didn't complete.
  state.lastError.current = {
    nodeId: node.id,
    message,
    type: "GRAPH_EXECUTION_ERROR",
  };

  // `skip` is the policy that says "keep going when a branch fails" — the
  // successful subset stands and the map completes. Every other policy keeps
  // today's semantics and throws. That includes `fallback`: a map body has no
  // per-branch error edge, so there is nothing branch-scoped to fall back to;
  // throwing hands the failure to `handleNodeError`, which applies the NODE's
  // fallback routing exactly as it would for any other node type.
  if (node.errorPolicy?.onError === "skip") return;

  // Preserve the FIRST failure's type and retryability so a workflow with no
  // error policy fails exactly as it does today — the only difference is that
  // the message now names the branches and the survivors are still in
  // `mapBranchResults`. Inventing a nonRetryable GRAPH_EXECUTION_ERROR here
  // would silently make previously-retryable map failures permanent.
  const first = failures[0].reason as
    | { type?: unknown; nonRetryable?: unknown }
    | undefined;
  throw ApplicationFailure.create({
    type:
      typeof first?.type === "string" ? first.type : "GRAPH_EXECUTION_ERROR",
    message,
    nonRetryable: first?.nonRetryable === true,
  });
}

/**
 * Execute a join node (fan-in)
 *
 * US-009: Join node handler
 *
 * Join nodes collect results from map node branches.
 *
 * G-026: when the source map ran under `errorPolicy.onError === "skip"` and
 * some branches failed, the join receives the SUCCESSFUL SUBSET, in original
 * branch order — failed branches contribute no entry at all rather than a
 * hole or a placeholder. So `results.length` is the number of branches that
 * produced a value, which is what every downstream consumer of an array
 * actually wants; the failures themselves are reported on
 * `state.lastError.current` by the map. Under any other policy the map throws
 * and the join never runs.
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

  // Step 2: Write results to context. Only the "all" strategy exists (§5.1):
  // executeMapNode already collected every branch result eagerly, so the join
  // simply surfaces them under resultsCtxKey.
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
  )({
    workflowId: node.workflowRef.workflowId,
    // US-080: forward the optional pinned version. When undefined, the
    // activity falls through to its head-resolution lookup.
    version: node.workflowRef.version,
    // G-019: name this node in the activity's non-retryable "library child
    // is gone" failure so the offending step is identifiable on the canvas.
    parentNodeId: node.id,
  })) as {
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
        // Phase 4 (US-133): propagate the parent's lineage scope so the
        // child runner's cache reads/writes are keyed under the parent
        // lineage. Identical activity configs across parent+child share
        // cache rows.
        workflowLineageId: state.workflowLineageId ?? null,
        // Item 4 (security): the caller's API key is no longer part of the
        // child workflow input. Dynamic nodes nested in library child
        // workflows source the platform API key server-side in `dyn.run`.
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
    workflowVersionId: parentState.workflowVersionId,
    configHash: parentState.configHash,
    runnerVersion: parentState.runnerVersion,
    requestId: parentState.requestId,
    groupId: parentState.groupId,
    // Phase 4 (US-133): propagate cache plumbing so map-branch activities
    // also benefit from the cache layer.
    workflowLineageId: parentState.workflowLineageId,
    cacheDeps: parentState.cacheDeps,
    // Phase 6 Milestone C (US-170) — propagate the dyn.run ambient context
    // so dynamic-node branches inside map subgraphs see the same workflow
    // run. (Item 4: the caller API key is no longer threaded here; `dyn.run`
    // sources the platform key server-side.)
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
