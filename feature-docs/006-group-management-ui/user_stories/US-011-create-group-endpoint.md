# US-011: `POST /api/groups` — Create Group (System Admin Only)

**As a** system admin,
**I want to** create a new group via API,
**So that** new groups can be provisioned through the UI without direct database access.

## Acceptance Criteria
- [ ] **Scenario 1**: System admin creates a group successfully
    - **Given** a caller who is a system admin and a unique group name
    - **When** `POST /api/groups` is called with `{ name, description? }`
    - **Then** a `201 Created` response is returned with the new group record including `id`, `name`, and `description`

- [ ] **Scenario 2**: Returns `409` for a duplicate group name
    - **Given** a group with the given name already exists
    - **When** `POST /api/groups` is called with the same name
    - **Then** a `409 Conflict` (or `400 Bad Request`) response is returned with a descriptive error message

- [ ] **Scenario 3**: Returns `403` for non-system-admin callers
    - **Given** a caller who is not a system admin
    - **When** `POST /api/groups` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 4**: `name` is required
    - **Given** a request body without a `name` field
    - **When** `POST /api/groups` is called
    - **Then** a `400 Bad Request` response is returned

- [ ] **Scenario 5**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- If a `POST /api/groups` endpoint already exists, verify it enforces `isUserSystemAdmin` and update accordingly.
- Use a DTO class for the request body; decorate with JSDoc, `@ApiOperation`, `@ApiResponse`.
- Authorization via `DatabaseService.isUserSystemAdmin`.
