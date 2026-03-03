# US-002: Extend `Group` Model with `description`, `deleted_at`, and `deleted_by` Fields

**As a** backend system,
**I want to** store a human-readable description and soft-delete metadata on the `Group` record,
**So that** groups can carry descriptive context and be soft-deleted without losing data.

## Acceptance Criteria
- [x] **Scenario 1**: Migration adds the new columns to `group`
    - **Given** the Prisma `Group` model is updated
    - **When** the migration is applied
    - **Then** the `group` table has three new nullable columns: `description String?`, `deleted_at DateTime?`, and `deleted_by String?`

- [x] **Scenario 2**: Existing group records are unaffected
    - **Given** existing group records in the database
    - **When** the migration is applied
    - **Then** all existing rows have `NULL` for the three new columns and remain otherwise intact

- [x] **Scenario 3**: Prisma Client is regenerated
    - **Given** the migration has been applied
    - **When** `npm run db:generate` is run from `apps/backend-services`
    - **Then** the generated Prisma Client types include the new optional fields on the `Group` type

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Run migration via `apps/shared/prisma/migrations/`.
- `deleted_by` stores the `user_id` of the admin who performed the soft delete (no FK constraint required, stored as plain string).
- Run `npm run db:generate` from `apps/backend-services` after migration.
