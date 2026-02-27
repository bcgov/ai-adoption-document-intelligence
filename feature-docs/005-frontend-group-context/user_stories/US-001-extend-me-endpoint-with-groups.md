# US-001: Extend `/me` Endpoint to Include Group Memberships

**As a** frontend application,
**I want to** receive the authenticated user's group memberships in the `/me` response,
**So that** the frontend can determine available groups without making an additional API call.

## Acceptance Criteria
- [x] **Scenario 1**: Groups included for a user with memberships
    - **Given** an authenticated user who is a member of one or more groups
    - **When** `GET /api/auth/me` is called
    - **Then** the response includes a `groups` array of `{ id, name }` objects for each group the user belongs to

- [x] **Scenario 2**: Empty array for a user with no memberships
    - **Given** an authenticated user who has no group memberships
    - **When** `GET /api/auth/me` is called
    - **Then** the response includes an empty `groups` array (`[]`)

- [x] **Scenario 3**: System-admin receives all groups
    - **Given** an authenticated user who is a system-admin
    - **When** `GET /api/auth/me` is called
    - **Then** the `groups` array contains all groups in the system (equivalent to `GET /api/groups`)

- [x] **Scenario 4**: `MeResponseDto` is updated
    - **Given** the API schema
    - **When** the DTO is inspected
    - **Then** `MeResponseDto` includes a `groups` field typed as `Array<{ id: string; name: string }>`

- [x] **Scenario 5**: Unit tests pass for the updated endpoint
    - **Given** the extended `AuthController.getMe` implementation
    - **When** unit tests are run
    - **Then** all existing and new tests pass with the updated response shape

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use the existing `GroupService.getUserGroups(userId)` method to fetch memberships.
- For system-admin users, use `GroupService` to return all groups (the same logic as `GET /api/groups`).
- Add/update Swagger `@ApiOperation`, `@ApiResponse` decorators on `getMe` to reflect the new field.
- Update `MeResponseDto` JSDoc to document the new `groups` property.
- Backend unit tests in `auth.controller.spec.ts` (or equivalent) must be created/updated.
