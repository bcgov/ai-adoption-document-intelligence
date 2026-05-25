# US-134: Catalog `nonCacheable: true` sweep + `activityOutputCache.gc` activity

**As a** Phase 4 cache layer,
**I want** (a) the 9 activities listed in L15 marked `nonCacheable: true` so non-deterministic activities don't poison the cache, AND (b) a scheduled GC sweep that deletes rows past `expiresAt`,
**So that** the cache table stays correct (no stale non-deterministic outputs) and bounded (lazy + eager TTL eviction working together).

## Acceptance Criteria

- [ ] **Scenario 1**: Nine catalog entries set `nonCacheable: true`
    - **Given** `packages/graph-workflow/src/catalog/activities/`
    - **When** the directory is read after the sweep
    - **Then** each of these entries declares `nonCacheable: true` on its `ActivityCatalogEntry`: `azureOcr.submit`, `azureClassify.submit`, `document.updateStatus`, `document.storeRejection`, `benchmark.persistOcrCache`, `benchmark.persistEvaluationDetails`, `benchmark.writePrediction`, `benchmark.updateRunStatus`, `benchmark.cleanup`
    - **And** every OTHER catalog entry leaves the field absent (defaults to `false`)

- [ ] **Scenario 2**: Bulk catalog invariant test extended
    - **Given** `packages/graph-workflow/src/catalog/catalog.test.ts` (US-103, Phase 3 Milestone F)
    - **When** the test is read after the change
    - **Then** a new assertion iterates every catalog entry and verifies `entry.nonCacheable === true || entry.nonCacheable === undefined` — catches typos like `noncacheable` (lowercase) or `nonCachable` (typo)
    - **And** existing assertions remain unchanged

- [ ] **Scenario 3**: `activityOutputCache.gc` Temporal activity
    - **Given** `apps/temporal/src/activities/cache/activity-output-cache.activities.ts` (extends US-131)
    - **When** the file is read after the change
    - **Then** it exports a new `activityOutputCache.gc` activity that calls `ActivityOutputCacheRepository.deleteExpired()` and returns `{ deletedCount: number }`
    - **And** the activity is registered with the same `nonCacheable: true` annotation as the other two cache activities

- [ ] **Scenario 4**: Hourly GC schedule
    - **Given** Temporal's scheduling support (existing in `apps/temporal/`)
    - **When** the worker registers schedules
    - **Then** a new schedule `cache-gc` runs `activityOutputCache.gc` once per hour
    - **And** if a Temporal schedule isn't already used elsewhere in this codebase, the implementer uses a small periodic workflow as a fallback (`gcWorkflow` that runs `gc` then `sleep(1h)` in a loop) — the simpler of the two

- [ ] **Scenario 5**: Tests cover the GC path
    - **Given** the new GC activity test
    - **When** tests run
    - **Then** at least 2 cases pass: (a) calls `deleteExpired` and returns the count, (b) survives a no-rows-to-delete case (returns `{ deletedCount: 0 }`)

- [ ] **Scenario 6**: Backend + temporal + package suites green
    - **Given** the catalog sweep + GC activity + schedule
    - **When** all three test-suites run
    - **Then** every existing test still passes AND the new tests above pass
    - **And** the bulk catalog invariant test (US-103 extended) passes

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/activities/azure-ocr-submit.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/azure-classify-submit.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/document-update-status.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/document-store-rejection.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/benchmark-persist-ocr-cache.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/benchmark-persist-evaluation-details.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/benchmark-write-prediction.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/benchmark-update-run-status.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/activities/benchmark-cleanup.ts` — set `nonCacheable: true`
- `packages/graph-workflow/src/catalog/catalog.test.ts` — extend bulk invariant
- `apps/temporal/src/activities/cache/activity-output-cache.activities.ts` — add `gc` activity (extends US-131)
- `apps/temporal/src/workflows/cache-gc.workflow.ts` (or a Temporal schedule definition) — schedule glue

## Technical notes

- The 9 catalog entries: all are either `submit`-style activities (which produce Azure operation IDs not derivable from inputs) or `*persist*` / `*update*` activities (which write to user-visible tables; skipping would mask the side effect).
- Run-history reconstruction (US-150) relies on cache rows existing for completed runs — GC at 1h interval is fine because cache TTL is 24h. There's a 23h window where runs can be replayed.
- Lazy GC also works as a fallback: `findFresh` filters by `expiresAt > now()` so expired rows are invisible to consumers even when the daemon hasn't run.
- After landing: **ask Alex to restart Vite** — catalog entries are runtime exports. The frontend's palette + settings panel + canvas renderer all consume `ACTIVITY_CATALOG` at module load.
