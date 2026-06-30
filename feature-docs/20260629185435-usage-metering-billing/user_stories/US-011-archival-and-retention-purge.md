# US-011: End-of-Month Archival and UsageEvent Retention Purge

**As a** platform operator,
**I want to** automatically archive stale GroupStorageLedger rows and purge old UsageEvent rows on a schedule,
**So that** database tables remain bounded in size without losing any permanent billing history.

## Acceptance Criteria

- [ ] **Scenario 1**: Deleted ledger rows from prior months are purged after daily charges are complete
    - **Given** the end-of-month archival job runs after the last daily storage charge of the calendar month
    - **When** the archival step executes
    - **Then** all `GroupStorageLedger` rows where `deleted_at IS NOT NULL AND deleted_at < start_of_current_month` are deleted from the table

- [ ] **Scenario 2**: Live ledger rows are never archived
    - **Given** `GroupStorageLedger` rows where `deleted_at IS NULL` (blobs still in storage)
    - **When** the archival job runs
    - **Then** those rows are not deleted — they must remain to continue accruing GB-hours into the next month

- [ ] **Scenario 3**: UsageEvent rows beyond the configured retention window are purged
    - **Given** a deployment with `USAGE_EVENT_RETENTION_DAYS = 730` (2 years) and UsageEvent rows older than 730 days
    - **When** the end-of-month archival job runs
    - **Then** UsageEvent rows where `created_at < now() - retention_window` are deleted

- [ ] **Scenario 4**: UsagePeriodSummary rows are never purged
    - **Given** UsagePeriodSummary rows for any historical month
    - **When** the archival job runs
    - **Then** no UsagePeriodSummary rows are deleted — they are the permanent billing record

- [ ] **Scenario 5**: Archival runs as part of the same Temporal scheduled workflow as the daily charge job
    - **Given** the last day of a calendar month
    - **When** the nightly storage charge job runs that day
    - **Then** after recording the daily charge, the workflow also executes the archival and retention purge steps before completing

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The archival cutoff for `GroupStorageLedger` is `start_of_current_month` (i.e., rows deleted before the first of the current month)
- The retention window for `UsageEvent` is controlled by a deployment-level environment variable `USAGE_EVENT_RETENTION_DAYS` (default: 730)
- The count of archived/purged rows should be logged as a maintenance event (not a `UsageEvent`)
- `UsagePeriodSummary` preserves monthly dollar totals permanently, so purging raw `UsageEvent` rows does not lose billing history
- The Temporal scheduled workflow from US-010 is extended with a conditional archival step triggered only on the last day of the month
