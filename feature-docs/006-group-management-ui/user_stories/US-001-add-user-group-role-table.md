# US-001: Add `UserGroupRole` Table via Prisma Migration

**As a** backend system,
**I want to** store group-scoped role assignments for users in a dedicated table,
**So that** the system can determine whether a user is a group admin for a specific group.

## Acceptance Criteria
- [ ] **Scenario 1**: Migration creates the `user_group_role` table
    - **Given** the Prisma schema is updated with the `UserGroupRole` model
    - **When** the migration is applied
    - **Then** a `user_group_role` table exists with columns: `user_id`, `group_id`, `role` (composite PK on all three), and an index on `group_id`

- [ ] **Scenario 2**: Foreign keys are correctly defined
    - **Given** the `user_group_role` table
    - **When** records are inserted
    - **Then** `user_id` references the `user` table and `group_id` references the `group` table

- [ ] **Scenario 3**: Prisma Client is regenerated
    - **Given** the migration has been applied
    - **When** `npm run db:generate` is run from `apps/backend-services`
    - **Then** the generated Prisma Client includes the `UserGroupRole` model and its relations on `User` and `Group`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Add the `UserGroupRole` model to `apps/shared/prisma/schema.prisma`.
- Run `npm run db:generate` from `apps/backend-services` after migration (uses the special script that also writes models into `apps/temporal/src`).
- No UI or admin endpoint to assign group-admin roles is in scope for this feature; records are managed directly in the database for testing.
