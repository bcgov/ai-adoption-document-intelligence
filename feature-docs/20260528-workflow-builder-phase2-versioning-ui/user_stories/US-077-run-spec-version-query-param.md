# US-077: Extend `GET /api/workflows/:id/run-spec` with optional `?workflowVersionId=` query param

**As a** Run-drawer author switching between workflow versions,
**I want** the run-spec endpoint to return the input schema for a
specific version when I ask for it,
**So that** the trigger URL / schema rows / sample curl / prefilled
JSON in the drawer all reflect the version the user is about to run
(not always head).

## Acceptance Criteria

- [x] **Scenario 1**: Endpoint accepts `?workflowVersionId=`
    - **Given** a valid lineage with multiple versions
    - **When** `GET /api/workflows/:id/run-spec?workflowVersionId=<v2id>` is called
    - **Then** the response is 200 with the `RunSpecResponseDto` shape
    - **And** `inputSchema` is derived from v2's config (NOT head's)
    - **And** `triggerUrl` and `authNotes` remain unchanged

- [x] **Scenario 2**: Omitting the query param preserves existing behaviour
    - **Given** the existing endpoint call sites
    - **When** `GET /api/workflows/:id/run-spec` is called without the new param
    - **Then** the response is 200 and the spec is derived from head (regression coverage for Track 2 behaviour)

- [x] **Scenario 3**: Unknown version id → 404
    - **Given** a query param `workflowVersionId` that doesn't exist
    - **When** the endpoint is called
    - **Then** the response is 404

- [x] **Scenario 4**: Version from a different lineage → 400
    - **Given** a query param `workflowVersionId` that exists but belongs to a different lineage
    - **When** the endpoint is called
    - **Then** the response is 400 with `"workflowVersionId does not belong to this workflow"`

- [x] **Scenario 5**: Swagger documents the query param
    - **Given** the controller method
    - **When** Swagger UI loads
    - **Then** the endpoint shows `@ApiQuery({ name: "workflowVersionId", required: false, description: ... })`
    - **And** `@ApiBadRequestResponse` is added describing the cross-lineage case

- [x] **Scenario 6**: Vitest + supertest coverage
    - **Given** the controller spec
    - **When** `npm test` runs
    - **Then** Scenarios 1–4 each have a corresponding test case

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/workflow/workflow.controller.ts` — add `@Query("workflowVersionId") workflowVersionId?: string` to `getRunSpec`, resolve via existing `resolveLineageAndVersion(id, workflowVersionId?)`, derive spec from `wf.config`
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — Scenarios 1–4

## Notes

- The pure helper `buildRunSpec(config, triggerUrl)` already takes a config rather than a version id, so no signature change needed there — the controller just feeds it the loaded version's `config`.
- `resolveLineageAndVersion` already handles "version belongs to lineage" validation for the `POST /runs` path. Reuse it here for consistency.
