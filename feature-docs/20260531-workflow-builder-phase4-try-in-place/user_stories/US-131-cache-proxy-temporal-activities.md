# US-131: Cache proxy Temporal activities — `findFresh` + `upsert`

**As a** worker decorator (US-132) running inside the Temporal worker process,
**I want** two thin Temporal activities `activityOutputCache.findFresh` and `activityOutputCache.upsert` that proxy to the backend's `ActivityOutputCacheRepository`,
**So that** the decorator can read/write cache rows through the standard Temporal activity surface (no direct DB access from the worker) and benefit from existing retry/timeout policies.

## Acceptance Criteria

- [ ] **Scenario 1**: Two activities registered in the activities barrel
    - **Given** `apps/temporal/src/activities/cache/activity-output-cache.activities.ts` (new file)
    - **When** the file is read
    - **Then** it exports `activityOutputCache.findFresh` and `activityOutputCache.upsert` as activity functions
    - **And** both are registered in the worker's activities barrel (`apps/temporal/src/activities/index.ts`)
    - **And** both carry the activity-options annotation `nonCacheable: true` (the decorator MUST NOT recurse into caching its own cache operations)

- [ ] **Scenario 2**: `findFresh` signature + behaviour
    - **Given** the registered activity
    - **When** called with `{ workflowLineageId, nodeId, configHash, inputHash }`
    - **Then** it calls the backend `ActivityOutputCacheRepository.findFresh` via the existing Prisma boundary and returns `{ outputCtx, outputKind } | null`
    - **And** expired rows return `null` (the repo already filters them — verified by integration test)

- [ ] **Scenario 3**: `upsert` signature + behaviour
    - **Given** the registered activity
    - **When** called with `{ workflowLineageId, nodeId, configHash, inputHash, outputCtx, outputKind, ttlMs? }`
    - **Then** it calls the repo's `upsert` and returns void on success
    - **And** the row's `expiresAt` reflects the passed `ttlMs` or the default 24h
    - **And** concurrent upserts (same unique key) resolve to the latest-wins write without throwing

- [ ] **Scenario 4**: Activity-level retry policy matches a transient-fault profile
    - **Given** the activity registration
    - **When** Temporal worker options are inspected
    - **Then** these two activities use a short retry policy (3 attempts, 100ms initial interval, 2x backoff) — they're DB calls, not long-running OCR work
    - **And** the `startToCloseTimeout` is 10 seconds (short, since these are simple DB reads/writes)

- [ ] **Scenario 5**: Temporal-side unit tests
    - **Given** `apps/temporal/src/activities/cache/activity-output-cache.activities.spec.ts`
    - **When** tests run
    - **Then** at least 4 cases pass: findFresh-hit, findFresh-miss, upsert-insert, upsert-overwrite
    - **And** the existing Temporal test harness's Prisma mock is reused (no new infrastructure)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/activities/cache/activity-output-cache.activities.ts` — implementation
- `apps/temporal/src/activities/cache/activity-output-cache.activities.spec.ts` — unit tests
- `apps/temporal/src/activities/index.ts` — register the new activities

## Technical notes

- These activities follow the same pattern as `getWorkflowGraphConfig` (Phase 2 Track 3) — they bridge the worker into the backend's Prisma layer via NestJS's existing DI surface. Implementation references the Track 3 activity for shape.
- The `nonCacheable: true` marker on these activities is NOT the catalog flag (these aren't catalog entries) — it's a per-activity-call hint consumed by the worker decorator (US-132) to skip wrapping them. See the decorator's "bypass list" logic in US-132 §2.
- This story is foundational for the worker decorator (US-132) and must merge first.
- No new exports from `@ai-di/graph-workflow` — Vite doesn't need a restart for this story.
