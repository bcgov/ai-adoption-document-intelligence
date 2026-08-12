# US-001: Billing Database Schema Migration

**As a** developer,
**I want to** have all billing-related Prisma models and indexes created via a database migration,
**So that** the rest of the metering feature has a stable schema foundation to build on.

## Acceptance Criteria

- [ ] **Scenario 1**: RateVersion and ActivityCost tables created
    - **Given** the migration has been applied to the database
    - **When** the schema is inspected
    - **Then** a `RateVersion` table exists with fields: `id`, `version` (unique), `effective_from`, `unit_cost_dollars`, `cost_per_gb_units_per_month`, `max_pages_assumption`, `created_at`; and an `ActivityCost` table exists with fields: `id`, `rate_version_id` (FK), `activity_name`, `cost_type` (enum: `flat` | `per_page`), `units`

- [ ] **Scenario 2**: UsageEvent table created with indexes
    - **Given** the migration has been applied
    - **When** the schema is inspected
    - **Then** a `UsageEvent` table exists with fields: `id`, `event_type` (enum), `group_id`, `workflow_execution_id` (nullable), `activity_name` (nullable), `metered_quantity` (nullable), `units_consumed`, `rate_version_id` (FK), `storage_gb_hours` (nullable), `resource_id` (nullable), `resource_type` (nullable), `estimated_units` (nullable), `created_at`; with a compound index on `(group_id, created_at)` and an index on `workflow_execution_id`

- [ ] **Scenario 3**: UsagePeriodSummary table created with unique index
    - **Given** the migration has been applied
    - **When** the schema is inspected
    - **Then** a `UsagePeriodSummary` table exists with fields: `id`, `group_id`, `period_year`, `period_month`, `total_units_consumed`, `total_dollars_spent`, `updated_at`; with a unique index on `(group_id, period_year, period_month)`

- [ ] **Scenario 4**: GroupBillingConfig table created and linked to Group
    - **Given** the migration has been applied
    - **When** the schema is inspected
    - **Then** a `GroupBillingConfig` table exists with fields: `id`, `group_id` (unique FK to `Group`), `monthly_cap_dollars` (nullable decimal), `cap_configured_by` (nullable), `cap_configured_at` (nullable); and the `Group` model has an optional relation to `GroupBillingConfig`

- [ ] **Scenario 5**: GroupStorageLedger table created with indexes
    - **Given** the migration has been applied
    - **When** the schema is inspected
    - **Then** a `GroupStorageLedger` table exists with fields: `id`, `group_id` (indexed), `blob_key` (unique), `size_bytes`, `written_at`, `deleted_at` (nullable); with a unique index on `blob_key` and a compound index on `(group_id, written_at, deleted_at)`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Run `npm run db:generate` from `apps/backend-services` after updating `schema.prisma` (the special script that writes models to both `apps/temporal/src` and `apps/backend-services/src`)
- The `UsageEventType` Prisma enum should include: `workflow_started`, `activity_completed`, `workflow_completed`, `workflow_failed`, `workflow_cancelled`, `model_training_started`, `storage_daily_charge`
- `ActivityCost.cost_type` should be a Prisma enum: `flat`, `per_page`
- All new tables need `created_at` (default now) following project conventions; `UsagePeriodSummary` uses `updated_at` (auto-updated) instead
- `GroupStorageLedger` rows are intentionally never hard-deleted by application code — `deleted_at` is the tombstone
