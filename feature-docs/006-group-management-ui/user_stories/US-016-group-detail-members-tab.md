# US-016: Group Detail Page — Members Tab

**As a** group member, group admin, or system admin,
**I want to** view the members of a group on the group detail page,
**So that** I can see who belongs to the group.

## Acceptance Criteria
- [ ] **Scenario 1**: Members tab is only shown if the user is a group member, group admin, or system admin
    - **Given** a user who is not a member of the group
    - **When** the group detail page at `/groups/:groupId` renders
    - **Then** the Members tab is not shown

- [ ] **Scenario 2**: Members tab displays all current members
    - **Given** a group member, group admin, or system admin navigates to `/groups/:groupId`
    - **When** the Members tab is active
    - **Then** a table is displayed with columns: Email, Joined (date), and Actions

- [ ] **Scenario 3**: Non-admin members see the table without the remove action
    - **Given** a regular group member (not group admin or system admin)
    - **When** the Members tab is rendered
    - **Then** the Actions column does not show the Remove button

- [ ] **Scenario 4**: Group admin / system admin see the Remove button per row
    - **Given** a group admin or system admin
    - **When** the Members tab is rendered
    - **Then** each row has a Remove button in the Actions column

- [ ] **Scenario 5**: Loading and error states are handled
    - **Given** the tab is fetching members
    - **When** data is loading or an error occurs
    - **Then** appropriate loading/error UI is shown

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Fetch members from `GET /api/groups/:groupId/members` using TanStack React Query.
- Use Mantine `Table` component.
- Admin status (group admin or system admin) determines visibility of the Remove action.
