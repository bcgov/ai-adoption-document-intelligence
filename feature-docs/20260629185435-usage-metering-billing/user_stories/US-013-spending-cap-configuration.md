# US-013: Platform Admin Group Spending Cap Configuration

**As a** platform admin,
**I want to** configure a monthly spending cap in dollars for any group,
**So that** I can enforce budget limits per client and prevent runaway spending.

## Acceptance Criteria

- [ ] **Scenario 1**: Platform admin can set a monthly spending cap on a group
    - **Given** a platform admin with the `PLATFORM_ADMIN` role
    - **When** they submit a request to set `monthly_cap_dollars` for a group
    - **Then** the group's `GroupBillingConfig` record is created or updated with the new cap value, and `cap_configured_by` and `cap_configured_at` are recorded

- [ ] **Scenario 2**: Platform admin can remove a spending cap
    - **Given** a group that currently has a `monthly_cap_dollars` set
    - **When** a platform admin sets the cap to null
    - **Then** `GroupBillingConfig.monthly_cap_dollars` is set to null and cap enforcement is disabled for that group

- [ ] **Scenario 3**: Non-admin users cannot set spending caps
    - **Given** a request to set a spending cap made by a non-platform-admin user
    - **When** the request is processed
    - **Then** the request is rejected with HTTP 403

- [ ] **Scenario 4**: Groups with no cap configured are treated as unlimited
    - **Given** a group with no `GroupBillingConfig` row or with `monthly_cap_dollars = null`
    - **When** the pre-flight cap check runs for any workflow or training submission
    - **Then** the check always passes regardless of current spend

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- A group may have no `GroupBillingConfig` row at all initially — the cap check must handle both the null-row and null-value cases
- `cap_configured_by` should be the user ID or actor identifier of the platform admin making the change
- This is a protected PATCH endpoint: `PATCH /api/admin/groups/:groupId/billing-config`
- The response should return the full `GroupBillingConfig` DTO including timestamps
