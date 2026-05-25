# US-146: `cancelInFlightTriesForLineage` helper + `POST /sources/:id/upload` extension

**As a** backend handler kicking off an in-canvas Try,
**I want** (a) a helper that cancels any in-flight Try for the workflow's lineage, AND (b) the existing source-upload endpoint to immediately start a Temporal run and return the resulting `runId` + `workflowVersionId`,
**So that** the frontend can chain upload → run with one network round-trip and the cancel-on-new-Try semantics are enforced server-side.

## Acceptance Criteria

- [ ] **Scenario 1**: `cancelInFlightTriesForLineage` helper
    - **Given** `apps/backend-services/src/workflows/workflows.service.ts`
    - **When** read after the change
    - **Then** it exposes `async cancelInFlightTriesForLineage(workflowLineageId: string): Promise<{ cancelledCount: number }>`
    - **And** the method queries Temporal's visibility for `WorkflowLineageId = workflowLineageId AND ExecutionStatus = Running`
    - **And** calls `.cancel()` on each returned handle (errors on already-completed runs are caught + ignored — race tolerant)

- [ ] **Scenario 2**: Helper is idempotent
    - **Given** the helper
    - **When** called for a lineage with no in-flight runs
    - **Then** it returns `{ cancelledCount: 0 }` without throwing
    - **And** subsequent calls are also no-ops

- [ ] **Scenario 3**: `POST /sources/:id/upload` extends response with `runId` + `workflowVersionId`
    - **Given** the existing Phase 8 endpoint
    - **When** read after the change
    - **Then** after the upload commits to blob storage, the handler:
        1. Calls `cancelInFlightTriesForLineage(workflowLineageId)`
        2. Calls `TemporalClientService.startGraphWorkflow({ workflowId, initialCtx: { [ctxKey]: ctxValue } })`
        3. Returns `{ [ctxKey]: ctxValue, runId, workflowVersionId }` (the new fields alongside the existing dynamic ctxKey-keyed response)
    - **And** `workflowVersionId` is read from the existing `resolveLineageAndVersion` helper (Phase 2 Track 3) so head + pinned versions both work

- [ ] **Scenario 4**: Source-upload cache row written at workflow start
    - **Given** the workflow start path (Temporal worker — extends US-133 Scenario 3)
    - **When** the worker handles the source-merge step
    - **Then** it writes a cache row for the source-upload node per L16: `inputHash = sha256(stableJson({ uploadedContentHash }))` where `uploadedContentHash` is computed from the blob's storage key
    - **And** `outputCtx = { [ctxKey]: blobUrl }` matches what the worker would set anyway

- [ ] **Scenario 5**: DTO + Swagger updated
    - **Given** the existing `SourceUploadResponseDto` (Phase 8)
    - **When** read after the change
    - **Then** it declares two new properties: `runId: string` and `workflowVersionId: string` with `@ApiProperty` decorators
    - **And** all 4xx response decorators carry over from Phase 8

- [ ] **Scenario 6**: Tests cover cancel + new response shape
    - **Given** `apps/backend-services/src/workflows/workflows.service.spec.ts` (extended) + the controller spec
    - **When** tests run
    - **Then** at least 4 cases pass: cancel helper hits + cancels a running run, cancel helper no-ops on empty lineage, upload + start-run returns `{ ..., runId, workflowVersionId }`, upload triggers `cancelInFlightTriesForLineage` BEFORE `startGraphWorkflow`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/workflows.service.ts` — add `cancelInFlightTriesForLineage`
- `apps/backend-services/src/workflows/workflow.controller.ts` — extend upload handler
- `apps/backend-services/src/workflows/dtos/source-upload-response.dto.ts` — add `runId` + `workflowVersionId`
- `apps/backend-services/src/workflows/workflows.service.spec.ts` — new tests
- `apps/backend-services/src/workflows/workflow.controller.spec.ts` — new tests

## Technical notes

- Temporal visibility query language: `WorkflowLineageId = "<lineage>" AND ExecutionStatus = "Running"`. The `WorkflowLineageId` search attribute is already set by `startGraphWorkflow` (Phase 2 Track 2).
- `.cancel()` returns a promise that resolves when the cancellation is acknowledged by Temporal — the helper awaits all cancellations in parallel via `Promise.allSettled` so one stuck cancel doesn't block the others.
- The cache row for source-upload is written FROM THE WORKFLOW (US-133 Scenario 3), not from the upload endpoint. The endpoint just kicks off the workflow; the workflow's ctx-merge step writes the cache row in the same code path as for any source node.
- After landing: no Vite restart (backend-only).
