# US-005: Enforce `requireSystemAdmin` in `IdentityGuard`

**As a** backend developer,
**I want** the `IdentityGuard` to reject callers who are not system admins when `requireSystemAdmin: true` is specified in `@Identity`,
**So that** system-admin-only endpoints are protected declaratively without any controller-layer checks.

## Acceptance Criteria
- [ ] **Scenario 1**: System admin is granted access
    - **Given** `@Identity({ requireSystemAdmin: true })` is on the handler
    - **When** a JWT user with `isSystemAdmin = true` makes the request
    - **Then** the guard allows the request to proceed

- [ ] **Scenario 2**: Non-system-admin JWT user is rejected
    - **Given** `@Identity({ requireSystemAdmin: true })` is on the handler
    - **When** a JWT user with `isSystemAdmin = false` makes the request
    - **Then** the guard throws `ForbiddenException` (403)

- [ ] **Scenario 3**: API key request is always rejected for `requireSystemAdmin`
    - **Given** `@Identity({ requireSystemAdmin: true })` is on the handler
    - **When** a request authenticated via API key arrives
    - **Then** the guard throws `ForbiddenException` (403), since API keys are never system admins

- [ ] **Scenario 4**: System admin bypasses all subsequent group checks
    - **Given** `@Identity({ requireSystemAdmin: true, groupIdFrom: { param: 'groupId' } })` (hypothetically)
    - **When** a system admin makes the request
    - **Then** the guard passes without checking group membership

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Enforcement of `requireSystemAdmin` is the first check after enrichment.
- System admin status comes from `resolvedIdentity.isSystemAdmin` populated in US-003 / US-004.
- API keys set `isSystemAdmin = false` unconditionally (US-003), so they always fail this check.
