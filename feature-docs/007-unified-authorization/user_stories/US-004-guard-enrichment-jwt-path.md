# US-004: Enrich `resolvedIdentity` for JWT Requests in `IdentityGuard`

**As a** backend developer,
**I want** the `IdentityGuard` to run two parallel DB queries (`isUserSystemAdmin` + `getUsersGroups`) when a JWT request arrives and `@Identity` is present,
**So that** the enriched identity is populated efficiently and available for enforcement and controller logic.

## Acceptance Criteria
- [ ] **Scenario 1**: `isSystemAdmin` is populated from the database
    - **Given** `@Identity` is present and the user has `is_system_admin = true` in the DB
    - **When** the guard processes the JWT request
    - **Then** `resolvedIdentity.isSystemAdmin` is `true`

- [ ] **Scenario 2**: `groupRoles` is populated from the database
    - **Given** the user belongs to groups `g1` (MEMBER) and `g2` (ADMIN)
    - **When** the guard processes the JWT request
    - **Then** `resolvedIdentity.groupRoles` equals `{ g1: GroupRole.MEMBER, g2: GroupRole.ADMIN }`

- [ ] **Scenario 3**: Both queries run in parallel
    - **Given** `@Identity` is present on the handler
    - **When** the JWT path enrichment runs
    - **Then** `isUserSystemAdmin` and `getUsersGroups` are both invoked within a single `Promise.all`

- [ ] **Scenario 4**: Enrichment does not occur when `@Identity` is absent
    - **Given** no `@Identity` decorator on the handler
    - **When** a JWT request arrives
    - **Then** no DB queries are made for enrichment

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `getUsersGroups` in `DatabaseService` already returns the `role` field from `UserGroup`; no DB or service changes are needed.
- The guard must be `async` (`canActivate(): Promise<boolean>`) to support `await Promise.all(...)`.
- If the user has no groups, `groupRoles` should be set to `{}` (empty record), not `undefined`.
