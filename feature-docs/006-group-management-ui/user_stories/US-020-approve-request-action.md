# US-020: Approve Membership Request Action

**As a** group admin or system admin,
**I want to** approve a pending membership request directly from the requests table,
**So that** I can grant access quickly without a disruptive confirmation step.

## Acceptance Criteria
- [ ] **Scenario 1**: Clicking Approve on a PENDING request approves it immediately
    - **Given** a group admin or system admin on the Membership Requests tab with a PENDING request visible
    - **When** the `Approve` button for that request is clicked
    - **Then** the approve API is called and the request status updates to `APPROVED` in the UI

- [ ] **Scenario 2**: An optional reason field is presented before confirming
    - **Given** the Approve button is clicked
    - **When** a reason input is shown (e.g., inline or in a small popover/modal)
    - **Then** the user can optionally enter a reason before submitting the approval

- [ ] **Scenario 3**: Approve button is only visible on PENDING rows
    - **Given** the requests table
    - **When** a row has status other than `PENDING`
    - **Then** no Approve button is shown for that row

- [ ] **Scenario 4**: Error state is shown on API failure
    - **Given** the API returns an error
    - **When** the approval is attempted
    - **Then** an error notification or message is shown

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Call the existing `PATCH /api/groups/requests/:requestId/approve` endpoint.
- Use TanStack React Query mutation; invalidate the requests query on success.
- No full confirmation dialog required for this non-destructive action.
