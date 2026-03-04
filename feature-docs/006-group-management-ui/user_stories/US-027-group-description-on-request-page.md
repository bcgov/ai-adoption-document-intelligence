# US-027: All Groups Tab on Groups Page

**As an** authenticated user on the Groups page,
**I want to** see a tab listing all available groups with their name and description,
**So that** I can discover groups and join or leave them from a single view.

## Acceptance Criteria
- [x] **Scenario 1**: All Groups tab renders in the Groups page tab bar
    - **Given** an authenticated user on the `/groups` page
    - **When** the page loads
    - **Then** an "All Groups" tab is visible alongside the existing "My Groups" and "My Requests" tabs

- [x] **Scenario 2**: All groups are shown in a table with Name, Description, and Actions columns
    - **Given** groups exist in the system
    - **When** the user views the All Groups tab
    - **Then** a table is rendered with columns: Name, Description, and Actions
    - **And** each row displays the group's name and description (description is omitted if null/undefined)

- [x] **Scenario 3**: A "Join" button is shown for groups the user is not a member of
    - **Given** the user is not a member of a group
    - **When** the All Groups tab is active
    - **Then** a "Join" button appears in the Actions column for that group
    - **And** clicking "Join" submits a membership request for the group

- [x] **Scenario 4**: A "Leave" button is shown for groups the user is already a member of
    - **Given** the user is a member of a group
    - **When** the All Groups tab is active
    - **Then** a "Leave" button appears in the Actions column for that group

- [x] **Scenario 5**: Leave requires confirmation before executing
    - **Given** the user clicks "Leave" on a group row
    - **When** the confirmation modal opens
    - **Then** the user must confirm before the leave request is sent to the API
    - **And** dismissing the modal does not call the API

- [x] **Scenario 6**: Loading and error states are handled
    - **Given** the API call for all groups is in flight
    - **When** the All Groups tab is active
    - **Then** a loading spinner is shown
    - **Given** the API call fails
    - **Then** an error message is displayed

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use `useAllGroups()` to fetch every group and `useMyGroups(user.sub)` to determine current membership.
- Use `useRequestMembership()` for the join action and `useLeaveGroup(groupId)` for the leave action.
- The leave confirmation modal follows the same pattern used on the Group Detail page.
- System admins see the same All Groups tab as regular users; membership-based join/leave logic applies equally.
- Use Mantine `Table`, `Button`, and `Modal` components for consistency.
