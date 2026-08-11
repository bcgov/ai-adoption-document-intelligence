# US-014: Group Admin Usage Summary and History

**As a** group admin,
**I want to** view my group's current-month usage summary and historical monthly totals,
**So that** I can understand how much my group has spent and track trends over time.

## Acceptance Criteria

- [ ] **Scenario 1**: Group admin sees current period total spend and unit consumption
    - **Given** a group admin viewing their usage dashboard
    - **When** they request the current period summary
    - **Then** they see `total_units_consumed` and `total_dollars_spent` for the current calendar month, sourced from `UsagePeriodSummary`

- [ ] **Scenario 2**: Current period summary shows cap status when a cap is configured
    - **Given** a group with a `monthly_cap_dollars` configured
    - **When** the group admin views the current period summary
    - **Then** the response includes `monthly_cap_dollars`, remaining dollars (`cap - spent`), and an estimated cap exhaustion date based on current daily burn rate

- [ ] **Scenario 3**: Group admin sees historical monthly summaries
    - **Given** a group with `UsagePeriodSummary` rows for multiple past months
    - **When** the group admin requests usage history
    - **Then** all past period summaries are returned, ordered by most recent first, each showing `period_year`, `period_month`, `total_units_consumed`, and `total_dollars_spent`

- [ ] **Scenario 4**: Group admin can only access their own group's data
    - **Given** a group admin authenticated to group A
    - **When** they request usage data for group B
    - **Then** the request is rejected with HTTP 403

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- Current period summary endpoint: `GET /api/groups/:groupId/usage/summary`
- Historical summaries endpoint: `GET /api/groups/:groupId/usage/history`
- Cap exhaustion estimate: `remaining_dollars / (total_dollars_spent / days_elapsed_in_month)`; return null if no spend yet
- Authorization: the authenticated user must belong to the requested `groupId`
