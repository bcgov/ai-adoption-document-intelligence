# US-008: `GET /api/groups/:groupId/requests` Endpoint

**As a** group admin or system admin,
**I want to** retrieve membership requests for a group with optional status filtering,
**So that** I can review and act on outstanding or historical requests.

## Acceptance Criteria
- [ ] **Scenario 1**: Returns all requests for a group admin
    - **Given** a caller who is a group admin for the specified group
    - **When** `GET /api/groups/:groupId/requests` is called
    - **Then** a `200 OK` response is returned with all membership requests for the group

- [ ] **Scenario 2**: Returns `403` for a non-admin group member
    - **Given** a caller who is a member of the group but not a group admin or system admin
    - **When** `GET /api/groups/:groupId/requests` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 3**: Status filter returns only matching requests
    - **Given** a group with requests in various statuses
    - **When** `GET /api/groups/:groupId/requests?status=PENDING` is called
    - **Then** only requests with status `PENDING` are returned

- [ ] **Scenario 4**: System admin can access requests for any group
    - **Given** a caller who is a system admin
    - **When** `GET /api/groups/:groupId/requests` is called for any group
    - **Then** a `200 OK` response is returned with the requests

- [ ] **Scenario 5**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Decorate with JSDoc, `@ApiOperation`, `@ApiResponse`, `@ApiParam`.
- Supported status values: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`.
- Authorization: caller must have a `UserGroupRole` record with `role = 'group-admin'` for the group, or be a system admin.
