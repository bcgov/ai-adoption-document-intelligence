# US-057: `GET /api/workflows` accepts a `kind=workflow|library` query param + Swagger DTOs

**As a** frontend library-picker,
**I want** to fetch only library workflows from the backend,
**So that** the picker modal shows the right list and the regular
workflow list isn't polluted.

## Acceptance Criteria

- [ ] **Scenario 1**: Endpoint accepts the new query param
    - **Given** the backend running on http://localhost:3002
    - **When** a request is made to `GET /api/workflows?kind=library`
    - **Then** the response status is 200 and the body returns only workflows whose `workflow_kind = library`

- [ ] **Scenario 2**: `kind=workflow` maps to `workflow_kind = primary`
    - **Given** a `GET /api/workflows?kind=workflow` request
    - **When** the handler resolves the filter
    - **Then** the response returns only workflows whose `workflow_kind = primary` (the existing default — does NOT include `benchmark_candidate`)

- [ ] **Scenario 3**: Invalid `kind` returns 400
    - **Given** a `GET /api/workflows?kind=garbage` request
    - **When** the handler validates the param
    - **Then** the response is 400 with a clear error message describing the allowed values

- [ ] **Scenario 4**: Swagger documents the new param + DTO
    - **Given** the Swagger spec at `/api/docs` (or wherever the project exposes it)
    - **When** the spec is regenerated
    - **Then** the `kind` query param is documented with its enum values
    - **And** the response DTO carries `@ApiProperty` decorators (no plain `any`-typed shapes)

- [ ] **Scenario 5**: Unit test covers the filter path
    - **Given** `apps/backend-services/src/workflow/workflow.controller.spec.ts` (or service spec)
    - **When** a test invokes the list endpoint with `kind=library`
    - **Then** the service is called with the correct filter argument
    - **And** the response shape matches the new DTO

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/workflow/workflow.controller.ts` — add `@Query("kind") kind?: string` param + validation
- `apps/backend-services/src/workflow/workflow.service.ts` — accept the typed filter; map to Prisma query
- `apps/backend-services/src/workflow/dto/workflow-info.dto.ts` (or a new sibling) — add the query param DTO + `@ApiProperty` decorators
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — add test covering the filter
- `apps/backend-services/src/workflow/workflow.service.spec.ts` — add test covering the Prisma call shape
