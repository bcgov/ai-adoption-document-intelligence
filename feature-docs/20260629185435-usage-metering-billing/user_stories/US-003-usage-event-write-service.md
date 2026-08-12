# US-003: Usage Event Write Service

**As a** developer,
**I want to** have a shared service that records UsageEvents and incrementally maintains UsagePeriodSummary,
**So that** all metering instrumentation points have a single, consistent way to emit billing records.

## Acceptance Criteria

- [ ] **Scenario 1**: Recording a UsageEvent persists all required fields
    - **Given** a call to the usage event service with valid event data
    - **When** the event is recorded
    - **Then** a `UsageEvent` row is persisted with all provided fields including `event_type`, `group_id`, `units_consumed`, `rate_version_id`, and `created_at`

- [ ] **Scenario 2**: Recording an event creates a UsagePeriodSummary if none exists
    - **Given** no `UsagePeriodSummary` row exists for the group's current calendar month
    - **When** a `UsageEvent` is recorded for that group
    - **Then** a new `UsagePeriodSummary` row is created with `total_units_consumed` and `total_dollars_spent` reflecting the single event

- [ ] **Scenario 3**: Recording an event increments an existing UsagePeriodSummary
    - **Given** a `UsagePeriodSummary` row already exists for the group's current calendar month
    - **When** a new `UsageEvent` is recorded for that group
    - **Then** the existing `UsagePeriodSummary` row's `total_units_consumed` and `total_dollars_spent` are incremented by the event's values and `updated_at` is refreshed

- [ ] **Scenario 4**: Dollar conversion uses rate version's unit_cost_dollars
    - **Given** an active rate version with `unit_cost_dollars = 0.001`
    - **When** a `UsageEvent` with `units_consumed = 500` is recorded
    - **Then** `total_dollars_spent` on `UsagePeriodSummary` is incremented by `0.50`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- This service is the single write path for all billing events — no other code should write directly to `UsageEvent` or `UsagePeriodSummary`
- The `UsagePeriodSummary` upsert should be done atomically (e.g., using a Prisma upsert with the unique index on `(group_id, period_year, period_month)`)
- The service must be injectable in both the backend NestJS app and the Temporal worker context
- `total_dollars_spent` increment = `event.units_consumed × active_rate_version.unit_cost_dollars`
- The `rate_version_id` on each event is the active version at the time the event is created — this is stored for audit reproducibility
