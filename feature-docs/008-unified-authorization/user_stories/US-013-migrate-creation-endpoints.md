# US-013: Migrate Creation Endpoints to Use `@Identity` with `groupIdFrom`

**As a** backend developer,
**I want** creation endpoints that accept a `group_id` in the request body to be updated to use `@Identity({ groupIdFrom: { body: 'group_id' }, allowApiKey: true })` (or equivalent),
**So that** group membership is enforced declaratively by the guard and the manual `identityCanAccessGroup` call is removed from the controller.

## Acceptance Criteria
- [x] **Scenario 1**: `@Identity` with `groupIdFrom` is applied to creation endpoints
    - **Given** endpoints such as `POST /upload` that previously called `identityCanAccessGroup` with a body `group_id`
    - **When** the migration is complete
    - **Then** those endpoints use `@Identity({ groupIdFrom: { body: 'group_id' }, ... })` instead

- [x] **Scenario 2**: Manual `identityCanAccessGroup` calls are removed from migrated controllers
    - **Given** the guard now enforces membership
    - **When** the controller code is reviewed
    - **Then** no calls to `identityCanAccessGroup` remain in the migrated controllers

- [x] **Scenario 3**: Non-member is rejected before the controller executes
    - **Given** the migrated endpoint with `@Identity({ groupIdFrom: { body: 'group_id' } })`
    - **When** a non-member sends a request
    - **Then** the guard returns 403 and the controller method is never invoked

- [x] **Scenario 4**: API key from the correct group is allowed (if `allowApiKey: true`)
    - **Given** the endpoint allows API keys
    - **When** a valid API key scoped to the request's `group_id` makes a creation request
    - **Then** the guard passes

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Each endpoint must be reviewed individually; the specific `groupIdFrom` location (body, param, or query) depends on how the endpoint receives the group identifier.
- The `allowApiKey` flag should be set to `true` only for endpoints that were previously marked with `@ApiKeyAuth()`.
