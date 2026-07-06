/**
 * Phase 4 — Worker-side cache decorator (US-132).
 *
 * Wraps a single activity dispatch with a `(findFresh → execute → upsert)`
 * cycle keyed on `(workflowLineageId, nodeId, configHash, inputHash)`.
 * The decorator is the only piece of code that knows about the cache —
 * the workflow body (US-133) calls it once per node and stays oblivious
 * to whether a node short-circuited or actually ran.
 *
 * Specs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L14, L16.
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §2.4 + §2.6.
 *
 * ## Architecture
 *
 * The decorator is invoked from inside the workflow (`graph-workflow.ts`,
 * US-133). Workflow code cannot reach Prisma directly — it must go
 * through Temporal activities. The cache reads/writes therefore live in
 * `apps/temporal/src/activities/cache/activity-output-cache.activities.ts`
 * (US-131) and the workflow wires them through `proxyActivities` once,
 * passing the proxies to every `executeCachedActivity` call as the
 * `deps` object. This keeps the decorator unit-testable in plain Jest
 * (no Temporal harness required) — tests inject mock proxies directly.
 *
 * ## Hash semantics
 *
 *   - `configHash = sha256(stableJson(node.parameters ?? {}))`
 *     For `ActivityNode` and `SourceNode` the parameters are the catalog
 *     parameters; for other node variants we fall back to the empty
 *     object hash (those node types don't go through the worker
 *     decorator in 4.0 but the type system requires a value).
 *   - `inputHash = computeInputHash(node, ctx)` — content-addressable
 *     hash of the consumed ctx slice (shared helper, US-129).
 *
 * ## `nonCacheable` bypass
 *
 *   - Activity nodes: `ACTIVITY_CATALOG[node.activityType]?.nonCacheable`.
 *     When true → skip findFresh + upsert, call `rawExecute` directly.
 *   - Source nodes: per REQUIREMENTS.md L16 they are ALWAYS cached;
 *     `SourceCatalogEntry` has no `nonCacheable` field.
 *   - Other node types (switch / map / join / pollUntil / humanGate /
 *     childWorkflow): the decorator is targeted at activity execution
 *     dispatches; if a caller routes one of these through the decorator
 *     we default to "cacheable" — caller is responsible for not wrapping
 *     truly non-deterministic dispatches.
 *
 * ## Race handling (Scenario 4) — best-effort
 *
 * Two concurrent workers can both miss and both attempt to upsert. The
 * Prisma `@@unique` constraint causes one to fail. Because `upsert` is a
 * Temporal activity proxy, that failure reaches the workflow as an
 * ActivityFailure with Prisma's `.code` stripped, so a lost race is
 * indistinguishable from any other terminal write failure (§3.4). The cache
 * is best-effort, so the decorator treats ANY upsert failure the same way:
 * re-run `findFresh` (guarded), overlay the winner's `outputCtx` if a row now
 * exists (returning `{ cacheHit: true }`), otherwise keep the already-applied
 * delta and continue uncached (`{ cacheHit: false }`). A failed cache write
 * never fails the node — the user-visible result stays correct.
 *
 * ## Failure (Scenario 5)
 *
 * If `rawExecute` throws, the error propagates without `upsert` being
 * called — partial cache rows are never written. Re-running the workflow
 * re-executes the activity from scratch.
 */

import type { GraphNode } from "@ai-di/graph-workflow";
import {
  ACTIVITY_CATALOG,
  computeInputHash,
  sha256Hex,
  stableJson,
} from "@ai-di/graph-workflow";

import type {
  ActivityOutputCacheFindFreshInput,
  ActivityOutputCacheFindFreshResult,
  ActivityOutputCacheUpsertInput,
} from "../activities/cache/activity-output-cache.types";

