# US-079: `GET /api/workflows/:id/versions/:versionId` returns the full `WorkflowInfo` for a specific version

**As a** Compare-to-head modal needing to render two configs
side-by-side,
**I want** an endpoint that returns a specific version's full config
+ metadata,
**So that** the modal (and any future per-version detail surface) can
fetch on-demand without paying the config-payload cost on every
history-drawer load.

## Acceptance Criteria

- [ ] **Scenario 1**: Endpoint exists and returns the version's `WorkflowInfo`
    - **Given** a valid lineage `:id` and a `:versionId` belonging to that lineage
    - **When** `GET /api/workflows/:id/versions/:versionId` is called with a valid `x-api-key`
    - **Then** the response is 200 with `{ workflow: WorkflowInfo }` where `WorkflowInfo.workflowVersionId === :versionId`
    - **And** `WorkflowInfo.config` is the JSON config for that exact version

- [ ] **Scenario 2**: Unknown version id → 404
    - **Given** a `:versionId` that does not exist
    - **When** the endpoint is called
    - **Then** the response is 404

- [ ] **Scenario 3**: Version belongs to a different lineage → 404
    - **Given** a `:versionId` that exists but whose `lineageId !== :id`
    - **When** the endpoint is called
    - **Then** the response is 404 (404 preferred over 400 here — from the caller's perspective, the version isn't in this lineage's URL space)

- [ ] **Scenario 4**: Authorization
    - **Given** a missing `x-api-key`
    - **When** the endpoint is called
    - **Then** the response is 401
    - **And** when called by an identity that's not a member of the workflow's group, the response is 403

- [ ] **Scenario 5**: Full Swagger DTOs
    - **Given** the controller method
    - **When** Swagger UI loads
    - **Then** the endpoint shows `@ApiOkResponse({ type: WorkflowResponseDto })`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`
    - **And** `@ApiParam` decorators cover both `:id` and `:versionId`

- [ ] **Scenario 6**: Vitest + supertest coverage
    - **Given** the controller spec
    - **When** `npm test` runs
    - **Then** Scenarios 1–4 each have a corresponding test case

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/workflow/workflow.controller.ts` — add `@Get(":id/versions/:versionId") getVersion(...)`
- `apps/backend-services/src/workflow/workflow.service.ts` — extend (or thin-wrap) the existing `getWorkflowVersionById(versionId)` to return the cross-lineage check (or do that check in the controller)
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — Scenarios 1–4

## Notes

- `workflowService.getWorkflowVersionById` already exists but is currently unexposed; this story is the controller surface for it + cross-lineage validation.
- Frontend hook `useWorkflowVersion(lineageId, versionId)` is created as part of US-082 — this story is backend-only.
