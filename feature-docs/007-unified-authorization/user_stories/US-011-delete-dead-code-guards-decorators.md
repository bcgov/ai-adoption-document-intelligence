# US-011: Delete `RolesGuard`, `@Roles`, `@ApiKeyAuth()`, and `@KeycloakSSOAuth()` Dead Code

**As a** backend developer,
**I want** the dead/deprecated code (`RolesGuard`, `@Roles`, `@ApiKeyAuth()`, `@KeycloakSSOAuth()`) to be deleted from the codebase,
**So that** the authorization model is clean and developers are not confused by obsolete constructs.

## Acceptance Criteria
- [x] **Scenario 1**: `RolesGuard` class is deleted
    - **Given** `RolesGuard` exists as dead code (reads JWT roles that are no longer used)
    - **When** the cleanup is applied
    - **Then** the `RolesGuard` file and class no longer exist in the codebase

- [x] **Scenario 2**: `@Roles` decorator is deleted
    - **Given** `@Roles` decorator exists and is unused
    - **When** the cleanup is applied
    - **Then** the `@Roles` decorator file and export no longer exist in the codebase

- [x] **Scenario 3**: `@ApiKeyAuth()` decorator is deleted
    - **Given** all usages of `@ApiKeyAuth()` have been replaced with `@Identity(...)`
    - **When** the cleanup is applied
    - **Then** the `@ApiKeyAuth()` decorator no longer exists in the codebase

- [x] **Scenario 4**: `@KeycloakSSOAuth()` decorator is deleted
    - **Given** all usages of `@KeycloakSSOAuth()` have been replaced with `@Identity(...)`
    - **When** the cleanup is applied
    - **Then** the `@KeycloakSSOAuth()` decorator no longer exists in the codebase

- [x] **Scenario 5**: Codebase compiles successfully after deletions
    - **Given** all deletions are complete
    - **When** `tsc --noEmit` is run
    - **Then** there are no compilation errors related to the removed items

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `@ApiKeyAuth()` and `@KeycloakSSOAuth()` should only be deleted after all their usages have been replaced with `@Identity(...)` (see US-013, US-014).
- `RolesGuard` and `@Roles` may be deleted independently since they are not actively used.
- All related test files for the deleted constructs should also be removed.
