# US-151: `GET /api/workflows/:id/runs/:runId/input-ctx` — replay re-run support

**As a** frontend "Re-run" button on an evicted-cache preview (US-155),
**I want** an endpoint that returns the full `initialCtx` for a historical run,
**So that** I can re-trigger a Try with the same input that produced the original run.

## Acceptance Criteria

- [x] **Scenario 1**: Endpoint route + auth
    - **Given** `apps/backend-services/src/workflows/workflow.controller.ts`
    - **When** read after the change
    - **Then** a new `@Get(":id/runs/:runId/input-ctx")` route exists
    - **And** the route inherits the existing per-workflow membership check

- [x] **Scenario 2**: Returns Temporal workflow input
    - **Given** a `runId` for a known run
    - **When** the endpoint is hit
    - **Then** it calls `temporalClient.workflow.getHandle(runId).describe()` to get the run's metadata including its input arguments
    - **And** extracts the `initialCtx` from the input arguments and returns it as `{ initialCtx: Record<string, unknown> }`

- [x] **Scenario 3**: Falls back to cache-row reconstruction when Temporal input is missing
    - **Given** a run whose Temporal input is unavailable (retention-cleaned, or payload not captured)
    - **When** the endpoint is hit
    - **Then** it falls back to looking up the source-node's cache row from the same time window (its `outputCtx` IS the `initialCtx` since source nodes are the workflow's edge)
    - **And** if both Temporal AND the cache row are missing, returns HTTP 404 with `{ message: "Input not available — run too old or never captured" }`

- [x] **Scenario 4**: 403 / 404 surface for cross-workflow / non-existent runs
    - **Given** a `runId` that exists but belongs to a different workflow lineage
    - **When** the endpoint is hit
    - **Then** the per-workflow membership guard passes the workflow check but a secondary check on `WorkflowLineageId` returns 403 `"Run does not belong to this workflow"`
    - **And** a completely-unknown `runId` returns 404

- [x] **Scenario 5**: Full Swagger documentation
    - **Given** the new route
    - **When** Swagger is regenerated
    - **Then** the endpoint declares `@ApiOperation`, `@ApiOkResponse({ type: InputCtxResponseDto })`, `@ApiNotFoundResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`
    - **And** `InputCtxResponseDto { initialCtx: Record<string, unknown> }` is declared with `@ApiProperty`

- [x] **Scenario 6**: Controller spec covers all paths
    - **Given** the controller spec
    - **When** tests run
    - **Then** at least 4 cases pass: happy-path returns Temporal input, fallback to cache-row works, 403 on cross-lineage runId, 404 on unknown runId

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflow.controller.ts` — add the new route
- `apps/backend-services/src/workflows/dtos/input-ctx-response.dto.ts` — new DTO
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new tests

## Technical notes

- Temporal's `describe()` returns `WorkflowExecutionDescription` which includes the workflow's start arguments. The exact path to `initialCtx` depends on `startGraphWorkflow`'s argument shape (one positional argument carrying `{ workflowId, initialCtx, ... }`).
- For source.upload workflows, `initialCtx` includes the uploaded blob's URL — re-running with the same `initialCtx` re-attaches to the same uploaded content (cache-hit on the source-node's row).
- This endpoint is rarely hit (only when the user explicitly clicks "Re-run" on an evicted preview), so performance budget is generous (< 500ms).
- After landing: no Vite restart (backend-only).
