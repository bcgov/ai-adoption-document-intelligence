# US-018: Leave Group Action on Group Detail Page

**As a** group member,
**I want to** leave a group I belong to via a confirmation dialog,
**So that** I can remove myself without needing an admin to do it.

## Acceptance Criteria
- [x] **Scenario 1**: Leave Group button is visible to the current authenticated member
    - **Given** the authenticated user is a member of the group
    - **When** the Members tab is rendered
    - **Then** a `Leave Group` button is shown in a clearly separated section (e.g., a danger zone or header action)

- [x] **Scenario 2**: Clicking Leave Group opens a confirmation dialog
    - **Given** the Members tab is visible
    - **When** the `Leave Group` button is clicked
    - **Then** a confirmation dialog is shown warning the user they will be removed from the group

- [x] **Scenario 3**: Confirming leaves the group and redirects
    - **Given** the confirmation dialog is open
    - **When** the user confirms
    - **Then** `DELETE /api/groups/:groupId/leave` is called; on success the user is redirected to `/groups`

- [x] **Scenario 4**: Cancelling the dialog does nothing
    - **Given** the confirmation dialog is open
    - **When** the user cancels
    - **Then** no API call is made and the user remains on the page

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use a Mantine `Modal` for the confirmation dialog.
- Use TanStack React Query mutation for the DELETE call.
- After a successful leave, redirect to `/groups` and invalidate the groups query.
