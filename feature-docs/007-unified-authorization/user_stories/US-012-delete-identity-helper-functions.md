# US-012: Delete `identityCanAccessGroup` and `getIdentityGroupIds` Helper Functions

**As a** backend developer,
**I want** the `identityCanAccessGroup` and `getIdentityGroupIds` helper functions to be deleted,
**So that** authorization cannot be accidentally omitted at the endpoint level and all group access checks are centralized in `IdentityGuard`.

## Acceptance Criteria
- [ ] **Scenario 1**: `identityCanAccessGroup` is deleted
    - **Given** all explicit usages of `identityCanAccessGroup` have been migrated (US-013, US-016)
    - **When** the helper is deleted
    - **Then** the function no longer exists in the codebase

- [ ] **Scenario 2**: `getIdentityGroupIds` is deleted
    - **Given** all explicit usages of `getIdentityGroupIds` have been migrated (US-016)
    - **When** the helper is deleted
    - **Then** the function no longer exists in the codebase

- [ ] **Scenario 3**: No remaining import or reference to either helper
    - **Given** the deletions are complete
    - **When** a global search is run for `identityCanAccessGroup` and `getIdentityGroupIds`
    - **Then** zero results are found in the source files

- [ ] **Scenario 4**: Codebase compiles after deletion
    - **Given** both helpers are deleted
    - **When** `tsc --noEmit` is run
    - **Then** there are no compilation errors

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Deletion should only happen after all usages are migrated; any remaining call sites that could not be migrated (e.g. sub-resource traversal endpoints) must be updated to use `resolvedIdentity.groupRoles` directly before deleting the helpers.
- Sub-resource endpoints that previously used these helpers keep manual checks via `resolvedIdentity.groupRoles` (out-of-scope for `@Identity` enforcement, per the requirements).
