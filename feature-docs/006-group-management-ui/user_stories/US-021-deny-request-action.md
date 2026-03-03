# US-021: Deny Membership Request Action

**As a** group admin or system admin,
**I want to** deny a pending membership request with an optional reason via a confirmation dialog,
**So that** I can reject requests with a clear confirmation step and an optional explanation.

## Acceptance Criteria
- [ ] **Scenario 1**: Clicking Deny opens a confirmation dialog
    - **Given** a group admin or system admin on the Membership Requests tab with a PENDING request visible
    - **When** the `Deny` button for that request is clicked
    - **Then** a confirmation dialog is shown with an optional reason text field

- [ ] **Scenario 2**: Confirming the dialog denies the request
    - **Given** the confirmation dialog is open (with or without a reason)
    - **When** the user confirms
    - **Then** `PATCH /api/groups/requests/:requestId/deny` is called with the optional reason, the dialog closes, and the request status updates to `DENIED`

- [ ] **Scenario 3**: Cancelling the dialog does nothing
    - **Given** the confirmation dialog is open
    - **When** the user cancels
    - **Then** no API call is made and the request remains PENDING

- [ ] **Scenario 4**: Deny button is only visible on PENDING rows
    - **Given** the requests table
    - **When** a row has status other than `PENDING`
    - **Then** no Deny button is shown for that row

- [ ] **Scenario 5**: Error state is shown on API failure
    - **Given** the API returns an error
    - **When** the denial is attempted
    - **Then** an error notification or message is displayed

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use a Mantine `Modal` for the confirmation/reason dialog.
- Use TanStack React Query mutation; invalidate the requests query on success.
- The reason field is optional; submit even if left blank.
