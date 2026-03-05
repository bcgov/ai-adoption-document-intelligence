# US-006: Extract `group_id` and Enforce Group Membership via `groupIdFrom`

**As a** backend developer,
**I want** the `IdentityGuard` to extract a `group_id` from the request location specified in `groupIdFrom` and verify the caller is a member of that group,
**So that** endpoints with a known group scope are automatically protected against non-members without any controller-layer membership check.

## Acceptance Criteria
- [ ] **Scenario 1**: Group ID extracted from route param and member is allowed
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and the caller is a member
    - **When** the request arrives with `groupId` in the route params
    - **Then** the guard passes

- [ ] **Scenario 2**: Group ID extracted from query param and member is allowed
    - **Given** `@Identity({ groupIdFrom: { query: 'group_id' } })` and the caller is a member
    - **When** the request arrives with `group_id` in the query string
    - **Then** the guard passes

- [ ] **Scenario 3**: Group ID extracted from request body and member is allowed
    - **Given** `@Identity({ groupIdFrom: { body: 'group_id' } })` and the caller is a member
    - **When** the request arrives with `group_id` in the body
    - **Then** the guard passes

- [ ] **Scenario 4**: Missing group ID results in 400 Bad Request
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })`
    - **When** the route param `groupId` is absent from the request
    - **Then** the guard throws `BadRequestException` (400)

- [ ] **Scenario 5**: Non-member is rejected with 403 Forbidden
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and the caller is NOT a member of the resolved group
    - **When** the request arrives
    - **Then** the guard throws `ForbiddenException` (403)

- [ ] **Scenario 6**: System admin bypasses membership check
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and the caller is a system admin
    - **When** the request arrives (regardless of actual group membership)
    - **Then** the guard passes

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Membership is determined by checking `resolvedIdentity.groupRoles[resolvedGroup_id]` is defined.
- System admin bypass happens before the membership check (see US-005 ordering).
- `groupIdFrom` with no `param`, `query`, or `body` set is treated as if `groupIdFrom` was not provided.
