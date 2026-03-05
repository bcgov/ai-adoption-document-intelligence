# US-007: Enforce `minimumRole` Within a Group in `IdentityGuard`

**As a** backend developer,
**I want** the `IdentityGuard` to reject group members who do not meet the minimum required role when `minimumRole` is specified alongside `groupIdFrom`,
**So that** endpoints requiring ADMIN-level access within a group are not accessible to MEMBER-level callers.

## Acceptance Criteria
- [ ] **Scenario 1**: Caller with exact minimum role is allowed
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' }, minimumRole: GroupRole.ADMIN })`
    - **When** a caller with role `ADMIN` in the resolved group makes the request
    - **Then** the guard passes

- [ ] **Scenario 2**: Caller with a higher role than minimum is allowed
    - **Given** `@Identity({ ..., minimumRole: GroupRole.MEMBER })` (lowest role)
    - **When** a caller with role `ADMIN` makes the request
    - **Then** the guard passes (ADMIN satisfies MEMBER minimum)

- [ ] **Scenario 3**: Caller with insufficient role is rejected
    - **Given** `@Identity({ ..., minimumRole: GroupRole.ADMIN })`
    - **When** a caller with role `MEMBER` in the resolved group makes the request
    - **Then** the guard throws `ForbiddenException` (403)

- [ ] **Scenario 4**: `minimumRole` is ignored when `groupIdFrom` is absent
    - **Given** `@Identity({ minimumRole: GroupRole.ADMIN })` with no `groupIdFrom`
    - **When** the guard processes the request
    - **Then** the `minimumRole` check is skipped entirely and the request proceeds

- [ ] **Scenario 5**: System admin bypasses minimum role check
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' }, minimumRole: GroupRole.ADMIN })` and the caller is a system admin
    - **When** the request arrives
    - **Then** the guard passes regardless of the user's role in the group

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Role hierarchy: `MEMBER < ADMIN`. The check is: `resolvedRole >= minimumRole` using an ordered comparison.
- This check runs after the membership check (US-006), so the role is guaranteed to exist in `groupRoles` at this point.
- System admin bypass (US-005) applies before role checks.
