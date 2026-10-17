# US-130: `ActivityCatalogEntry.nonCacheable?` flag + `ActivityOutputCacheRepository`

**As a** worker decorator (US-132) and backend preview-cache endpoint (US-140),
**I want** (a) a typed `nonCacheable?: boolean` field on catalog entries to opt activities out of caching, AND (b) a Prisma-backed repository exposing `findFresh` / `upsert` / `deleteExpired` against the `ActivityOutputCache` table (US-126),
**So that** opt-out is declarative on the catalog and the cache read/write surface is encapsulated behind a single repo class.

## Acceptance Criteria

- [x] **Scenario 1**: `ActivityCatalogEntry.nonCacheable?` schema addition
    - **Given** `packages/graph-workflow/src/catalog/types.ts`
    - **When** the file is read after the change
    - **Then** `ActivityCatalogEntry` declares an optional `nonCacheable?: boolean` field
    - **And** JSDoc on the field cross-references TRY_IN_PLACE_DESIGN.md §2.6 with the rationale: "When true, this activity is never cached. Use for non-deterministic activities (timestamped, RNG-driven, IO-stateful)."
    - **And** existing catalog entries are unchanged (the field is absent and defaults to `false`)

- [x] **Scenario 2**: `ActivityOutputCacheRepository.findFresh()` reads the unique key
    - **Given** `apps/backend-services/src/cache/activity-output-cache.repository.ts`
    - **When** the new repo is read
    - **Then** it exposes `async findFresh({ workflowLineageId, nodeId, configHash, inputHash }): Promise<ActivityOutputCache | null>` that queries the unique index AND filters `expiresAt > now()`
    - **And** rows past their `expiresAt` are filtered out (return `null`) even though they may not yet have been GC'd

- [x] **Scenario 3**: `upsert()` writes or overwrites the row + sets expiresAt
    - **Given** the repo
    - **When** `upsert({ ..., outputCtx, outputKind, ttlMs })` is called
    - **Then** Prisma's `upsert` lands a new row OR overwrites the existing row matching the unique key
    - **And** `expiresAt = new Date(Date.now() + (ttlMs ?? DEFAULT_CACHE_TTL_MS))` (defaults to the 24h constant from US-126)
    - **And** the returned row reflects the persisted shape

- [x] **Scenario 4**: `deleteExpired()` for GC
    - **Given** the repo
    - **When** `deleteExpired()` is called
    - **Then** Prisma `deleteMany` removes all rows where `expiresAt < now()`
    - **And** the returned count matches the number of deleted rows
    - **And** the operation uses the `(expiresAt)` index for efficiency

- [x] **Scenario 5**: Repo registered in a NestJS module + injectable
    - **Given** the controller hosting the new Phase 4 endpoints (`WorkflowController`)
    - **When** the module is wired
    - **Then** `ActivityOutputCacheRepository` is provided by a new `CacheModule` (or co-located with `WorkflowsModule` — implementer choice) and injectable into the controller
    - **And** the existing `PrismaService` is reused (no new connection / pool)

- [x] **Scenario 6**: Unit tests cover repo paths
    - **Given** `apps/backend-services/src/cache/activity-output-cache.repository.spec.ts`
    - **When** tests run via `npm test`
    - **Then** at least 6 cases pass: findFresh-hit, findFresh-miss-expired, findFresh-miss-no-row, upsert-insert, upsert-overwrite, deleteExpired-counts-correctly

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/types.ts` — add `nonCacheable?: boolean` to `ActivityCatalogEntry`
- `apps/backend-services/src/cache/activity-output-cache.repository.ts` — Prisma-backed repo
- `apps/backend-services/src/cache/activity-output-cache.repository.spec.ts` — unit tests
- `apps/backend-services/src/cache/cache.module.ts` (or extend an existing module) — register the repo as injectable

## Technical notes

- The shared package's catalog type change is what makes US-133's sweep (setting `nonCacheable: true` on 9 entries) type-safe.
- The repo intentionally lives in `apps/backend-services` (not in a shared package) because Prisma client is per-app. The Temporal worker will reach the cache table via Temporal activities that proxy to this repo (US-131 / US-132).
- The bulk catalog invariant test (US-103, Phase 3 Milestone F) gets extended in US-133 to assert every catalog entry's `nonCacheable` field is either explicitly set OR absent — this story only adds the field; the assertion lands with the sweep.
- After landing: **ask Alex to restart Vite** — `ActivityCatalogEntry` is a shared-package type change consumed by the frontend palette + settings panel via the catalog re-exports.
