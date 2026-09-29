# US-167: `GET list` + `GET detail` + `DELETE` dynamic-node endpoints

**As a** programmatic client + frontend management page,
**I want** to list a group's dynamic nodes, fetch one's full version history, and soft-delete a lineage via a single HTTP call each,
**So that** the `/dynamic-nodes` management page (US-180) and the Phase 7 agent both have full read + delete coverage of the lineage lifecycle.

## Acceptance Criteria

- [x] **Scenario 1**: `GET /api/dynamic-nodes` lists non-deleted lineages for the calling group
    - **Given** the controller from US-165/US-166
    - **When** the request is made with no query params
    - **Then** the response is 200 with body `{ items: DynamicNodeListItemDto[] }` where each item carries `{ slug, headVersion: { versionNumber, signature, publishedAt }, versionCount, usedInWorkflowCount }`
    - **And** soft-deleted lineages are excluded
    - **And** items are sorted by `slug` ascending
    - **And** `usedInWorkflowCount` is a simple `SELECT count(*) FROM workflow WHERE config::text LIKE '%"dyn.<slug>"%'`

- [x] **Scenario 2**: `GET /api/dynamic-nodes/:slug` returns full version history
    - **Given** a lineage with 3 versions
    - **When** the request is made
    - **Then** the response is 200 with body `{ slug, headVersion: { versionNumber, signature, publishedAt }, versions: DynamicNodeVersionDto[] }` where versions are sorted by `versionNumber` descending (newest first)
    - **And** each version carries `{ versionNumber, script, signature, allowNet, deterministic, publishedAt, publishedByUserId? }`
    - **And** a query param `?version=N` (optional) does NOT change the response shape but signals the caller's intent to focus on that version (used by US-179's view modal — informational only)

- [x] **Scenario 3**: `GET /api/dynamic-nodes/:slug` 404 on unknown / soft-deleted
    - **Given** no lineage with `slug` exists OR the lineage is soft-deleted
    - **When** the request is made
    - **Then** the response status is 404

- [x] **Scenario 4**: `DELETE /api/dynamic-nodes/:slug` soft-deletes idempotently
    - **Given** a non-deleted lineage `my-node`
    - **When** `DELETE` is called
    - **Then** the response status is 200 with body `{ slug: "my-node", deletedAt: "<ISO>", usedInWorkflowCount: N }`
    - **And** the row's `deletedAt` is set
    - **And** subsequent `GET /api/dynamic-nodes` excludes the row
    - **And** subsequent `GET /api/dynamic-nodes/my-node` returns 404
    - **And** calling `DELETE` again returns 200 with the existing `deletedAt` (idempotent)

- [x] **Scenario 5**: Full Swagger decorators on all three endpoints
    - **Given** Swagger metadata
    - **When** generated
    - **Then** `@Get()` has `@ApiOkResponse({ type: DynamicNodeListResponseDto })`
    - **And** `@Get(":slug")` has `@ApiOkResponse({ type: DynamicNodeDetailResponseDto })` + `@ApiNotFoundResponse()` + `@ApiQuery({ name: "version", type: Number, required: false })`
    - **And** `@Delete(":slug")` has `@ApiOkResponse({ type: DynamicNodeDeletedResponseDto })` + `@ApiNotFoundResponse()`
    - **All three:** `@ApiUnauthorizedResponse()`

- [x] **Scenario 6**: Controller tests cover all three endpoints
    - **Given** the controller test suite
    - **When** the suite runs
    - **Then** tests pass for: list excludes soft-deleted; list sorts by slug; detail returns full version history; detail 404 on unknown + soft-deleted; delete is idempotent; cross-group isolation (a key from group A cannot see/delete group B's dynamic nodes — returns 404)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts` — extend with three handlers
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-list-response.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-list-item.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-detail-response.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-version.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dto/dynamic-node-deleted-response.dto.ts` — new DTO
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts` — extend

## Technical notes

- `usedInWorkflowCount` is intentionally a LIKE query — accurate enough for a list column. A proper index/materialised view is filed for 6.x if listing performance becomes a problem.
- `DELETE` returns the `usedInWorkflowCount` alongside `deletedAt` so the frontend's confirm-modal (US-180 list view) can show "Used in N workflows" before the user confirms.
- This story closes Milestone B. After landing all of US-162 → US-167, the backend ships a complete CRUD surface for dynamic nodes.
- After landing: no Vite restart (backend-only). Milestone C is next.