/**
 * Cache-activity proxy shape the workflow passes to every
 * `executeCachedActivity` call. Matches the namespaced exports of
 * `activityOutputCache` in `activity-output-cache.activities.ts`
 * (US-131) so the workflow can pass the Temporal proxy through
 * unmodified.
 */
export interface CachedActivityDeps {
  findFresh(
    input: ActivityOutputCacheFindFreshInput,
  ): Promise<ActivityOutputCacheFindFreshResult | null>;
  upsert(input: ActivityOutputCacheUpsertInput): Promise<void>;
}

/**
 * Return shape — `cacheHit` is consumed by US-135's `nodeStatuses` map
 * (a hit flips the node status from `"running"` to `"skipped"`).
 *
 * `configHash` + `inputHash` are also returned so the workflow status
 * map can surface them in the `cacheHit` field of `NodeRunStatus` —
 * the canvas displays these so the user can see which cache row served
 * the node's output. They are emitted on every path (hit, miss,
 * bypass) so callers don't need to recompute them.
 */
export interface ExecuteCachedActivityResult {
  cacheHit: boolean;
  configHash: string;
  inputHash: string;
}

/**
 * Returns `true` when the catalog declares this node's underlying
 * activity as non-cacheable. Source nodes ALWAYS return `false` per
 * REQUIREMENTS.md L16. Non-activity / non-source node variants default
 * to `false` (cacheable).
 */
function isNonCacheable(node: GraphNode): boolean {
  if (node.type === "activity") {
    const entry = ACTIVITY_CATALOG[node.activityType];
    return entry?.nonCacheable === true;
  }
  return false;
}

/**
 * Extracts the static parameter object for hashing. Activity and source
 * nodes both expose `parameters`; other node types do not.
 */
function getNodeParameters(node: GraphNode): Record<string, unknown> {
  if (node.type === "activity" && node.parameters) {
    return node.parameters;
  }
  if (node.type === "source" && node.parameters) {
    return node.parameters;
  }
  return {};
}

/**
 * Returns the activity's declared output kind (the first output port's
 * `kind`) coerced to the string the cache row stores in `outputKind`.
 * Returns `null` for source nodes (no activity-side output ports) and
 * for catalog entries with no declared outputs.
 */
function resolveOutputKind(node: GraphNode): string | null {
  if (node.type !== "activity") {
    return null;
  }
  const entry = ACTIVITY_CATALOG[node.activityType];
  if (!entry) {
    return null;
  }
  const firstOutputKind = entry.outputs?.[0]?.kind;
  return firstOutputKind ?? null;
}

/** Plain (non-array) object — the only shape we recurse into when merging. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge a cache delta / a cache row's `outputCtx` into `ctx`.
 *
 * §3.1: the delta (see `snapshotCtxDelta`) mirrors ctx's shape but contains
 * ONLY the leaf paths a node produced. A plain `Object.assign` would replace
 * whole top-level subtrees, so a cache-hit node would clobber a concurrent
 * sibling that wrote a different leaf of the same subtree (parallel ready-set
 * over shared ctx). Recursing into nested plain objects writes only the
 * delta's leaves and leaves sibling leaves intact. Arrays and primitives
 * replace wholesale; a node's own leaf is single-writer and deterministic
 * under input-hash equality, so overlaying it is a no-op in practice.
 */
function deepMergeCtx(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const incoming = source[key];
    const existing = target[key];
    if (isPlainRecord(existing) && isPlainRecord(incoming)) {
      deepMergeCtx(existing, incoming);
    } else {
      target[key] = incoming;
    }
  }
}

