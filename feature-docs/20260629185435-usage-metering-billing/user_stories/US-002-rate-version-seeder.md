# US-002: Rate Version JSON File and Startup Seeder

**As a** platform operator,
**I want to** define rate versions in a committed JSON file that is automatically seeded into the database on startup,
**So that** pricing history is version-controlled and reproducible without manual database operations.

## Acceptance Criteria

- [ ] **Scenario 1**: rate_versions.json exists with a valid initial version
    - **Given** the repository
    - **When** `rate_versions.json` is inspected
    - **Then** it contains at least one version entry with valid fields: `version`, `effective_from`, `unit_cost_dollars`, `cost_per_gb_units_per_month`, `max_pages_assumption`, `activity_costs` (keyed by Temporal activity name with `cost_type` and `units`), and `training_costs` (with `template_model` and `classifier` keys)

- [ ] **Scenario 2**: Seeder inserts new versions on startup
    - **Given** a version in `rate_versions.json` that does not yet exist in the `RateVersion` table
    - **When** the backend application starts
    - **Then** the version is inserted into `RateVersion` along with its `ActivityCost` rows, and the operation is logged

- [ ] **Scenario 3**: Seeder is idempotent for existing versions
    - **Given** a version in `rate_versions.json` that already exists in the `RateVersion` table
    - **When** the backend application starts
    - **Then** no duplicate rows are created and no error is thrown

- [ ] **Scenario 4**: Active rate version resolved correctly by timestamp
    - **Given** multiple `RateVersion` rows with different `effective_from` dates
    - **When** the system queries for the active rate version at a specific timestamp T
    - **Then** the version returned is the one with the highest `effective_from` that is ≤ T

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The seeder should run as part of the NestJS application bootstrap (e.g., an `OnApplicationBootstrap` lifecycle hook or module initializer)
- Seeding is idempotent: check for existence by `version` string before inserting
- The JSON file location should be relative to the backend app (e.g., `apps/backend-services/src/billing/rate_versions.json`)
- Activity cost rows for a rate version are inserted as a batch alongside the version row, in a transaction
- The "active rate version at time T" query is used by all billing operations; it should be a shared utility function used throughout the feature
