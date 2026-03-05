# US-014: Migrate System-Admin Endpoints to Use `@Identity({ requireSystemAdmin: true })`

**As a** backend developer,
**I want** system-admin-only endpoints (e.g. group management, user administration) to use `@Identity({ requireSystemAdmin: true })`,
**So that** system-admin access is enforced declaratively by the guard and no manual admin checks remain in the controllers.

## Acceptance Criteria
- [ ] **Scenario 1**: System-admin endpoints are annotated with `@Identity({ requireSystemAdmin: true })`
    - **Given** endpoints that previously relied on `@KeycloakSSOAuth()` plus a manual admin check
    - **When** the migration is complete
    - **Then** those endpoints use `@Identity({ requireSystemAdmin: true })` instead

- [ ] **Scenario 2**: Manual system-admin checks are removed from migrated controllers
    - **Given** the guard enforces `requireSystemAdmin`
    - **When** the controller code is reviewed
    - **Then** no manual `is_system_admin` checks remain in the migrated controller methods

- [ ] **Scenario 3**: Non-admin JWT user is rejected before the controller executes
    - **Given** a system-admin endpoint
    - **When** a non-system-admin JWT user makes the request
    - **Then** the guard returns 403 and the controller is never invoked

- [ ] **Scenario 4**: System admin is granted access
    - **Given** a system-admin endpoint
    - **When** a system admin makes the request
    - **Then** the request proceeds to the controller

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `@KeycloakSSOAuth()` is replaced by `@Identity(...)` for Swagger metadata as part of this migration (see US-009, US-011).
- API key requests are implicitly rejected by `requireSystemAdmin: true` since API keys are never system admins.
