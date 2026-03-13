# US-010: `IdentityGuard` Pass-Through When `@Identity` Is Absent

**As a** backend developer,
**I want** the `IdentityGuard` to make no database queries and behave exactly as it does today when `@Identity` metadata is not present on the handler,
**So that** existing endpoints without the decorator are not impacted by the new enrichment logic and incur no performance overhead.

## Acceptance Criteria
- [x] **Scenario 1**: Guard passes without DB queries when no decorator is present
    - **Given** a controller handler with no `@Identity` decorator
    - **When** any authenticated request arrives
    - **Then** the guard resolves the identity as before and returns `true` without any DB calls

- [x] **Scenario 2**: `resolvedIdentity.isSystemAdmin` remains `undefined` without decorator
    - **Given** no `@Identity` on the handler
    - **When** the guard runs
    - **Then** `resolvedIdentity.isSystemAdmin` is `undefined`

- [x] **Scenario 3**: `resolvedIdentity.groupRoles` remains `undefined` without decorator
    - **Given** no `@Identity` on the handler
    - **When** the guard runs
    - **Then** `resolvedIdentity.groupRoles` is `undefined`

- [x] **Scenario 4**: No enforcement checks run when decorator is absent
    - **Given** no `@Identity` on the handler
    - **When** the guard runs
    - **Then** none of the `requireSystemAdmin`, `groupIdFrom`, `minimumRole`, or `allowApiKey` checks are evaluated

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The guard checks for `@Identity` metadata using `Reflector.getAllAndOverride(IDENTITY_KEY, [...])`.
- If the metadata key returns `undefined` (no decorator), the guard skips all enrichment and enforcement steps.
- This is a backwards-compatibility guarantee: no existing endpoint's behavior changes until `@Identity` is explicitly added.
