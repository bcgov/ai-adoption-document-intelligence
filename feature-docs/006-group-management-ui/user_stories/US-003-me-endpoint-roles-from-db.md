# US-003: Return Admin Status and Group Roles from the Database in `/me`

**As a** frontend application,
**I want to** receive the authenticated user's system-admin status and per-group role from the database in the `/me` response,
**So that** the frontend can accurately determine admin status and group-level permissions without relying on JWT claims.

## Acceptance Criteria
- [x] **Scenario 1**: `isAdmin` reflects DB `is_system_admin` flag
    - **Given** a user whose `is_system_admin` column is `true` in the `user` table
    - **When** `GET /api/auth/me` is called
    - **Then** the response includes `"isAdmin": true`

- [x] **Scenario 2**: `isAdmin` is `false` when DB flag is not set
    - **Given** an authenticated user whose `is_system_admin` column is `false` (or the user record does not exist yet)
    - **When** `GET /api/auth/me` is called
    - **Then** the response includes `"isAdmin": false`

- [x] **Scenario 3**: JWT `roles` claim is no longer used
    - **Given** the updated `AuthController.getMe` implementation
    - **When** the code is reviewed
    - **Then** `user.roles` from the JWT payload is not used to populate any field in `MeResponseDto`, and the `roles` field is removed from the response

- [x] **Scenario 4**: Each group in the response includes the user's `GroupRole`
    - **Given** a user who is a member of one or more groups
    - **When** `GET /api/auth/me` is called
    - **Then** each entry in the `groups` array includes a `role` field containing the `GroupRole` value (`"ADMIN"` or `"MEMBER"`) for that group

- [x] **Scenario 5**: Unit tests pass for the updated endpoint
    - **Given** the updated implementation
    - **When** unit tests are run
    - **Then** all tests for `AuthController.getMe` pass, covering `isAdmin` true/false and group `role` values (`ADMIN`/`MEMBER`) scenarios

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Remove `roles: string[]` from `MeResponseDto` and replace with `isAdmin: boolean`.
- `isAdmin` is sourced from `DatabaseService.isUserSystemAdmin(userId)`, which reads the `is_system_admin` column on the `user` table.
- Extend `GroupSummaryDto` with a `role: GroupRole` field.
- The `GroupService` methods (`getAllGroups`, `getUserGroups`) need to include the `role` from the `user_group` join record for the calling user. Because system-admins call `getAllGroups` (which is not scoped to a user), their group summaries should perform a join to retrieve the caller's role, defaulting to `MEMBER` if no record exists.
- Add/update Swagger `@ApiOperation` and `@ApiResponse` decorators on `getMe` to reflect `isAdmin` and the updated `GroupSummaryDto`.
- Update `auth.controller.spec.ts` to cover the `isAdmin` field and per-group `role` field.
