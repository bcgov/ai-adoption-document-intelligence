# US-013: `DELETE /api/groups/:groupId` — Soft-Delete Group (System Admin Only)

**As a** system admin,
**I want to** soft-delete a group via API,
**So that** groups can be disabled while preserving the historical data.

## Acceptance Criteria
- [ ] **Scenario 1**: System admin soft-deletes a group successfully
    - **Given** a caller who is a system admin and an existing active group
    - **When** `DELETE /api/groups/:groupId` is called
    - **Then** a `200 OK` response is returned, and the group record has `deleted_at` set to the current timestamp and `deleted_by` set to the caller's `userId`

- [ ] **Scenario 2**: Soft-deleted group is excluded from subsequent listings
    - **Given** a group that has been soft-deleted
    - **When** `GET /api/groups` is called
    - **Then** the soft-deleted group does not appear in the results

- [ ] **Scenario 3**: No cascade deletes occur
    - **Given** a group with associated members, workflows, and other resources
    - **When** the group is soft-deleted
    - **Then** all associated records remain in the database unmodified

- [ ] **Scenario 4**: Returns `404` for a non-existent group
    - **Given** a `groupId` that does not exist
    - **When** `DELETE /api/groups/:groupId` is called
    - **Then** a `404 Not Found` response is returned

- [ ] **Scenario 5**: Returns `403` for non-system-admin callers
    - **Given** a caller who is not a system admin
    - **When** `DELETE /api/groups/:groupId` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 6**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Decorate with JSDoc, `@ApiOperation`, `@ApiResponse`, `@ApiParam`.
- Authorization via `DatabaseService.isUserSystemAdmin`.
- Outstanding `PENDING` membership requests for the group are not automatically cancelled.
- The `deleted_by` field is populated from `req.resolvedIdentity.userId`.
