# US-016: Migrate List Endpoints to Use `resolvedIdentity.groupRoles`

**As a** backend developer,
**I want** list endpoints (e.g. `GET /documents`) to use `Object.keys(resolvedIdentity.groupRoles)` or `resolvedIdentity.isSystemAdmin` to determine which groups the caller can see, instead of calling `getIdentityGroupIds`,
**So that** filtering logic is derived from the enriched identity without a dedicated helper function.

## Acceptance Criteria
- [ ] **Scenario 1**: System admin sees resources from all groups
    - **Given** `resolvedIdentity.isSystemAdmin = true`
    - **When** the list endpoint is called
    - **Then** no group filter is applied and all resources are returned

- [ ] **Scenario 2**: Non-admin caller sees only resources from their groups
    - **Given** `resolvedIdentity.isSystemAdmin = false` and `groupRoles = { g1: MEMBER, g2: ADMIN }`
    - **When** the list endpoint is called
    - **Then** the DB query filters results to groups `['g1', 'g2']` (derived from `Object.keys(groupRoles)`)

- [ ] **Scenario 3**: `getIdentityGroupIds` is not called in the migrated controller
    - **Given** the migrated list endpoint
    - **When** the controller code is reviewed
    - **Then** no calls to `getIdentityGroupIds` remain

- [ ] **Scenario 4**: `@Identity` decorator is present for enrichment
    - **Given** the migrated list endpoint
    - **When** the endpoint is inspected
    - **Then** it has an `@Identity(...)` decorator so that `resolvedIdentity.groupRoles` is populated by the guard

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `Object.keys(resolvedIdentity.groupRoles ?? {})` replaces the `getIdentityGroupIds` call.
- If `groupRoles` is empty, `Object.keys` returns `[]`, and the query should return no results (the caller has no group access).
- For API key callers, `groupRoles` contains exactly one entry (their scoped group), so they see only resources from that group.
