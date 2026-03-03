# US-003: Source `/me` Endpoint Roles from the Database

**As a** frontend application,
**I want to** receive the authenticated user's roles from the database in the `/me` response,
**So that** the frontend can accurately determine system-admin status without relying on JWT claims.

## Acceptance Criteria
- [ ] **Scenario 1**: Roles are returned from the DB `user_role` table
    - **Given** a user with one or more roles recorded in the `user_role` table
    - **When** `GET /api/auth/me` is called
    - **Then** the `roles` field in the response contains the role names from the DB, not from the JWT payload

- [ ] **Scenario 2**: Empty array when user has no DB roles
    - **Given** an authenticated user with no records in `user_role`
    - **When** `GET /api/auth/me` is called
    - **Then** the `roles` field is an empty array (`[]`)

- [ ] **Scenario 3**: `system-admin` role is detectable by the frontend
    - **Given** a user who has `system-admin` in the `user_role` table
    - **When** `GET /api/auth/me` is called
    - **Then** the `roles` array includes `"system-admin"`, enabling `roles.includes('system-admin')` to return `true` on the frontend

- [ ] **Scenario 4**: JWT `roles` claim is no longer used
    - **Given** the updated `AuthController.getMe` implementation
    - **When** the code is reviewed
    - **Then** `user.roles` from the JWT payload is not used to populate `MeResponseDto.roles`

- [ ] **Scenario 5**: Unit tests pass for the updated endpoint
    - **Given** the updated implementation
    - **When** unit tests are run
    - **Then** all tests for `AuthController.getMe` pass, covering both empty and non-empty role scenarios

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `MeResponseDto.roles` type remains `string[]`; only the data source changes.
- Query the `user_role` table using an existing or new `DatabaseService` method.
- Add/update Swagger `@ApiOperation` and `@ApiResponse` decorators to reflect the corrected data source.
- Update `auth.controller.spec.ts` to cover DB-sourced roles.
