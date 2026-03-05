# US-001: Add Group Role Support via Prisma Migration

**As a** backend system,
**I want to** store group-scoped role assignments for users,
**So that** the system can determine whether a user is a group admin for a specific group.

## Acceptance Criteria
- [x] **Scenario 1**: Migration adds `role` column to `user_group` table
    - **Given** the Prisma schema is updated with a `GroupRole` enum and a non-nullable `role` column (defaulting to `MEMBER`) on `UserGroup`
    - **When** the migration is applied
    - **Then** the `user_group` table has a required `role` column of type `GroupRole` (enum: `ADMIN`, `MEMBER`) with a default of `MEMBER`, with an index on `group_id`

- [x] **Scenario 2**: Migration adds `is_system_admin` to `user` table
    - **Given** the Prisma schema adds `is_system_admin Boolean @default(false)` to `User`
    - **When** the migration is applied
    - **Then** the `user` table has an `is_system_admin` boolean column defaulting to `false`

- [x] **Scenario 3**: Prisma Client is regenerated
    - **Given** the migration has been applied
    - **When** `npm run db:generate` is run from `apps/backend-services`
    - **Then** the generated Prisma Client includes the updated `UserGroup` model and `GroupRole` enum

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Group-scoped roles are stored as a non-nullable `GroupRole` enum on `UserGroup` with `@default(MEMBER)` (`MEMBER` = plain member, `ADMIN` = group admin). No separate table is needed.
- System-wide admin status is stored as `is_system_admin` on `User` rather than via a roles table. This replaces the previous `UserRole`/`Role` table approach.
- The `Role` and `UserRole` tables have been removed from the schema.
- No UI or admin endpoint to assign group-admin roles is in scope for this feature; records are managed directly in the database for testing.
