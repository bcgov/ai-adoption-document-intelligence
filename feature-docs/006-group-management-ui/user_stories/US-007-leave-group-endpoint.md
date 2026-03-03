# US-007: `DELETE /api/groups/:groupId/leave` Endpoint

**As an** authenticated user,
**I want to** remove myself from a group I belong to,
**So that** I can leave groups without requiring an admin to remove me.

## Acceptance Criteria
- [x] **Scenario 1**: Member successfully leaves a group
    - **Given** a caller who is a member of the specified group
    - **When** `DELETE /api/groups/:groupId/leave` is called
    - **Then** a `200 OK` response is returned and the caller's `UserGroup` record for the group is deleted

- [x] **Scenario 2**: Returns `400` when caller is not a member
    - **Given** a caller who is not a member of the specified group
    - **When** `DELETE /api/groups/:groupId/leave` is called
    - **Then** a `400 Bad Request` response is returned

- [x] **Scenario 3**: Unit tests pass
    - **Given** the implemented endpoint
    - **When** unit tests are run
    - **Then** all tests covering the above scenarios pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The caller's identity is resolved from `req.resolvedIdentity.userId`.
- Decorate with JSDoc, `@ApiOperation`, `@ApiResponse`, `@ApiParam`.
- This endpoint is distinct from `DELETE /api/groups/:groupId/members/:userId` even though the underlying DB operation is the same, to provide clearer semantics and separate access control.
- The `UserGroup` record (which contains the user's role) is hard-deleted.
