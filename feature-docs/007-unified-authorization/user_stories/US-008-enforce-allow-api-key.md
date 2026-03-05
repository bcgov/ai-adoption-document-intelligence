# US-008: Enforce `allowApiKey` in `IdentityGuard`

**As a** backend developer,
**I want** the `IdentityGuard` to reject API key requests with 403 when `allowApiKey` is `false` (the default),
**So that** endpoints that should only be accessible via user sessions are automatically protected from API key authentication.

## Acceptance Criteria
- [ ] **Scenario 1**: API key request is rejected when `allowApiKey` is `false` (default)
    - **Given** `@Identity({})` (allowApiKey defaults to false) on the handler
    - **When** a request authenticated with an API key arrives
    - **Then** the guard throws `ForbiddenException` (403)

- [ ] **Scenario 2**: API key request is allowed when `allowApiKey` is `true`
    - **Given** `@Identity({ allowApiKey: true })` on the handler
    - **When** a request authenticated with an API key arrives
    - **Then** the guard passes (subject to other checks like group membership)

- [ ] **Scenario 3**: JWT requests are unaffected by `allowApiKey`
    - **Given** `@Identity({ allowApiKey: false })`
    - **When** a request authenticated with a JWT arrives
    - **Then** the `allowApiKey` check does not cause a 403

- [ ] **Scenario 4**: `allowApiKey` check runs immediately after identity type is determined
    - **Given** an API key request with `allowApiKey: false`
    - **When** the guard runs
    - **Then** the 403 is thrown before any group membership or role checks

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `allowApiKey: false` is the default; omitting the field is equivalent to setting `allowApiKey: false`.
- The check order in the guard is: identity resolution → `allowApiKey` → enrichment → `requireSystemAdmin` → `groupIdFrom` / membership → `minimumRole`.
