# US-012: `PUT /api/groups/:groupId` — Update Group (System Admin Only)

**As a** system admin,
**I want to** update a group's name and description via API,
**So that** group details can be corrected or updated through the UI.

## Acceptance Criteria
- [ ] **Scenario 1**: System admin updates a group successfully
    - **Given** a caller who is a system admin and an existing active group
    - **When** `PUT /api/groups/:groupId` is called with `{ name, description? }`
    - **Then** a `200 OK` response is returned with the updated group record

- [ ] **Scenario 2**: Returns `404` for a non-existent or soft-deleted group
    - **Given** a `groupId` that does not exist or has `deleted_at` set
    - **When** `PUT /api/groups/:groupId` is called
    - **Then** a `404 Not Found` response is returned

- [ ] **Scenario 3**: Returns `409` for a duplicate name
    - **Given** the new `name` is already used by another group
    - **When** `PUT /api/groups/:groupId` is called
    - **Then** a `409 Conflict` (or `400 Bad Request`) response is returned

- [ ] **Scenario 4**: Returns `403` for non-system-admin callers
    - **Given** a caller who is not a system admin
    - **When** `PUT /api/groups/:groupId` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 5**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use a DTO class for the request body; decorate with JSDoc, `@ApiOperation`, `@ApiResponse`, `@ApiParam`.
- Authorization via `DatabaseService.isUserSystemAdmin`.
- Only `name` and `description` are editable through this endpoint.
