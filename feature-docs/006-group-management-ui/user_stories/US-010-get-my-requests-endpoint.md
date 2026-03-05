# US-010: `GET /api/groups/requests/mine` Endpoint

**As an** authenticated user,
**I want to** retrieve all of my own membership requests across all groups,
**So that** I can review the history and status of my requests.

## Acceptance Criteria
- [x] **Scenario 1**: Returns all requests for the authenticated user
    - **Given** a caller with one or more membership requests across various groups
    - **When** `GET /api/groups/requests/mine` is called
    - **Then** a `200 OK` response is returned with all requests belonging to the caller, including `groupId`, `groupName`, `status`, `createdAt`, and `reason` fields

- [x] **Scenario 2**: Returns empty array when no requests exist
    - **Given** a caller with no membership requests
    - **When** `GET /api/groups/requests/mine` is called
    - **Then** a `200 OK` response is returned with an empty array

- [x] **Scenario 3**: Status filter returns only matching requests
    - **Given** a caller with requests in various statuses
    - **When** `GET /api/groups/requests/mine?status=PENDING` is called
    - **Then** only requests with status `PENDING` are returned

- [x] **Scenario 4**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The caller's `userId` is resolved from `req.resolvedIdentity.userId`.
- Decorate with JSDoc, `@ApiOperation`, `@ApiResponse`.
- Supported status values: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`.
- Route must be registered before `GET /api/groups/requests/:requestId` to avoid path collision.
