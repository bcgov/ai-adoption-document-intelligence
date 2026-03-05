# US-002: Extend `ResolvedIdentity` Type with `isSystemAdmin` and `groupRoles`

**As a** backend developer,
**I want to** have `isSystemAdmin` and `groupRoles` fields on the `ResolvedIdentity` interface,
**So that** controllers and guards can check authorization state from a single, well-typed object without relying on separate helper functions.

## Acceptance Criteria
- [ ] **Scenario 1**: `isSystemAdmin` field is added as optional boolean
    - **Given** the `ResolvedIdentity` interface is updated
    - **When** code reads `request.resolvedIdentity.isSystemAdmin`
    - **Then** it is typed as `boolean | undefined` and compiles without errors

- [ ] **Scenario 2**: `groupRoles` field is added as optional record
    - **Given** the `ResolvedIdentity` interface is updated
    - **When** code reads `request.resolvedIdentity.groupRoles`
    - **Then** it is typed as `Record<string, GroupRole> | undefined` and compiles without errors

- [ ] **Scenario 3**: Existing `groupId` field is removed
    - **Given** callers previously used `resolvedIdentity.groupId` on the API key path
    - **When** the interface is updated to remove `groupId`
    - **Then** TypeScript compile errors surface at every previous usage site, guiding migration

- [ ] **Scenario 4**: Both paths converge on `groupRoles`
    - **Given** the updated type
    - **When** either an API key or a JWT request is enriched by the guard
    - **Then** both populate `resolvedIdentity.groupRoles` in the same `Record<string, GroupRole>` shape

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The `ResolvedIdentity` interface is the authoritative type used by `IdentityGuard` and downstream controllers.
- `groupId` removal intentionally breaks compilation at all existing usages to force an explicit migration review.
- `GroupRole` enum values are `MEMBER` and `ADMIN` with `MEMBER < ADMIN` hierarchy.
