# US-017: Write Unit Tests for `IdentityGuard`

**As a** backend developer,
**I want** comprehensive unit tests covering all `IdentityGuard` scenarios,
**So that** regressions are caught when the guard logic changes and the guard's contract is clearly documented in code.

## Acceptance Criteria
- [ ] **Scenario 1**: No decorator — guard passes without DB queries
    - **Given** no `@Identity` metadata is present
    - **When** the guard runs
    - **Then** the test asserts pass-through with zero DB calls

- [ ] **Scenario 2**: API key allowed — guard passes with enriched identity
    - **Given** `@Identity({ allowApiKey: true, groupIdFrom: { param: 'groupId' } })` and a valid API key scoped to the param group
    - **When** the guard runs
    - **Then** the test asserts the request passes and `groupRoles` is correctly set

- [ ] **Scenario 3**: API key blocked — guard throws 403
    - **Given** `@Identity({ allowApiKey: false })` and an API key request
    - **When** the guard runs
    - **Then** the test asserts `ForbiddenException` is thrown

- [ ] **Scenario 4**: System admin bypass — passes all group checks
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' }, minimumRole: GroupRole.ADMIN })` and a system admin JWT
    - **When** the guard runs
    - **Then** the test asserts the request passes regardless of the system admin's membership in the group

- [ ] **Scenario 5**: Member passes — caller is a member of the required group
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and a JWT user who is a MEMBER of that group
    - **When** the guard runs
    - **Then** the test asserts the request passes

- [ ] **Scenario 6**: Member fails minimumRole ADMIN — caller is MEMBER, endpoint requires ADMIN
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' }, minimumRole: GroupRole.ADMIN })` and a JWT user with MEMBER role
    - **When** the guard runs
    - **Then** the test asserts `ForbiddenException` is thrown

- [ ] **Scenario 7**: Non-member blocked — caller is not in the required group
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and a JWT user not in the group
    - **When** the guard runs
    - **Then** the test asserts `ForbiddenException` is thrown

- [ ] **Scenario 8**: Missing group ID — guard throws 400
    - **Given** `@Identity({ groupIdFrom: { param: 'groupId' } })` and the route param is absent
    - **When** the guard runs
    - **Then** the test asserts `BadRequestException` is thrown

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Tests should mock `DatabaseService` methods (`isUserSystemAdmin`, `getUsersGroups`) to avoid real DB access.
- Each scenario should be a separate `it()` block in the NestJS/Jest test suite for `IdentityGuard`.
- Tests covering the parallel DB query behavior may use `jest.spyOn` to verify both methods are called within the same test execution.
- Tests should be co-located with the guard file or in a dedicated spec file following project conventions.
