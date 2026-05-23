# US-069: `POST /api/workflows/:id/runs` triggers a workflow run via the refactored temporal client

**As a** workflow author or API consumer with an `x-api-key`,
**I want** to POST a JSON payload to a single endpoint to start a
workflow execution,
**So that** I can run workflows from the Run drawer, from curl, or
from any external system without going through the document-OCR
pathway.

## Acceptance Criteria

- [ ] **Scenario 1**: Endpoint exists at `POST /api/workflows/:id/runs`
    - **Given** a valid `WorkflowLineage.id` + `x-api-key`
    - **When** `POST /api/workflows/:id/runs` is called with body `{ initialCtx: { ... } }`
    - **Then** the response is 201 with `{ workflowId: string, workflowVersionId: string, status: "started" }`
    - **And** `workflowId` is the Temporal workflow execution id returned by `TemporalClientService.startGraphWorkflow()`
    - **And** `workflowVersionId` is the resolved version (head if the body omitted it)

- [ ] **Scenario 2**: Optional `workflowVersionId` in the body
    - **Given** a body with an explicit `workflowVersionId` that belongs to this lineage
    - **When** the endpoint runs
    - **Then** that specific version's `config` is used to start the run
    - **And** the response's `workflowVersionId` echoes the body's value

- [ ] **Scenario 3**: `workflowVersionId` from a different lineage → 400
    - **Given** a body with a `workflowVersionId` that exists but belongs to a different lineage
    - **When** the endpoint runs
    - **Then** the response is 400 with a clear message (e.g. `"workflowVersionId does not belong to this workflow"`)

- [ ] **Scenario 4**: Unknown lineage id → 404
    - **Given** a `:id` that does not resolve to a `WorkflowLineage`
    - **When** the endpoint is called
    - **Then** the response is 404

- [ ] **Scenario 5**: Lineage with no published version → 409
    - **Given** a lineage where `head_version_id` is null and the body omits `workflowVersionId`
    - **When** the endpoint is called
    - **Then** the response is 409 with `"Workflow has no published version yet"`

- [ ] **Scenario 6**: Input validation against the derived schema
    - **Given** a body whose `initialCtx` violates the schema returned by `deriveInputSchema(config)` (missing required field OR a value of the wrong primitive type — e.g. `customerId: 123` for a `string` declaration)
    - **When** the endpoint is called
    - **Then** the response is 400 with a `message` listing the failing fields
    - **And** no Temporal interaction occurs

- [ ] **Scenario 7**: Auth required
    - **Given** no `x-api-key`
    - **When** the endpoint is called
    - **Then** a 401 is returned

- [ ] **Scenario 8**: Calls the refactored temporal client correctly
    - **Given** a mocked `TemporalClientService.startGraphWorkflow`
    - **When** the endpoint runs with body `{ initialCtx: { foo: "bar" } }`
    - **Then** the mock is called with `documentId === undefined`, `workflowConfigId === <resolvedVersionId>`, `initialCtx === { foo: "bar" }`, `groupId === <lineage.group_id>`
    - **And** no doc-specific seed keys appear in the args

- [ ] **Scenario 9**: Logging
    - **Given** a successful run
    - **When** the request completes
    - **Then** an info-level log line is emitted containing `{ workflowId, lineageId, versionId, ctxKeys }` (NOT the raw `initialCtx` values — avoid leaking PII)

- [ ] **Scenario 10**: Full Swagger DTOs
    - **Given** the controller method
    - **When** Swagger UI loads
    - **Then** the endpoint shows specific decorators (`@ApiCreatedResponse`, `@ApiBadRequestResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`, `@ApiUnauthorizedResponse`) with dedicated request + response DTOs

- [ ] **Scenario 11**: Vitest + supertest coverage
    - **Given** the controller spec
    - **When** `npm test` runs
    - **Then** Scenarios 1–9 each have a corresponding test case

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/workflow.controller.ts` — add the new POST endpoint
- `apps/backend-services/src/workflow/workflow.service.ts` — add `startRun(workflowId, body)` that loads lineage, resolves version, validates `initialCtx`, calls `TemporalClientService.startGraphWorkflow`
- `apps/backend-services/src/workflow/dto/start-run.dto.ts` — `StartRunRequestDto` + `StartRunResponseDto`
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — Scenarios 1–9 as test cases

## Notes

- The input-validation step (Scenario 6) reuses `deriveInputSchema(config)` from US-068 + a minimal walker (no need to import Ajv): for each `required` key, assert presence; for each provided key with a matching property, assert its JS `typeof` matches the schema's `type` ("string" / "number" / "boolean" / "object" / "array").
- For backward compatibility with the OCR path, do NOT change `TemporalClientService.startGraphWorkflow`'s callsite in `OcrService`; the refactor in US-066 keeps that callsite working unchanged.
