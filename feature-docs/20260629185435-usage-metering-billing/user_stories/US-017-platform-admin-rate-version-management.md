# US-017: Platform Admin Rate Version Management

**As a** platform admin,
**I want to** view all rate versions with their effective dates and activity cost tables, and deploy new rate versions via the committed rate_versions.json file,
**So that** pricing is transparent, auditable, and changed through a controlled process.

## Acceptance Criteria

- [ ] **Scenario 1**: Platform admin can view all rate versions
    - **Given** a platform admin requesting the rate version list
    - **When** they call the rate versions endpoint
    - **Then** all `RateVersion` rows are returned ordered by `effective_from` descending, each with `version`, `effective_from`, `unit_cost_dollars`, `cost_per_gb_units_per_month`, and `max_pages_assumption`

- [ ] **Scenario 2**: Platform admin can view activity costs for a specific rate version
    - **Given** a specific rate version ID
    - **When** the platform admin requests that version's activity costs
    - **Then** all `ActivityCost` rows for that version are returned, each with `activity_name`, `cost_type`, and `units`

- [ ] **Scenario 3**: A new rate version becomes active on its effective_from date
    - **Given** a new version added to `rate_versions.json` with `effective_from` in the future
    - **When** that date and time arrive
    - **Then** all subsequent billing events (workflow starts, activity completions, storage charges) use the new version's rates — no manual activation step is needed

- [ ] **Scenario 4**: Only PLATFORM_ADMIN role can access rate version management endpoints
    - **Given** a request to the rate version list or detail endpoints by a non-admin user
    - **When** the request is processed
    - **Then** the request is rejected with HTTP 403

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- Rate version list endpoint: `GET /api/admin/rate-versions` (requires `PLATFORM_ADMIN`)
- Rate version activity costs endpoint: `GET /api/admin/rate-versions/:versionId/activity-costs` (requires `PLATFORM_ADMIN`)
- Adding a new rate version requires: (1) adding an entry to `rate_versions.json` and (2) deploying the application — the startup seeder inserts it automatically
- There is no UI or API for creating rate versions directly — the JSON file is the authoritative source of record
- The `training_costs` object on each rate version should also be included in the rate version detail response
