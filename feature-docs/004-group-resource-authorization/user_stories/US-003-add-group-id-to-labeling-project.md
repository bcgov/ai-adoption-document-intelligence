# US-003: Add group_id to LabelingProject

**As a** backend developer,
**I want to** add a `group_id` foreign key column to the `labeling_projects` table,
**So that** every LabelingProject record can be associated with a group for authorization enforcement.

## Acceptance Criteria
- [x] **Scenario 1**: Schema migration adds group_id
    - **Given** the `labeling_projects` table exists without a `group_id` column
    - **When** the migration is applied
    - **Then** the `labeling_projects` table has a nullable `group_id` column that is a foreign key referencing the `group` table

- [x] **Scenario 2**: Prisma model reflects the new column
    - **Given** the migration has been applied
    - **When** `db:generate` is run
    - **Then** the Prisma `LabelingProject` model includes an optional `group_id` field and the corresponding `group` relation

- [x] **Scenario 3**: Existing records remain intact
    - **Given** pre-existing `LabelingProject` records exist
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
- Sub-resources `TrainedModel`, `TrainingJob`, and `LabeledDocument` inherit group enforcement from `LabelingProject`; no schema changes required for them
