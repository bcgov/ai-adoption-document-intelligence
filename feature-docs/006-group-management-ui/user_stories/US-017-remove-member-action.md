# US-017: Remove Member Action on Group Detail Page

**As a** group admin or system admin,
**I want to** remove a member from a group via a confirmation dialog,
**So that** I can manage group membership with a clear confirmation step.

## Acceptance Criteria
- [ ] **Scenario 1**: Clicking Remove opens a confirmation dialog
    - **Given** a group admin or system admin on the Members tab
    - **When** the Remove button for a member row is clicked
    - **Then** a confirmation dialog is displayed asking to confirm the removal

- [ ] **Scenario 2**: Confirming the dialog removes the member
    - **Given** the confirmation dialog is open
    - **When** the user confirms
    - **Then** `DELETE /api/groups/:groupId/members/:userId` is called, the dialog closes, and the members list refreshes

- [ ] **Scenario 3**: Cancelling the dialog does nothing
    - **Given** the confirmation dialog is open
    - **When** the user cancels
    - **Then** no API call is made and the member remains in the list

- [ ] **Scenario 4**: Error state is shown on API failure
    - **Given** the API returns an error
    - **When** the removal is attempted
    - **Then** an error notification or message is displayed

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use a Mantine `Modal` for the confirmation dialog.
- Use TanStack React Query mutation for the DELETE call.
- Invalidate the members query on success to refresh the list.
