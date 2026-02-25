# US-001: Create GroupMembershipRequest Data Model

**As a** developer,
**I want to** have a `GroupMembershipRequest` database table with the required fields,
**So that** membership requests can be persisted and queried throughout their lifecycle.

## Acceptance Criteria
- [x] **Scenario 1**: Table is created with all required columns
    - **Given** the Prisma schema is updated
    - **When** migrations are applied
    - **Then** a `GroupMembershipRequest` table exists with columns: `id`, `user_id`, `group_id`, `status`, `actor_id`, `reason`, `resolved_at`, `created_at`, `created_by`, `updated_at`, `updated_by`

- [x] **Scenario 2**: Status is an enumerated type
    - **Given** the schema includes a status field
    - **When** a record is created or updated
    - **Then** only `PENDING`, `APPROVED`, `DENIED`, or `CANCELLED` are valid values for `status`

- [x] **Scenario 3**: Nullable fields are properly configured
    - **Given** the schema definition
    - **When** a new request is created
    - **Then** `actor_id`, `reason`, and `resolved_at` may be null; `created_at` defaults to now; `updated_at` is auto-updated on change

- [x] **Scenario 4**: Foreign keys are enforced
    - **Given** the schema relations
    - **When** a record references a `user_id` or `group_id`
    - **Then** those values must correspond to existing `User` and `Group` records respectively

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Follow existing Prisma conventions in the project (snake_case column names, UUID primary keys).
- Run `npm run db:generate` from `apps/backend-services` after updating the schema to regenerate models for both `apps/backend-services` and `apps/temporal`.
- `created_by` stores the `user_id` of the user who created the record; `updated_by` stores the `user_id` of the last user to modify it.
