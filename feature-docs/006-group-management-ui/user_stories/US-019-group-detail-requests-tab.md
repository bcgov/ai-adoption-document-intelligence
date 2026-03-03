# US-019: Group Detail Page — Membership Requests Tab

**As a** group admin or system admin,
**I want to** view membership requests for a group with status filtering,
**So that** I can review and manage outstanding and historical requests.

## Acceptance Criteria
- [ ] **Scenario 1**: Membership Requests tab is only shown to group admins and system admins
    - **Given** a regular group member (no group-admin role) on the group detail page
    - **When** the page renders
    - **Then** the Membership Requests tab is not visible

- [ ] **Scenario 2**: Requests tab displays requests in a table
    - **Given** a group admin or system admin on the group detail page
    - **When** the Membership Requests tab is active
    - **Then** a table is shown with columns: Email, Requested (date), Reason, Status, and Actions

- [ ] **Scenario 3**: Status filter defaults to PENDING
    - **Given** the Membership Requests tab is first opened
    - **When** the tab renders
    - **Then** the status filter is set to `PENDING` and only pending requests are shown

- [ ] **Scenario 4**: All statuses are available as filter options
    - **Given** the status filter control
    - **When** the user opens the filter
    - **Then** `PENDING`, `APPROVED`, `DENIED`, and `CANCELLED` are all available options

- [ ] **Scenario 5**: Loading and error states are handled
    - **Given** the tab is fetching requests
    - **When** data is loading or an error occurs
    - **Then** appropriate loading/error UI is shown

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Fetch requests from `GET /api/groups/:groupId/requests?status=...` using TanStack React Query.
- Use Mantine `Table` and `Select` (or `SegmentedControl`) for the status filter.
- Resolved/cancelled rows are read-only (no action buttons).
