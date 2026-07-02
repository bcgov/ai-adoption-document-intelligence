# US-016: Platform Admin Cross-Group Usage View

**As a** platform admin,
**I want to** see a table of all groups with their current-month spend, monthly cap, and usage percentage, and drill down into any group's full history,
**So that** I can monitor platform-wide spending and identify groups approaching or exceeding their caps.

## Acceptance Criteria

- [ ] **Scenario 1**: Platform admin sees all groups with current-month spend summary
    - **Given** a platform admin viewing the usage dashboard
    - **When** they request the all-groups summary
    - **Then** a table is returned listing every group with `group_id`, `group_name`, `total_dollars_spent` (current month), `monthly_cap_dollars` (null if uncapped), and usage percentage (`spent / cap × 100`, null if uncapped)

- [ ] **Scenario 2**: Platform admin can drill down to a specific group's full history
    - **Given** a platform admin selecting a specific group
    - **When** they request that group's full usage history
    - **Then** all `UsagePeriodSummary` rows for that group are returned (same data as the group admin history view in US-014, but accessible by the platform admin for any group)

- [ ] **Scenario 3**: Only platform admin role can access cross-group views
    - **Given** a user without the `PLATFORM_ADMIN` role
    - **When** they request the all-groups summary or any group's drill-down
    - **Then** the request is rejected with HTTP 403

- [ ] **Scenario 4**: Groups with zero spend in the current month are still included in the summary
    - **Given** a group that has been onboarded but has no `UsagePeriodSummary` row for the current month (no activity yet)
    - **When** the all-groups summary is requested
    - **Then** that group appears in the table with `total_dollars_spent = 0`

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- All-groups summary endpoint: `GET /api/admin/usage/summary` (requires `PLATFORM_ADMIN` role)
- Group drill-down endpoint: `GET /api/admin/usage/groups/:groupId` (returns same shape as US-014 history, requires `PLATFORM_ADMIN`)
- The all-groups summary is a LEFT JOIN of `Group` against the current-month `UsagePeriodSummary` to ensure groups with no current-month activity appear with zero spend
