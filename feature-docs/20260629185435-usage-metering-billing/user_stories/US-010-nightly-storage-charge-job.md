# US-010: Nightly Storage Charge Temporal Workflow

**As a** billing system,
**I want to** run a scheduled nightly Temporal workflow that converts GroupStorageLedger data into storage_daily_charge UsageEvents,
**So that** blob storage costs are metered daily in GB-hours and rolled into each group's monthly spend.

## Acceptance Criteria

- [ ] **Scenario 1**: Job queries only ledger rows active during the target day window
    - **Given** a `GroupStorageLedger` containing rows with various `written_at` and `deleted_at` timestamps
    - **When** the nightly job runs for a given day window `[start_of_day, end_of_day]`
    - **Then** only rows where `written_at < end_of_day AND (deleted_at IS NULL OR deleted_at > start_of_day)` are included in the calculation

- [ ] **Scenario 2**: GB-hours are calculated correctly per blob per group
    - **Given** a blob of 2 GB written 6 hours before `start_of_day` and deleted 8 hours into the day window
    - **When** the job computes GB-hours for that blob
    - **Then** `hours_alive = 8` (clamped to the day window), `gb_hours = 2 × 8 = 16`

- [ ] **Scenario 3**: Groups with non-zero daily storage usage receive a storage_daily_charge UsageEvent
    - **Given** a group with blobs that were alive for part of the day
    - **When** the nightly job processes that group
    - **Then** a `UsageEvent` with `event_type = "storage_daily_charge"`, `group_id`, `storage_gb_hours`, `units_consumed`, and `rate_version_id` is recorded and `UsagePeriodSummary` is incremented

- [ ] **Scenario 4**: Groups with zero storage activity for the day receive no event
    - **Given** a group that has no `GroupStorageLedger` rows active during the day window
    - **When** the nightly job runs
    - **Then** no `storage_daily_charge` event is recorded for that group

- [ ] **Scenario 5**: Per-GB-hour rate is derived from the monthly rate at calculation time
    - **Given** an active rate version with `cost_per_gb_units_per_month = 300` and the nightly job running for a 31-day month
    - **When** the job computes the rate to apply
    - **Then** the effective rate used is `300 / (31 × 24) ≈ 0.403` units per GB-hour

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Implemented as a Temporal scheduled workflow (cron-style, runs once per day)
- The day window is the 24-hour UTC period of the previous calendar day
- `alive_from = max(written_at, start_of_day)`, `alive_until = min(deleted_at ?? end_of_day, end_of_day)`
- `hours_alive = (alive_until - alive_from) / 3_600_000` (milliseconds)
- `gb_hours = (size_bytes / 1_073_741_824) × hours_alive`
- The derived hourly rate uses `days_in_month` of the billing month being charged — not a fixed 30-day assumption
- Units consumed per group = `sum(gb_hours) × cost_per_gb_hour`
