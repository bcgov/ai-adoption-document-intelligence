# US-140: Backend `GET /:id/preview-cache` endpoint

**As a** frontend preview widget rendering a node's last cached output,
**I want** a REST endpoint that returns the cache row for `(workflowLineageId, nodeId)` — defaulting to the most recent, scopable to a specific `runId`,
**So that** widgets can read their data without polling Temporal or needing direct DB access.

## Acceptance Criteria

- [x] **Scenario 1**: Endpoint route + query parameters
    - **Given** `apps/backend-services/src/workflows/workflow.controller.ts`
    - **When** read after the change
    - **Then** a new `@Get(":id/preview-cache")` route exists
    - **And** it accepts `@Query("nodeId") nodeId: string` (required) and `@Query("runId") runId?: string` (optional)
    - **And** the route inherits the existing per-workflow membership check

- [x] **Scenario 2**: Default (no `runId`) returns most recent fresh row
    - **Given** the endpoint called WITHOUT `runId`
    - **When** the handler runs
    - **Then** it calls a new repo method `findMostRecentFresh({ workflowLineageId, nodeId })` that returns the row with the highest `createdAt` where `expiresAt > now()`
    - **And** the result is shaped as `ActivityOutputPreviewDto { outputCtx, outputKind, createdAt, expiresAt }`

- [x] **Scenario 3**: `runId`-scoped returns the row from that run's execution window
    - **Given** the endpoint called WITH `runId`
    - **When** the handler runs
    - **Then** it first fetches the run's `startedAt + endedAt` window from Temporal (via the same client used by US-136)
    - **And** queries for the cache row matching `(workflowLineageId, nodeId)` where `createdAt` is within `[startedAt, endedAt + 5s slack]`
    - **And** returns the most recent matching row (handles re-execution corner cases) as `ActivityOutputPreviewDto`

- [x] **Scenario 4**: 404 on no fresh row
    - **Given** a node with no cache row, OR rows all past `expiresAt`, OR `runId`-scoped query with no matches
    - **When** the endpoint is hit
    - **Then** HTTP 404 with `{ message: "No cached output for this node" }`
    - **And** the consumer treats 404 as "show cache-evicted state" (US-155)

- [x] **Scenario 5**: Full Swagger documentation
    - **Given** the new route
    - **When** the OpenAPI spec is regenerated
    - **Then** the endpoint declares `@ApiOperation`, `@ApiOkResponse({ type: ActivityOutputPreviewDto })`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiQuery({ name: "nodeId", required: true })`, `@ApiQuery({ name: "runId", required: false })`
    - **And** the new `ActivityOutputPreviewDto` class has `@ApiProperty` on `outputCtx` (Record), `outputKind` (string-or-null), `createdAt` (string), `expiresAt` (string)

- [x] **Scenario 6**: Controller spec covers default + scoped + 404 paths
    - **Given** the controller spec file
    - **When** tests run
    - **Then** at least 4 cases pass: default returns most recent, scoped returns row in window, scoped no-match returns 404, runId on non-existent run returns 404

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflow.controller.ts` — add the route
- `apps/backend-services/src/workflows/dtos/activity-output-preview.dto.ts` — new DTO
- `apps/backend-services/src/cache/activity-output-cache.repository.ts` — add `findMostRecentFresh` method
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new test cases

## Technical notes

- The `runId`-scoped path queries Temporal for the run's `startedAt + endedAt` (via `temporalClient.workflow.getHandle(runId).describe()`). For an in-flight run, `endedAt` is null — use the current time as upper bound.
- The 5s slack on the upper bound covers a race: a cache row written by the worker post-completion but before Temporal marks the run as ended. Generous but harmless.
- Cache rows past `expiresAt` are returned as 404 even though they're still in the DB until GC. This is intentional — the consumer can distinguish "never ran" (no row) from "ran but cache evicted" (404) via the run history endpoint (US-150) and surfaces the cache-evicted Alert state (US-155).
- This endpoint is hot — every node renders one preview widget that calls it on each status transition. Performance budget: < 80ms per call. Index hit guaranteed on `(workflowLineageId, nodeId)`.
