# US-005: `GET /api/groups/:groupId/members` Endpoint

**As a** group member, group admin, or system admin,
**I want to** retrieve the list of current members for a group,
**So that** the frontend can display the group's membership roster.

## Acceptance Criteria
- [ ] **Scenario 1**: Returns all members for a group admin
    - **Given** a caller who is a group admin for the specified group
    - **When** `GET /api/groups/:groupId/members` is called
    - **Then** a `200 OK` response is returned with an array of members, each containing `userId`, `email`, and `joinedAt` (the `created_at` of the `UserGroup` record)

- [ ] **Scenario 2**: Returns all members for a system admin
    - **Given** a caller who is a system admin
    - **When** `GET /api/groups/:groupId/members` is called
    - **Then** a `200 OK` response is returned with the full member list

- [ ] **Scenario 3**: Returns all members for a regular group member
    - **Given** a caller who is a member of the group but not a group admin or system admin
    - **When** `GET /api/groups/:groupId/members` is called
    - **Then** a `200 OK` response is returned with the member list (read-only access)

- [ ] **Scenario 4**: Returns `403` for a caller who is not a member
    - **Given** a caller who is neither a member, group admin, nor system admin of the group
    - **When** `GET /api/groups/:groupId/members` is called
    - **Then** a `403 Forbidden` response is returned

- [ ] **Scenario 5**: Controller and service unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Decorate the controller method with JSDoc, `@ApiOperation`, `@ApiResponse`, and `@ApiParam`.
- Use `resolvedIdentity` (set by `IdentityGuard`) to determine the caller.
- Authorization check: caller must be in `UserGroup` for the group, have a `UserGroupRole` record with `role = 'group-admin'`, or pass `isUserSystemAdmin`.
