# US-023: Cancel Membership Request Action on My Requests Tab

**As an** authenticated user,
**I want to** cancel a pending membership request via a confirmation dialog,
**So that** I can withdraw a request I no longer want to proceed with.

## Acceptance Criteria
- [ ] **Scenario 1**: Cancel button is visible on PENDING rows only
    - **Given** the My Requests table is rendered
    - **When** a row has status `PENDING`
    - **Then** a `Cancel` button is shown in the Actions column for that row

- [ ] **Scenario 2**: Clicking Cancel opens a confirmation dialog
    - **Given** a PENDING request row is visible
    - **When** the `Cancel` button is clicked
    - **Then** a confirmation dialog is shown asking the user to confirm the cancellation

- [ ] **Scenario 3**: Confirming cancels the request
    - **Given** the confirmation dialog is open
    - **When** the user confirms
    - **Then** the cancel endpoint is called, the dialog closes, and the request status updates to `CANCELLED` in the UI

- [ ] **Scenario 4**: Cancelling the dialog does nothing
    - **Given** the confirmation dialog is open
    - **When** the user dismisses it
    - **Then** no API call is made and the request remains PENDING

- [ ] **Scenario 5**: Error state is shown on API failure
    - **Given** the API returns an error
    - **When** the cancellation is attempted
    - **Then** an error notification or message is displayed

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use a Mantine `Modal` for the confirmation dialog.
- Use TanStack React Query mutation; invalidate the my-requests query on success.
- Confirm the exact cancel endpoint path (e.g., `POST /api/groups/requests/:requestId/cancel` or `DELETE /api/groups/requests/:requestId`) against the existing backend implementation before coding.
