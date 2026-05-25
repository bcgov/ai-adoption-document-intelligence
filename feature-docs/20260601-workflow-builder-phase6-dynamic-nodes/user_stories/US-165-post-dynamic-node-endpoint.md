# US-165: `POST /api/dynamic-nodes` endpoint + full Swagger DTOs

**As a** programmatic client (Phase 7 agent OR human via the editor),
**I want** to create a brand-new dynamic-node lineage via a single HTTP call with a script payload,
**So that** publishing a new custom node is one API call + the structured response carries either the persisted v1 metadata OR a precise `ParseError[]` for the agent's revision loop.

## Acceptance Criteria

- [ ] **Scenario 1**: New `POST /api/dynamic-nodes` endpoint declared
    - **Given** `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts`
    - **When** the file is read after the change
    - **Then** it declares `@Post() create(@Body() dto: CreateDynamicNodeRequestDto, @Req() req)` that delegates to `dynamicNodesService.publish({ groupId: req.group.id, script: dto.script, mode: "create", actorUserId: req.user?.id })`
    - **And** the controller is `@Controller("dynamic-nodes")` + module is registered in `AppModule`

- [ ] **Scenario 2**: Request DTO with full `@ApiProperty` decorators
    - **Given** `apps/backend-services/src/dynamic-nodes/dto/create-dynamic-node-request.dto.ts`
    - **When** read
    - **Then** `CreateDynamicNodeRequestDto` has one property `script: string` with `@ApiProperty({ description: "TypeScript source with JSDoc signature header", example: "/** @workflow-node @name my-node ... */ export default async function() {...}" })`
    - **And** the script is `@IsString()` + `@IsNotEmpty()` + `@MaxLength(100_000)`

- [ ] **Scenario 3**: Response DTOs + endpoint-level Swagger decorators
    - **Given** the controller method
    - **When** Swagger metadata is generated
    - **Then** the endpoint carries `@ApiOkResponse({ status: 201, type: DynamicNodePublishResponseDto })`, `@ApiBadRequestResponse({ type: PublishErrorsResponseDto })`, `@ApiConflictResponse({ description: "Slug already exists for this group" })`, `@ApiUnauthorizedResponse()`
    - **And** `DynamicNodePublishResponseDto` carries `slug: string`, `version: number`, `signature: DynamicNodeSignatureDto`, `errors: ParseErrorDto[]`
    - **And** `PublishErrorsResponseDto` carries `errors: ParseErrorDto[]`

- [ ] **Scenario 4**: 201 on success — body matches success DTO
    - **Given** a valid script that passes all four stages
    - **When** the request is made
    - **Then** the response status is 201 with body `{ slug: "<from-@name>", version: 1, signature: { ... }, errors: [] }`
    - **And** subsequent `GET /api/activity-catalog` (US-173 surface) includes a `dyn.<slug>` entry

- [ ] **Scenario 5**: 400 on validation failures — body carries structured errors
    - **Given** a script that fails the ts-check stage
    - **When** the request is made
    - **Then** the response status is 400 with body `{ errors: [{ stage: "ts-check", line, column, message }] }`
    - **And** the lineage is NOT created (subsequent `GET /api/dynamic-nodes/:slug` returns 404)

- [ ] **Scenario 6**: 409 on duplicate slug
    - **Given** a lineage with slug `my-node` already exists for this group
    - **When** another `POST` with `@name my-node` is made
    - **Then** the response status is 409
    - **And** the existing lineage is unchanged

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts` — new file (or extend if already created by US-163)
- `apps/backend-services/src/dynamic-nodes/dto/create-dynamic-node-request.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-publish-response.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/publish-errors-response.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/parse-error.dto.ts` — new DTO mirroring the shared `ParseError`
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-signature.dto.ts` — new DTO mirroring `DynamicNodeSignature`
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts` — new tests

## Technical notes

- Per CLAUDE.md, ALL controllers must have full Swagger — use specific response decorators, NOT the generic `@ApiResponse`. Dedicated DTO classes with `@ApiProperty` decorators are mandatory.
- The controller uses the existing `x-api-key` middleware + group-scoping (the request's `group.id` is set by middleware before the handler runs — same pattern as `WorkflowController`).
- Status code 201 for create — match the existing project convention for resource-creation POSTs.
- After landing: no Vite restart (backend-only).
