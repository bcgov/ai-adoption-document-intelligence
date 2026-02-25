# US-002: Add group_id to Workflow

**As a** backend developer,
**I want to** add a `group_id` foreign key column to the `workflows` table,
**So that** every Workflow record can be associated with a group for authorization enforcement.

## Acceptance Criteria
- [x] **Scenario 1**: Schema migration adds group_id
    - **Given** the `workflows` table exists without a `group_id` column
    - **When** the migration is applied
    - **Then** the `workflows` table has a nullable `group_id` column that is a foreign key referencing the `group` table

- [x] **Scenario 2**: Prisma model reflects the new column
    - **Given** the migration has been applied
    - **When** `db:generate` is run
    - **Then** the Prisma `Workflow` model includes an optional `group_id` field and the corresponding `group` relation

- [x] **Scenario 3**: Existing records remain intact
    - **Given** pre-existing `Workflow` records exist
    - **When** the migration is applied
    - **Then** all existing records remain present with `group_id` set to `null`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Column should be nullable (`String?`) to support existing/orphaned records
- FK references the `group` table's `id` column
- Add index on `group_id` for efficient membership lookups per §7
