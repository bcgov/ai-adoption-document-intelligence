# US-006: Create Route-Level Guard for Requestor Identity Resolution

**As a** backend developer,
**I want to** implement a NestJS guard that resolves and attaches requestor identity from either a JWT or an API key,
**So that** downstream authorization checks have consistent access to the requestor's identity without duplicating extraction logic across controllers.

## Acceptance Criteria
- [ ] **Scenario 1**: JWT requestor identity resolved
    - **Given** an incoming request with a valid Keycloak JWT
    - **When** the guard processes the request
    - **Then** the requestor's user identity (e.g., user ID) is extracted from the JWT payload and attached to the request context

- [ ] **Scenario 2**: API key requestor identity resolved
    - **Given** an incoming request authenticated via an API key
    - **When** the guard processes the request
    - **Then** the `group_id` from the `ApiKey` record is attached to the request context for use by downstream authorization logic

- [ ] **Scenario 3**: Guard is composable with existing auth guards
    - **Given** the route-level guard is applied alongside existing JWT/API key auth guards
    - **When** a request is processed
    - **Then** the existing auth guards continue to function correctly and the identity guard does not interfere with or replace them

- [ ] **Scenario 4**: Unit tests cover all identity resolution paths
    - **Given** the guard implementation
    - **When** unit tests are run
    - **Then** all JWT and API key extraction paths are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This guard should only resolve and attach identity; it does not perform group membership checks
- The resolved identity must be made available via NestJS request context (e.g., `request.resolvedIdentity`) for service-layer consumption
- Must be composable with existing auth guards (JWT and API key) per §3.3 and §7
- The `system-admin` bypass check is a placeholder pending the roles & claims system (§9); include a stub/comment in the guard but do not implement role extraction yet
