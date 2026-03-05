# US-015: Groups Page (`/groups`) with My Groups and My Requests Tabs

**As an** authenticated user,
**I want to** see my groups and my membership requests on a single tabbed page at `/groups`,
**So that** all group-related information is accessible from one place without separate navigation entries.

## Acceptance Criteria
- [x] **Scenario 1**: Page renders with two tabs: My Groups and My Requests
    - **Given** any authenticated user navigates to `/groups`
    - **When** the page loads
    - **Then** two tabs are shown: `My Groups` and `My Requests`

- [x] **Scenario 2**: My Groups tab — non-admin user sees only their groups
    - **Given** a regular user on the `My Groups` tab
    - **When** the tab is active
    - **Then** only the groups the user belongs to are shown in the table

- [x] **Scenario 3**: My Groups tab — system admin sees all groups
    - **Given** a user with the `system-admin` role on the `My Groups` tab
    - **When** the tab is active
    - **Then** all active (non-soft-deleted) groups are shown

- [x] **Scenario 4**: Clicking a group navigates to the group detail page
    - **Given** the `My Groups` tab is active
    - **When** the user clicks on a group
    - **Then** the application navigates to `/groups/:groupId`

- [x] **Scenario 5**: My Requests tab shows all of the user's membership requests
    - **Given** the user clicks the `My Requests` tab
    - **When** the tab renders
    - **Then** the table from US-022 is displayed (Group, Submitted, Status, Reason, Actions columns)

- [x] **Scenario 6**: Loading and error states are handled per tab
    - **Given** either tab is fetching data
    - **When** data is loading or an error occurs
    - **Then** appropriate loading/error UI is shown within the active tab

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use Mantine `Tabs` component to structure the two tab panels.
- Use TanStack React Query for data fetching in each tab panel.
- Groups data fetched from the existing `GET /api/groups` (or `/me` groups) endpoint.
- My Requests data fetched from `GET /api/groups/requests/mine` (US-010).
- System admin status determined from `AuthContext` (`roles.includes('system-admin')`).
- Both tabs reuse the same shared table component with different column configurations (US-022 controls).
