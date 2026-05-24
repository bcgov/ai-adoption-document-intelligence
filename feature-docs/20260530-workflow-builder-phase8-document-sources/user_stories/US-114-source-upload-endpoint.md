# US-114: `POST /api/workflows/:id/sources/:sourceNodeId/upload` — multipart upload endpoint

**As a** Run-drawer Dropzone widget,
**I want** a dedicated endpoint that accepts a multipart file upload and returns a ctx-keyed URL,
**So that** the frontend can chain upload → `/runs` cleanly and the workflow's source.upload node has a backend it can call.

## Acceptance Criteria

- [ ] **Scenario 1**: Happy-path upload returns ctxKey-keyed response
    - **Given** a workflow with a `source.upload` node configured `{ ctxKey: "myFile", allowedMimeTypes: ["application/pdf"], maxFileSizeMB: 25 }`
    - **When** a client POSTs `multipart/form-data` with a single `file` part containing a 1MB PDF to `/api/workflows/:id/sources/:sourceNodeId/upload`
    - **Then** the backend streams the file to blob storage (reusing the existing per-org blob bucket convention) and returns 200 with body `{ "myFile": "<blob URL or signed URL>" }`
    - **And** the response shape matches the existing OCR pipeline's signed-URL / blob-key convention (same shape as `documentUrl` produced elsewhere in the system)

- [ ] **Scenario 2**: 404 on unknown workflow / source node
    - **Given** the same endpoint
    - **When** the workflow id does not exist OR the sourceNodeId does not resolve to a node within the workflow's `config.nodes`
    - **Then** the backend returns 404 with a clear error message naming which lookup failed (workflow vs source node)
    - **And** the existing test patterns for "unknown workflow id" cover this

- [ ] **Scenario 3**: 400 on wrong source subtype
    - **Given** the same endpoint
    - **When** the resolved node exists but its `sourceType` is NOT `source.upload` (e.g. `source.api`)
    - **Then** the backend returns 400 with message `"Node \`<id>\` is not a source.upload (got \`<sourceType>\`)"`

- [ ] **Scenario 4**: 400 on MIME mismatch
    - **Given** a source.upload configured `{ allowedMimeTypes: ["application/pdf"] }`
    - **When** a client uploads an `image/png` file
    - **Then** the backend returns 400 with a clear error naming the rejected MIME and the allowlist

- [ ] **Scenario 5**: 413 (or 400) on oversized file
    - **Given** a source.upload configured `{ maxFileSizeMB: 5 }`
    - **When** a client uploads a 10MB file
    - **Then** the backend returns 413 Payload Too Large (or 400 if the existing project convention prefers — pick what existing endpoints use and document the choice) with a clear error naming the limit + the received size

- [ ] **Scenario 6**: Endpoint is upload-only — does NOT trigger workflow execution
    - **Given** a successful upload (Scenario 1)
    - **When** the response returns
    - **Then** no Temporal workflow has been started; no audit-log entry suggesting a run was triggered
    - **And** the integration test asserts no `startGraphWorkflow` mock invocation occurred during the upload call (separately, an explicit `POST /runs` chain test asserts the FRONTEND chains them — but the endpoints stay decoupled on the backend)

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/workflow.controller.ts` — new `POST :id/sources/:sourceNodeId/upload` handler with `@UseInterceptors(FileInterceptor("file"))`
- `apps/backend-services/src/workflow/source-upload.service.ts` — new service (or static helper on an existing service) for the multipart-stream-to-blob concern; reuses the existing blob service
- `apps/backend-services/src/workflow/dto/source-upload.dto.ts` — new `SourceUploadResponseDto` (uses `additionalProperties: { type: "string" }` in Swagger since the response key is dynamic — `@ApiExtraModels` + a hand-crafted `@ApiResponse` schema where needed)
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` (or matching integration test) — Scenarios 1–6

## Technical notes

- Full Swagger decorators per CLAUDE.md: `@ApiOperation`, `@ApiOkResponse({ description, schema: { type: "object", additionalProperties: { type: "string" } } })`, `@ApiNotFoundResponse`, `@ApiBadRequestResponse`, `@ApiPayloadTooLargeResponse` (if used), `@ApiConsumes("multipart/form-data")`.
- Auth: inherits the existing `x-api-key` guard. No new auth surface.
- Streaming: reuse the existing blob upload path (whichever service `apps/backend-services` already exposes for OCR's blob handling). Do NOT introduce a new blob-storage abstraction.
- The response key being dynamic (from `source.parameters.ctxKey`) means the Swagger schema can't enumerate the property name. Use `additionalProperties: { type: "string" }` per OpenAPI 3.0 to express "object with one string-valued property of unspecified key".
- 413 vs 400 for oversized files: check what `apps/backend-services` already does elsewhere. If no precedent, use 413 (correct per RFC 7231) and emit a clear body explaining the limit.
- The endpoint accepts BOTH `workflowVersionId` as a query param AND the version selection from the resolved source's config — but since source.upload's parameters are version-pinned, the upload endpoint can ignore version selection for 8.0 (always uses head). If a workflow is pinned, the run-spec endpoint returns the head-source's upload URL; revisit in Phase 8.x if version-pinned uploads become a need.
