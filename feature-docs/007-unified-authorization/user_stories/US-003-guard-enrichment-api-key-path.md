# US-003: Enrich `resolvedIdentity` for API Key Requests in `IdentityGuard`

**As a** backend developer,
**I want** the `IdentityGuard` to populate `isSystemAdmin` and `groupRoles` on `resolvedIdentity` when an API key request arrives and `@Identity` is present,
**So that** downstream enforcement logic and controllers have a consistent, enriched identity object without needing extra DB queries.

## Acceptance Criteria
- [ ] **Scenario 1**: `isSystemAdmin` is set to `false` for API key requests
    - **Given** `@Identity` metadata is present on the handler
    - **When** the request is authenticated via API key
    - **Then** `resolvedIdentity.isSystemAdmin` is `false`

- [ ] **Scenario 2**: `groupRoles` is set with the API key's scoped group as `MEMBER`
    - **Given** an API key scoped to `groupId = 'group-123'`
    - **When** the request is processed
    - **Then** `resolvedIdentity.groupRoles` equals `{ 'group-123': GroupRole.MEMBER }`

- [ ] **Scenario 3**: No DB queries are made for API key enrichment
    - **Given** `@Identity` is present and the request uses an API key
    - **When** the guard enriches the identity
    - **Then** no database calls are made (API key enrichment is purely synchronous)

- [ ] **Scenario 4**: Enrichment does not occur when `@Identity` is absent
    - **Given** no `@Identity` decorator on the handler
    - **When** an API key request arrives
    - **Then** `resolvedIdentity.isSystemAdmin` and `resolvedIdentity.groupRoles` remain `undefined`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The existing API key resolution logic (reading `apiKeyGroupId` from the validated key) is unchanged.
- Enrichment is a new step that runs after identity resolution and before enforcement.
- This story does not include the `allowApiKey` enforcement check (see US-008).
