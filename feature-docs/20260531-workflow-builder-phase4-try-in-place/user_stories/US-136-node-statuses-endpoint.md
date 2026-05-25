# US-136: Backend `GET /:id/runs/:runId/node-statuses` proxy endpoint

**As a** frontend polling loop in the V2 editor canvas,
**I want** a REST endpoint that returns the per-node status map for a given run by proxying Temporal's `getNodeStatusesQuery`,
**So that** the canvas can read status without holding a Temporal client connection.

## Acceptance Criteria

- [ ] **Scenario 1**: Endpoint route + auth
    - **Given** `apps/backend-services/src/workflows/workflow.controller.ts`
    - **When** read after the change
    - **Then** a new `@Get(":id/runs/:runId/node-statuses")` route exists
    - **And** the route inherits the existing per-workflow membership check (`@UseGuards(...)` from prior phases) — same auth surface as `GET /:id`

- [ ] **Scenario 2**: Query Temporal + return the map
    - **Given** an active Temporal run handle for `:runId`
    - **When** the endpoint is hit
    - **Then** it calls `this.temporalClient.workflow.getHandle(runId).query(getNodeStatusesQuery)` (the query symbol from US-135)
    - **And** returns the map as JSON: `Record<string, NodeRunStatus>`

- [ ] **Scenario 3**: 404 when Temporal handle not found
    - **Given** a `runId` that Temporal doesn't recognise (typo, never existed)
    - **When** the endpoint is hit
    - **Then** Temporal throws `WorkflowNotFoundError` (or similar) and the endpoint catches it, returning HTTP 404 with `{ message: "Run not found" }`

- [ ] **Scenario 4**: 410 Gone when run retention-cleaned
    - **Given** a `runId` that's past Temporal's retention window (run completed weeks ago)
    - **When** the endpoint is hit
    - **Then** Temporal throws a retention-related error; the endpoint returns HTTP 410 Gone with `{ message: "Run history no longer available — use the cached preview endpoint instead" }`

- [ ] **Scenario 5**: Full Swagger documentation
    - **Given** the new route
    - **When** the OpenAPI spec is regenerated
    - **Then** the endpoint is fully documented per CLAUDE.md: `@ApiOperation`, `@ApiOkResponse({ type: NodeStatusesResponseDto })`, `@ApiNotFoundResponse`, `@ApiGoneResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`
    - **And** a new `NodeStatusesResponseDto` class with `@ApiProperty` decorators captures the response shape (record of `NodeRunStatusDto`)

- [ ] **Scenario 6**: Controller spec covers happy + 404 + 410 paths
    - **Given** `apps/backend-services/src/workflows/workflow.controller.spec.ts` (or a new dedicated spec)
    - **When** tests run
    - **Then** at least 3 cases pass: happy-path query returns the map, unknown runId returns 404, retention-cleaned runId returns 410
    - **And** the Temporal client is mocked

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflow.controller.ts` — add the new route
- `apps/backend-services/src/workflows/dtos/node-statuses-response.dto.ts` — new DTO (with embedded `NodeRunStatusDto`)
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new test cases

## Technical notes

- The Temporal client is already injected in `WorkflowController` via `TemporalClientService` (Phase 2 Track 2). Reuse it.
- The query symbol `getNodeStatusesQuery` is exported from `apps/temporal/src/workflows/graph-workflow-queries.ts` (US-135). The backend imports it from the temporal package barrel (`@ai-di/temporal/workflows/graph-workflow-queries` or via a shared types path — implementer's call; precedent in Phase 2 Track 3's similar cross-app imports).
- This endpoint is hot — the canvas polls every 1.5s. Performance budget: < 100ms per call. Temporal's `query` is in-memory on the worker, so latency is bounded by the network hop + Temporal frontend.
- After landing: no Vite restart needed (backend-only).
