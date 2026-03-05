# US-003: Add Searchable Group Selector to the App Header

**As a** logged-in user who belongs to one or more groups,
**I want to** select my active group from a searchable dropdown in the header,
**So that** I can switch working context without leaving the current page.

## Acceptance Criteria
- [x] **Scenario 1**: Selector visible for authenticated users
    - **Given** an authenticated user is on any page
    - **When** the header renders
    - **Then** the group selector dropdown is visible adjacent to the user avatar

- [x] **Scenario 2**: Dropdown lists only the user's groups
    - **Given** the user is not a system-admin
    - **When** the dropdown is opened
    - **Then** only the groups in `availableGroups` from `GroupContext` are listed

- [x] **Scenario 3**: Currently active group shown as selected value
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** the dropdown renders
    - **Then** the `activeGroup` name is displayed as the current value

- [x] **Scenario 4**: Selecting a group updates context
    - **Given** the user opens the dropdown and selects a different group
    - **When** the selection is confirmed
    - **Then** `setActiveGroup` is called with the selected group and the header reflects the new selection

- [x] **Scenario 5**: Dropdown is searchable
    - **Given** the user opens the dropdown
    - **When** the user types part of a group name
    - **Then** the list is filtered to show only matching groups

- [x] **Scenario 6**: Empty-groups state shows membership prompt
    - **Given** the user has no group memberships (`availableGroups` is empty)
    - **When** the header renders
    - **Then** a non-interactive message (e.g., "No groups — request membership") is shown instead of the dropdown, and clicking it navigates to `/request-membership`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- System-admin users see all groups (sourced from `availableGroups`, which already contains all groups for admins via the `/me` response).
- The selector should integrate with the existing header/app-bar component.
- The empty-groups message must link to the Group Membership Request page (US-005).
- Frontend component tests must cover normal and empty-groups rendering.
