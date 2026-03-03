# US-022: My Requests Tab on the Groups Page

**As an** authenticated user,
**I want to** view all of my membership requests with status filtering in the My Requests tab on `/groups`,
**So that** I can track the history and outcome of my group join requests without navigating to a separate page.

## Acceptance Criteria
- [x] **Scenario 1**: My Requests tab displays all of the user's requests in a table
    - **Given** an authenticated user is on `/groups` and activates the `My Requests` tab
    - **When** the tab renders
    - **Then** a table is shown with columns: Group, Submitted (date), Status, Reason, and Actions

- [x] **Scenario 2**: Status filter defaults to PENDING
    - **Given** the page first loads
    - **When** the table renders
    - **Then** the status filter is set to `PENDING` and only pending requests are shown

- [x] **Scenario 3**: All statuses are available as filter options
    - **Given** the status filter control
    - **When** the user interacts with it
    - **Then** `PENDING`, `APPROVED`, `DENIED`, and `CANCELLED` are all available options

- [x] **Scenario 4**: Empty state is shown when no requests match the filter
    - **Given** the authenticated user has no requests matching the active filter
    - **When** the table renders
    - **Then** a friendly empty-state message is shown instead of an empty table

- [x] **Scenario 5**: Loading and error states are handled
    - **Given** the page is fetching requests
    - **When** data is loading or an error occurs
    - **Then** appropriate loading/error UI is shown

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a tab panel within the `/groups` page (US-015), not a standalone route. The `/my-requests` route is not needed.
- Fetch from `GET /api/groups/requests/mine?status=...` using TanStack React Query.
- Use a shared Mantine `Table` component; the column set differs from the Members tab (includes Group name, omits Email/Joined).
- Non-pending rows are read-only (no action buttons).
