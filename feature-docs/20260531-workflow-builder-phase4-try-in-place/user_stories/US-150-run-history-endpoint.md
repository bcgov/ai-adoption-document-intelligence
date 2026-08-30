# US-150: `GET /api/workflows/:id/runs` — run-history endpoint + `summariseInputCtx`

**As a** frontend `RunHistoryDrawer` listing past executions,
**I want** a REST endpoint sourced from Temporal's visibility store with cursor pagination + status/date filters, AND a small helper that produces a compact `inputCtxSummary` per run,
**So that** the drawer renders past runs without a sidecar `WorkflowRun` table and each row has enough context to be intelligible at a glance.

## Acceptance Criteria

- [x] **Scenario 1**: Endpoint route + query DTO
    - **Given** `apps/backend-services/src/workflows/workflow.controller.ts`
    - **When** read after the change
    - **Then** a new `@Get(":id/runs")` route accepts `@Query()` of type `ListRunsQueryDto { cursor?, limit?, status?, startedAfter?, startedBefore?, workflowVersionId? }`
    - **And** the DTO uses class-validator decorators: `@IsOptional() @IsString() cursor`, `@IsOptional() @IsInt() @Min(1) @Max(200) limit`, `@IsOptional() @IsIn(["running", "succeeded", "failed", "cancelled"]) status`, `@IsOptional() @IsDateString() startedAfter/startedBefore`, `@IsOptional() @IsString() workflowVersionId`
    - **And** `limit` defaults to 50

- [x] **Scenario 2**: Response shape + Swagger
    - **Given** the new route
    - **When** Swagger is regenerated
    - **Then** `ListRunsResponseDto { runs: RunSummaryDto[], nextCursor: string | null }` is declared with `@ApiProperty`
    - **And** `RunSummaryDto` has: `runId`, `workflowVersionId`, `versionNumber`, `status`, `startedAt`, `endedAt?`, `inputCtxSummary?` — all with `@ApiProperty` decorators
    - **And** the route declares `@ApiOkResponse({ type: ListRunsResponseDto })`, `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`

- [x] **Scenario 3**: Temporal visibility query translation
    - **Given** the handler
    - **When** it runs
    - **Then** it builds a Temporal visibility query string from the filters:
        - Base: `WorkflowLineageId = "<lineage>"`
        - `+ AND ExecutionStatus = "<status>"` when status filter set
        - `+ AND StartTime >= "<startedAfter>"` when set
        - `+ AND StartTime <= "<startedBefore>"` when set
        - `+ AND WorkflowVersionId = "<versionId>"` when set (search attribute already populated by `startGraphWorkflow`)
    - **And** the query is passed to `temporalClient.workflow.list({ query, pageSize: limit, nextPageToken: cursor })`
    - **And** results are mapped to `RunSummaryDto[]` + `nextCursor` from Temporal's `nextPageToken`

- [x] **Scenario 4**: `summariseInputCtx` helper
    - **Given** `apps/backend-services/src/workflows/run-history/summarise-input-ctx.ts` (new file)
    - **When** read
    - **Then** it exports `function summariseInputCtx(ctx: Record<string, unknown>): Record<string, unknown>`
    - **And** the helper returns the FIRST 4 top-level keys; string values truncated to 80 chars; Document-shaped values rendered as `"Document(<storage_key tail>)"`; nested objects/arrays rendered as `"{...}"` / `"[N items]"`
    - **And** the helper is pure — no I/O

- [x] **Scenario 5**: 400 on invalid date range
    - **Given** the endpoint called with `startedAfter > startedBefore`
    - **When** the handler runs
    - **Then** the existing NestJS `ValidationPipe` does NOT catch this (the dates are individually valid); a small business-rule check in the handler returns 400 with `{ message: "startedAfter must be before startedBefore" }`

- [x] **Scenario 6**: Controller spec covers happy + filter + pagination paths
    - **Given** the controller spec
    - **When** tests run
    - **Then** at least 5 cases pass: happy-path returns 50 most recent runs, status filter narrows results, date range narrows results, pagination cursor returns the next page, invalid date range returns 400
    - **And** the Temporal client is mocked with deterministic visibility responses

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflow.controller.ts` — add the new route
- `apps/backend-services/src/workflows/dtos/list-runs.dto.ts` — new DTOs (`ListRunsQueryDto`, `ListRunsResponseDto`, `RunSummaryDto`)
- `apps/backend-services/src/workflows/run-history/summarise-input-ctx.ts` — helper
- `apps/backend-services/src/workflows/run-history/summarise-input-ctx.spec.ts` — helper tests
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new tests

## Technical notes

- The Temporal `WorkflowVersionId` search attribute needs to be confirmed present in the existing `startGraphWorkflow` call. If not yet set, this story's scope expands to include adding it (small one-liner addition next to `WorkflowLineageId`). Verify before opening the PR.
- Temporal visibility queries use the "ElasticSearch Query Language" subset Temporal supports. Stick to AND combinations of supported attribute types (string, int, datetime). No JOINs, no FREE_TEXT.
- The endpoint does NOT need to hit Postgres — Temporal owns the data. This matches the production-scope decision (L5) without introducing a sidecar table.
- `inputCtxSummary` requires the workflow's input — which Temporal's `list` response doesn't include. The helper is called when building each `RunSummaryDto` via a separate `temporalClient.workflow.getHandle(runId).describe()` call. To bound cost, summary is built only for the FIRST page (or capped at 50); subsequent paginated requests omit `inputCtxSummary` and let the consumer (RunRow) fetch it lazily if needed.
- After landing: no Vite restart (backend-only).
