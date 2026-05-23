# US-067: `GET /api/workflows/:id/run-spec` returns `{ triggerUrl, inputSchema, authNotes, sampleCurl }`

**As a** workflow author or API consumer,
**I want** a single endpoint that documents how to trigger a workflow
(URL, expected input schema, sample curl, auth notes),
**So that** I can copy the call into my code, share it with a teammate,
or feed it directly to a UI that renders the panel.

## Acceptance Criteria

- [ ] **Scenario 1**: Endpoint exists at `GET /api/workflows/:id/run-spec`
    - **Given** a valid `WorkflowLineage.id` and `x-api-key`
    - **When** `GET /api/workflows/:id/run-spec` is called
    - **Then** a 200 response is returned with `{ triggerUrl, inputSchema, authNotes, sampleCurl }`
    - **And** `triggerUrl` is an absolute URL ending in `/api/workflows/:id/runs`, derived from the request's `Host` + `X-Forwarded-Proto` (or `http://localhost:3002` in local dev)
    - **And** `authNotes` is a short string (1-2 sentences) explaining the `x-api-key` header
    - **And** `sampleCurl` is a ready-to-run curl invocation including the `x-api-key` header placeholder + a stub JSON body matching the input schema

- [ ] **Scenario 2**: Unknown workflow id → 404
    - **Given** a `WorkflowLineage.id` that does not exist
    - **When** `GET /api/workflows/:id/run-spec` is called
    - **Then** a 404 is returned with a clear `message`

- [ ] **Scenario 3**: Workflow with no published version → 409 (or 200 with empty schema; pick one)
    - **Given** a `WorkflowLineage` that has no `WorkflowVersion` rows yet (`head_version_id` null)
    - **When** the endpoint is called
    - **Then** the response is 409 with a message like `"Workflow has no published version yet"`
    - **And** no Temporal interaction occurs

- [ ] **Scenario 4**: Auth required
    - **Given** no `x-api-key` header (and no IDIR session)
    - **When** the endpoint is called
    - **Then** a 401 is returned

- [ ] **Scenario 5**: Full Swagger DTOs
    - **Given** the controller method
    - **When** Swagger UI loads `http://localhost:3002/api/docs`
    - **Then** the endpoint shows specific decorators (`@ApiOkResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`, `@ApiUnauthorizedResponse`) with dedicated response DTOs
    - **And** every DTO field has an `@ApiProperty` decorator with `description` + `example`

- [ ] **Scenario 6**: Vitest + supertest coverage
    - **Given** the controller test file
    - **When** `npm test` runs in `apps/backend-services`
    - **Then** the happy path, the 404, the 409, and the 401 are all covered

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/workflow.controller.ts` — add the new endpoint method
- `apps/backend-services/src/workflow/workflow.service.ts` — add `getRunSpec(workflowId, requestUrl)` that loads the lineage + its head version, calls the schema-derivation helper (US-068), assembles the response
- `apps/backend-services/src/workflow/dto/run-spec.dto.ts` — `RunSpecResponseDto` with the 4 fields
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — add the new test cases

## Notes

- The schema-derivation logic is split into US-068 so it can be implemented test-first (pure function, no Nest scaffolding required).
- The trigger URL helper should be a small pure function `buildTriggerUrl(request, workflowId)` exported for testability.
