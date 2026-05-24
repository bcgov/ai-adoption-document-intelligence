# US-112: `GET /run-spec` `uploadSpec?` extension for `source.upload`

**As a** Run-drawer consumer,
**I want** `/run-spec` to surface upload-source metadata when a `source.upload` node exists,
**So that** the frontend can render the Dropzone widget with the right MIME / size constraints and the right upload URL without inferring them.

## Acceptance Criteria

- [ ] **Scenario 1**: `uploadSpec` populated when `source.upload` present
    - **Given** a workflow with a `source.upload` node configured `{ ctxKey: "myFile", allowedMimeTypes: ["application/pdf"], maxFileSizeMB: 25 }`
    - **When** `GET /api/workflows/:id/run-spec` is called
    - **Then** the response contains `uploadSpec: { sourceNodeId: "<id>", uploadUrl: "<absolute trigger URL>/sources/<id>/upload", allowedMimeTypes: ["application/pdf"], maxFileSizeMB: 25, ctxKey: "myFile" }`
    - **And** defaults are filled in when the source omits them (`allowedMimeTypes: ["application/pdf", "image/*"]`, `maxFileSizeMB: 50`, `ctxKey: "documentUrl"`)

- [ ] **Scenario 2**: `uploadSpec` absent when no `source.upload`
    - **Given** a workflow with no source.upload node (legacy or source.api-only)
    - **When** `GET /run-spec` is called
    - **Then** the `uploadSpec` field is omitted from the response (not `null`, not present-with-undefined — absent)
    - **And** the existing Phase 2 Track 2 response shape is unchanged for clients that don't know about the new field

- [ ] **Scenario 3**: Both `inputSchema` AND `uploadSpec` populated when both source nodes present
    - **Given** a workflow with both a source.api AND a source.upload
    - **When** `GET /run-spec` is called
    - **Then** `inputSchema` is derived from source.api per US-111 precedence
    - **And** `uploadSpec` is populated from source.upload
    - **And** both fields coexist in the response

- [ ] **Scenario 4**: `RunSpecResponseDto` extended with full Swagger decorators
    - **Given** the existing `RunSpecResponseDto` in `apps/backend-services/src/workflow/dto/run-spec.dto.ts`
    - **When** the DTO is read after the change
    - **Then** a new optional `uploadSpec?` field is decorated with `@ApiPropertyOptional({ type: () => UploadSpecDto })` plus class-validator `@IsOptional()` + `@ValidateNested()` + `@Type(() => UploadSpecDto)`
    - **And** a new `UploadSpecDto` class with `@ApiProperty` decorators for each field (sourceNodeId, uploadUrl, allowedMimeTypes, maxFileSizeMB, ctxKey) is added

- [ ] **Scenario 5**: Integration tests cover the three cases
    - **Given** `apps/backend-services/src/workflow/workflow.controller.spec.ts` (or sibling test file)
    - **When** new test cases for Scenarios 1, 2, 3 are added
    - **Then** each asserts the exact response shape via supertest against the running NestJS app
    - **And** the existing controller tests still pass

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/build-run-spec.ts` — add `buildUploadSpec(config, baseUrl)` helper (returns `UploadSpec | undefined`)
- `apps/backend-services/src/workflow/build-run-spec.test.ts` — unit tests for `buildUploadSpec` (defaults filled in, absent when no source.upload)
- `apps/backend-services/src/workflow/dto/run-spec.dto.ts` — add `UploadSpecDto` class + extend `RunSpecResponseDto.uploadSpec?`
- `apps/backend-services/src/workflow/workflow.controller.ts` — wire `buildUploadSpec` into the `GET /run-spec` handler
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` (or matching test) — integration tests

## Technical notes

- The `uploadUrl` is absolute, built from `buildTriggerUrl(req)` (the existing Phase 2 Track 2 helper) + the new path `/sources/<sourceNodeId>/upload`. Reuse the helper — don't compute the base URL inline.
- "Defaults filled in" means the response uses the source's `parametersSchema` defaults from US-116 when the saved parameters omit a field. The catalog entry is the source of truth for defaults.
- Per CLAUDE.md, all backend controllers must have full Swagger documentation. `UploadSpecDto` is a new DTO class — full `@ApiProperty` on every field including the array (`type: [String]` for `allowedMimeTypes`).
- This story does NOT add the `POST /sources/:id/upload` endpoint itself — that's US-114. This story extends `/run-spec` only.
