# US-005: Add group_id to ApiKey

**As a** backend developer,
**I want to** add a `group_id` foreign key column to the `api_keys` table,
**So that** every ApiKey record is scoped to a specific group, enabling group-based authorization for API key authentication.

## Acceptance Criteria
- [x] **Scenario 1**: Schema migration adds group_id
    - **Given** the `api_keys` table exists without a `group_id` column
    - **When** the migration is applied
    - **Then** the `api_keys` table has a `group_id` column that is a non-nullable foreign key referencing the `group` table

- [x] **Scenario 2**: Prisma model reflects the new column
    - **Given** the migration has been applied
    - **When** `db:generate` is run
    - **Then** the Prisma `ApiKey` model includes a required `group_id` field and the corresponding `group` relation, alongside the retained `user_id` field

- [x] **Scenario 3**: Existing user_id field is retained
    - **Given** the migration has been applied
    - **When** an `ApiKey` record is queried
    - **Then** both `user_id` and `group_id` are present on the record

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `group_id` is required (non-nullable `String`) — every API key must belong to a group.
- `user_id` is retained as-is; it records which user last generated the key (audit trail)
- FK references the `group` table's `id` column
- Add index on `group_id` for efficient lookups
- Existing `api_keys` rows without `group_id` will need to be handled in the migration (e.g., delete orphaned keys or require manual remediation before applying the non-nullable constraint)
