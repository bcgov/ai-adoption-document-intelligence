# US-132: `executeCachedActivity` — worker decorator

**As a** Temporal workflow executing graph nodes,
**I want** a single `executeCachedActivity(node, ctx, workflowLineageId, rawExecute)` decorator that checks the cache before calling the underlying activity AND writes the result on success,
**So that** subsequent Trys of the same workflow short-circuit on unchanged nodes without touching workflow code.

## Acceptance Criteria

- [ ] **Scenario 1**: Decorator function signature + happy path
    - **Given** `apps/temporal/src/cache/cached-activity.ts` (new file)
    - **When** read
    - **Then** it exports `async function executeCachedActivity(node: GraphNode, ctx: Record<string, unknown>, workflowLineageId: string, rawExecute: () => Promise<Record<string, unknown>>): Promise<{ cacheHit: boolean }>`
    - **And** on cache miss it calls `rawExecute`, assigns the returned delta into `ctx` (`Object.assign(ctx, delta)`), writes the cache row via `activityOutputCache.upsert`, and returns `{ cacheHit: false }`

- [ ] **Scenario 2**: Cache hit path skips the underlying activity
    - **Given** a node whose `(workflowLineageId, nodeId, configHash, inputHash)` has a fresh cache row
    - **When** `executeCachedActivity` is called
    - **Then** `findFresh` returns the row, the decorator assigns `row.outputCtx` into `ctx`, and `rawExecute` is NEVER called
    - **And** the return value is `{ cacheHit: true }`

- [ ] **Scenario 3**: `nonCacheable` activities bypass the cache entirely
    - **Given** a node whose `ACTIVITY_CATALOG[node.activityType].nonCacheable === true`
    - **When** the decorator runs
    - **Then** it skips `findFresh` AND `upsert`, calls `rawExecute` directly, and returns `{ cacheHit: false }`
    - **And** for source nodes (no `activityType` field), the decorator looks up the source catalog instead — source nodes ARE cached (per L16); the bypass only applies to non-cacheable activities

- [ ] **Scenario 4**: Concurrent-write race resolves to "use the existing row"
    - **Given** two parallel executions of the same node landing simultaneously
    - **When** both miss the cache and both attempt `upsert`
    - **Then** Prisma's unique constraint causes one to "lose" the race; the decorator catches the constraint-violation error, falls back to a re-`findFresh`, assigns that row's outputCtx into ctx, and returns `{ cacheHit: true }`
    - **And** the activity's body is not double-executed for the user-visible result (worst case: it was executed twice, but the second result is discarded — acceptable for now; the cache is best-effort)

- [ ] **Scenario 5**: Activity failure bypasses `upsert`
    - **Given** a node whose `rawExecute` throws (Temporal activity failure)
    - **When** the decorator runs
    - **Then** the error propagates up to the workflow without `upsert` being called
    - **And** no partial cache row is written — re-running the workflow re-executes the activity from scratch

- [ ] **Scenario 6**: Unit tests cover hit / miss / nonCacheable / race / failure paths
    - **Given** `apps/temporal/src/cache/cached-activity.spec.ts`
    - **When** tests run
    - **Then** at least 5 cases pass: cache-hit, cache-miss, nonCacheable bypass, race-then-re-findFresh, activity-failure-no-upsert
    - **And** mocks for `activityOutputCache.findFresh` / `upsert` are provided per Temporal's activity-mock pattern (existing test harness)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/cache/cached-activity.ts` — implementation
- `apps/temporal/src/cache/cached-activity.spec.ts` — unit tests

## Technical notes

- The decorator imports `stableJson` + `computeInputHash` from `@ai-di/graph-workflow/cache` (US-127 + US-129). `configHash = sha256(stableJson(node.parameters ?? {}))`.
- The decorator is a higher-order function used inside the workflow's per-node dispatch (US-133 wires it). Workflow code doesn't change shape — the dispatch point in `graph-workflow.ts` swaps `await proxy.activities[activityType](...)` for `await executeCachedActivity(node, ctx, lineageId, () => proxy.activities[activityType](...))`.
- The decorator is `nonCacheable`-aware: when wrapping a non-cacheable activity, both DB calls (`findFresh`, `upsert`) are skipped — net cost equals the un-cached path.
- The `cacheHit` boolean return is consumed by US-133's status-map update (it flips the per-node status from "running" to "skipped" rather than "succeeded" on a hit).
- This story doesn't modify graph-workflow.ts yet — US-133 wires it in. Until that lands, the decorator exists but no production code calls it.
