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
 * ## Race handling (Scenario 4)
 *
 * Two concurrent workers can both miss and both attempt to upsert. The
 * Prisma `@@unique` constraint causes one to throw a P2002 error. The
 * decorator catches that error, re-runs `findFresh`, assigns the now-
 * existing row's `outputCtx` into ctx, and returns `{ cacheHit: true }`.
 * The losing worker's freshly-computed delta is discarded — the cache
 * is best-effort and the user-visible result remains correct.
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
 * Return shape — `cacheHit` is consumed by US-133's status map
 * (a hit flips the node status from `"running"` to `"skipped"`).
 */
export interface ExecuteCachedActivityResult {
  cacheHit: boolean;
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

/**
 * Detects a Prisma `@@unique`-constraint-violation error (P2002).
 *
 * Tested via the documented error-shape contract — Prisma throws an
 * instance of `PrismaClientKnownRequestError` whose `code` property is
 * the string `"P2002"`. We probe the shape duck-typed so the decorator
 * doesn't depend on the Prisma runtime module (keeps the helper
 * importable from environments that don't pin Prisma).
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "P2002";
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
 *     `upsert`, returns `{ cacheHit: false }`. If `upsert` raises a
 *     P2002 (someone else won the race), re-runs `findFresh`, assigns
 *     that row's `outputCtx`, returns `{ cacheHit: true }`.
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
  // Scenario 3 — bypass for non-cacheable activities.
  if (isNonCacheable(node)) {
    const delta = await rawExecute();
    Object.assign(ctx, delta);
    return { cacheHit: false };
  }

  const configHash = sha256Hex(stableJson(getNodeParameters(node)));
  const inputHash = computeInputHash(node, ctx);

  // Scenario 2 — cache hit short-circuit.
  const cached = await deps.findFresh({
    workflowLineageId,
    nodeId: node.id,
    configHash,
    inputHash,
  });

  if (cached !== null) {
    Object.assign(ctx, cached.outputCtx);
    return { cacheHit: true };
  }

  // Scenario 1 (miss) + Scenario 5 (failure propagation).
  const delta = await rawExecute();
  Object.assign(ctx, delta);

  // Scenario 4 — concurrent-write race resolution.
  try {
    await deps.upsert({
      workflowLineageId,
      nodeId: node.id,
      configHash,
      inputHash,
      outputCtx: delta,
      outputKind: resolveOutputKind(node),
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    // Lost the race. The other worker's row is already committed; pull
    // it and overlay its outputCtx onto ctx so downstream nodes see the
    // canonical-but-equivalent delta. Our just-applied `delta` is
    // overwritten by the canonical one (acceptable per the design — the
    // values are equivalent up to non-determinism we tolerate when the
    // catalog says we can cache the activity at all).
    const winner = await deps.findFresh({
      workflowLineageId,
      nodeId: node.id,
      configHash,
      inputHash,
    });
    if (winner !== null) {
      Object.assign(ctx, winner.outputCtx);
    }
    return { cacheHit: true };
  }

  return { cacheHit: false };
}
