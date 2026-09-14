# US-152: `GET /versions/:versionId/run-count` + run-count badge on VersionHistoryDrawer

**As a** user looking at the Version history drawer,
**I want** each version row to carry a small badge showing how many runs that version has executed,
**So that** I can quickly see which version was actively used vs which were drafts that never ran.

## Acceptance Criteria

- [x] **Scenario 1**: Backend endpoint + DTO
    - **Given** `apps/backend-services/src/workflows/workflow.controller.ts`
    - **When** read after the change
    - **Then** a new `@Get(":id/versions/:versionId/run-count")` route returns `VersionRunCountDto { runCount: number }`
    - **And** Swagger declares `@ApiOkResponse({ type: VersionRunCountDto })`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`
    - **And** the route inherits per-workflow auth

- [x] **Scenario 2**: Implementation queries Temporal visibility count
    - **Given** the endpoint hit
    - **When** the handler runs
    - **Then** it calls `temporalClient.workflow.count({ query: \`WorkflowLineageId = "<lineage>" AND WorkflowVersionId = "<versionId>"\` })`
    - **And** returns the count

- [x] **Scenario 3**: Server-side 60s LRU cache
    - **Given** the handler
    - **When** called repeatedly for the same `(workflowId, versionId)` within 60s
    - **Then** subsequent calls return the cached count without hitting Temporal
    - **And** the LRU is a small in-process `Map` with TTL semantics — no Redis dependency

- [x] **Scenario 4**: Frontend `useVersionRunCount` hook
    - **Given** `apps/frontend/src/features/workflow-builder/versioning/useVersionRunCount.ts` (new file)
    - **When** read
    - **Then** it exports `function useVersionRunCount(workflowId: string, versionId: string): { data: { runCount: number } | null }`
    - **And** uses `queryKey: ["version-run-count", workflowId, versionId]` with `staleTime: 60_000` (matches the server-side cache TTL)
    - **And** does not poll (run counts change rarely; explicit invalidation only)

- [x] **Scenario 5**: Run-count badge in VersionHistoryDrawer
    - **Given** the existing `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` (Phase 2 Track 3)
    - **When** read after the change
    - **Then** each row renders an additional `<Badge variant="light" color="gray">{runCount} runs</Badge>` after the version label + createdAt + head badge
    - **And** the badge reads "0 runs" when count is 0 (no special hide-for-zero behaviour — explicitness > minimalism here)
    - **And** loading state hides the badge (renders nothing); error state hides too

- [x] **Scenario 6**: Tests cover backend + hook + badge
    - **Given** the controller spec + hook test + drawer test
    - **When** tests run
    - **Then** at least 4 cases pass: endpoint returns the count, 60s LRU returns cached value, hook fetches count, drawer row renders the badge

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflow.controller.ts` — add the new route + LRU
- `apps/backend-services/src/workflows/dtos/version-run-count.dto.ts` — new DTO
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new tests
- `apps/frontend/src/features/workflow-builder/versioning/useVersionRunCount.ts` — hook
- `apps/frontend/src/features/workflow-builder/versioning/useVersionRunCount.test.tsx` — hook test
- `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` — render badge

## Technical notes

- Temporal's `count` API is cheaper than `list` for "how many runs match this query"; use it for this endpoint.
- The LRU cache key is `(workflowId, versionId)`. TTL = 60s. The cache is per-process (no shared cache across backend instances); acceptable for production scale.
- This story closes the "run-count badge on version rows" item from L43 + the new endpoint per L24. Could in principle be split into two stories but they're tightly coupled (the badge only exists because of the endpoint).
- After landing: no Vite restart (backend + frontend additions; no shared-package changes).
