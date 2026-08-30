# US-166: `PUT /api/dynamic-nodes/:slug` endpoint (publish new version)

**As a** programmatic client (Phase 7 agent OR human via the editor),
**I want** to publish a new version of an existing dynamic-node lineage via a single HTTP call,
**So that** revising a script is one API call + the response carries the new version number for the agent's loop to read back.

## Acceptance Criteria

- [x] **Scenario 1**: New `PUT /api/dynamic-nodes/:slug` endpoint declared
    - **Given** the same controller from US-165
    - **When** the file is read after the change
    - **Then** it declares `@Put(":slug") update(@Param("slug") slug, @Body() dto: UpdateDynamicNodeRequestDto, @Req() req)` that delegates to `dynamicNodesService.publish({ groupId, slug, script: dto.script, mode: "update", actorUserId })`

- [x] **Scenario 2**: 200 on success — body carries the new version number
    - **Given** an existing lineage `my-node` at version 3, and a valid script with `@name my-node`
    - **When** the request is made
    - **Then** the response status is 200 with body `{ slug: "my-node", version: 4, signature: { ... }, errors: [] }`
    - **And** the lineage's `headVersionId` now points at v4
    - **And** v1 / v2 / v3 rows are still in `dynamic_node_version` (only the pointer moved)

- [x] **Scenario 3**: 404 on unknown or soft-deleted slug
    - **Given** no lineage with slug `unknown-node` exists for this group, OR the lineage exists but is soft-deleted
    - **When** the request is made
    - **Then** the response status is 404 (`@ApiNotFoundResponse()`)
    - **And** no version is persisted

- [x] **Scenario 4**: 409 on `@name` differing from path slug
    - **Given** `PUT /api/dynamic-nodes/my-node` with a request body whose script declares `@name different-node`
    - **When** the request is made
    - **Then** the response status is 409 with body `{ code: "NAME_MISMATCH", pathSlug: "my-node", scriptName: "different-node" }`
    - **And** no version is persisted

- [x] **Scenario 5**: 400 on validation failure — same structured `errors` as US-165
    - **Given** a script with a ts-check error
    - **When** the request is made
    - **Then** the response status is 400 with body `{ errors: [{ stage: "ts-check", line, column, message }] }`
    - **And** the lineage's head pointer is unchanged

- [x] **Scenario 6**: Full Swagger decorators on the endpoint
    - **Given** Swagger metadata
    - **When** generated
    - **Then** the endpoint carries `@ApiOkResponse({ type: DynamicNodePublishResponseDto })`, `@ApiBadRequestResponse({ type: PublishErrorsResponseDto })`, `@ApiNotFoundResponse()`, `@ApiConflictResponse({ description: "Name mismatch between path slug and script @name" })`, `@ApiUnauthorizedResponse()`
    - **And** `UpdateDynamicNodeRequestDto` carries the same `script: string` shape as `CreateDynamicNodeRequestDto` (could share via inheritance or a common base class)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts` — extend with the PUT handler
- `apps/backend-services/src/dynamic-nodes/dto/update-dynamic-node-request.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts` — extend with PUT scenarios

## Technical notes

- The name-mismatch check happens at the service layer (or in the controller after parsing) — compare `slug` from `@Param` against `signature.name` from the parser output. Surface as `ConflictException` with the structured code.
- 404 for soft-deleted lineages preserves the "404 vs 403 doesn't leak existence" property (matches the pattern in US-165 — `findBySlugForGroup` returns null for soft-deleted).
- After landing: no Vite restart (backend-only).
