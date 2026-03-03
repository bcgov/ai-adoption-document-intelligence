# US-006: `DELETE /api/groups/:groupId/members/:userId` Endpoint

**As a** group admin or system admin,
**I want to** remove a specific user from a group,
**So that** the membership roster can be managed without manual database changes.

## Acceptance Criteria
- [ ] **Scenario 1**: Group admin successfully removes a member
    - **Given** a caller who is a group admin for the specified group and a target user who is a member
    - **When** `DELETE /api/groups/:groupId/members/:userId` is called
    - **Then** a `200 OK` response is returned and the `UserGroup` record for that user and group is deleted

- [ ] **Scenario 2**: System admin successfully removes a member
    - **Given** a caller who is a system admin and a target user who is a member
    - **When** `DELETE /api/groups/:groupId/members/:userId` is called
    - **Then** a `200 OK` response is returned and the membership is removed

- [ ] **Scenario 3**: Returns `403` for a regular group member
    - **Given** a caller who is a member of the group but not a group admin or system admin
    - **When** `DELETE /api/groups/:groupId/members/:userId` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 4**: Returns `404` when target user is not a member
    - **Given** a valid group and a `userId` that does not have a `UserGroup` record for it
    - **When** `DELETE /api/groups/:groupId/members/:userId` is called
    - **Then** a `404 Not Found` response is returned

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
- Authorization: caller must have a `UserGroup` record with `role = ADMIN` for the group, or be a system admin.
- The `UserGroup` record is hard-deleted (not soft-deleted).
