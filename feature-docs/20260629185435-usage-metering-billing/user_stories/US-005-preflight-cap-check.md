# US-005: Pre-flight Spending Cap Enforcement

**As a** platform operator,
**I want to** have workflow submissions blocked with HTTP 402 when a group would exceed their monthly spending cap,
**So that** groups cannot consume more than their allocated budget without platform admin intervention.

## Acceptance Criteria

- [ ] **Scenario 1**: Groups with no cap configured always pass the check
    - **Given** a group whose `GroupBillingConfig.monthly_cap_dollars` is null
    - **When** the pre-flight cap check runs before workflow submission
    - **Then** the check passes regardless of current spend or estimated cost

- [ ] **Scenario 2**: Group under cap passes and workflow proceeds
    - **Given** a group with a $100 monthly cap and $60 current-month spend, and an estimated workflow cost of $30
    - **When** the pre-flight cap check runs
    - **Then** the check passes (`$60 + $30 = $90 ≤ $100`) and the workflow is submitted to Temporal

- [ ] **Scenario 3**: Group over cap is rejected with HTTP 402
    - **Given** a group with a $100 monthly cap and $80 current-month spend, and an estimated workflow cost of $30
    - **When** the pre-flight cap check runs
    - **Then** the request is rejected with HTTP 402 and a response body indicating the dollar shortfall (`$80 + $30 - $100 = $10 over cap`)

- [ ] **Scenario 4**: Concurrent requests cannot both pass when they would collectively exceed the cap
    - **Given** a group with a $100 monthly cap and $85 current-month spend, and two concurrent workflow requests each estimated at $20
    - **When** both requests perform the cap check simultaneously
    - **Then** at most one passes (`$85 + $20 = $105 > $100`) — the check uses a database-level transaction or row-level lock to prevent double-passing

- [ ] **Scenario 5**: Current spend is read from UsagePeriodSummary, not recalculated
    - **Given** a group with an existing `UsagePeriodSummary` row for the current month
    - **When** the pre-flight cap check reads current spend
    - **Then** `UsagePeriodSummary.total_dollars_spent` is used directly (single indexed read, not an aggregation of UsageEvent rows)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The cap check must run inside a database transaction that reads `UsagePeriodSummary` with a row-level lock (`SELECT ... FOR UPDATE`)
- Current spend in dollars = `UsagePeriodSummary.total_dollars_spent` for the current calendar month
- Estimated cost in dollars = `estimated_units × active_rate_version.unit_cost_dollars`
- The HTTP 402 response body should be a DTO with: `message`, `shortfall_dollars`, `current_spend_dollars`, `monthly_cap_dollars`, `estimated_cost_dollars`
- This same check pattern (read summary → compare → lock → proceed or reject) is reused for training pre-flight (US-012)