/**
 * Worker-side decorator: wraps `rawExecute` with a cache lookup and
 * cache write. Returns `{ cacheHit }` so the workflow's status map can
 * distinguish "this node ran" from "this node was served from cache".
 *
 * Contract:
 *   - On bypass (nonCacheable activity): calls `rawExecute`, assigns
 *     delta into ctx, returns `{ cacheHit: false }`.
 *   - On hit: assigns `row.outputCtx` into ctx, skips `rawExecute`,
 *     returns `{ cacheHit: true }`.
 *   - On miss: calls `rawExecute`, assigns delta into ctx, attempts
 *     `upsert`, returns `{ cacheHit: false }`. If `upsert` fails for ANY
 *     reason (a lost race is indistinguishable from a transient write
 *     failure across the activity boundary — §3.4), it re-runs `findFresh`
 *     best-effort: overlays the winner's `outputCtx` and returns
 *     `{ cacheHit: true }` when a row now exists, otherwise keeps the
 *     already-applied delta and returns `{ cacheHit: false }`. A failed
 *     cache write never fails the node.
 *   - On rawExecute failure: propagates the error without calling
 *     `upsert`.
 */
export async function executeCachedActivity(
  deps: CachedActivityDeps,
  node: GraphNode,
  ctx: Record<string, unknown>,
  workflowLineageId: string,
  rawExecute: () => Promise<Record<string, unknown>>,
): Promise<ExecuteCachedActivityResult> {
  const configHash = sha256Hex(stableJson(getNodeParameters(node)));

  // Scenario 3 — bypass for non-cacheable activities. We still compute
  // hashes so the workflow status map (US-135) can surface them in the
  // cacheHit field on the very-next replay should the catalog flip the
  // activity to cacheable; the bypass result itself reports
  // `cacheHit: false`.
  if (isNonCacheable(node)) {
    const inputHash = computeInputHash(node, ctx);
    const delta = await rawExecute();
    deepMergeCtx(ctx, delta);
    return { cacheHit: false, configHash, inputHash };
  }

  const inputHash = computeInputHash(node, ctx);

  // Scenario 2 — cache hit short-circuit.
  const cached = await deps.findFresh({
    workflowLineageId,
    nodeId: node.id,
    configHash,
    inputHash,
  });

  if (cached !== null) {
    deepMergeCtx(ctx, cached.outputCtx as Record<string, unknown>);
    return { cacheHit: true, configHash, inputHash };
  }

  // Scenario 1 (miss) + Scenario 5 (failure propagation).
  const delta = await rawExecute();
  deepMergeCtx(ctx, delta);

  // Scenario 4 — concurrent-write race resolution, best-effort.
  //
  // §3.4: `deps.upsert` is a Temporal activity proxy, so a P2002 unique-
  // constraint violation reaches the workflow as an ActivityFailure /
  // ApplicationFailure with Prisma's `.code` stripped — a lost race is
  // therefore INDISTINGUISHABLE from a transient write failure across the
  // activity boundary. A `code === "P2002"` probe never matched in
  // production, so any terminal upsert failure used to rethrow and fail the
  // node even though the activity had already produced its output. The cache
  // is best-effort (see the module contract), so on ANY upsert failure we
  // must NOT fail the node: the `delta` is already applied to ctx. Re-check
  // for a row another worker may have committed (the race case) and overlay
  // its canonical outputCtx for downstream determinism; if none exists, keep
  // our just-applied delta and continue uncached.
  try {
    await deps.upsert({
      workflowLineageId,
      nodeId: node.id,
      configHash,
      inputHash,
      outputCtx: delta,
      outputKind: resolveOutputKind(node),
    });
  } catch {
    let winner: ActivityOutputCacheFindFreshResult | null = null;
    try {
      winner = await deps.findFresh({
        workflowLineageId,
        nodeId: node.id,
        configHash,
        inputHash,
      });
    } catch {
      // The cache read also failed — nothing more we can do; the node's
      // output is already in ctx from the delta merge above.
      winner = null;
    }
    if (winner !== null) {
      deepMergeCtx(ctx, winner.outputCtx as Record<string, unknown>);
      return { cacheHit: true, configHash, inputHash };
    }
    return { cacheHit: false, configHash, inputHash };
  }

  return { cacheHit: false, configHash, inputHash };
}
