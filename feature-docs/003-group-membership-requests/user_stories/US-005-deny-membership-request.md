# US-005: Deny a Group Membership Request

**As a** system admin,
**I want to** deny a pending group membership request,
**So that** the requesting user is not added to the group and the decision is recorded for audit.

## Acceptance Criteria
- [x] **Scenario 1**: Successful denial
    - **Given** a system admin and a `PENDING` membership request
    - **When** the admin calls the deny endpoint with the `request_id`
    - **Then** the request status is updated to `DENIED`, with `actor_id` set to the admin's ID, `resolved_at` set to now, and `updated_by` set to the admin's ID

- [x] **Scenario 2**: Request does not exist
    - **Given** a system admin
    - **When** they call the deny endpoint with a `request_id` that does not exist
    - **Then** the endpoint returns `404 Not Found`

- [x] **Scenario 3**: Request is not in PENDING state
    - **Given** a system admin
    - **When** they attempt to deny a request with status other than `PENDING`
    - **Then** the endpoint returns `400 Bad Request`

- [x] **Scenario 4**: Denial with optional reason
    - **Given** a system admin denying a request
    - **When** they include an optional reason in the request body
    - **Then** the `reason` field is stored on the request record

- [x] **Scenario 5**: Denied record is retained
    - **Given** a request that has been `DENIED`
    - **When** querying the request history
    - **Then** the record still exists with all audit fields intact (not deleted)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `DENIED` is a distinct state from `CANCELLED`; denial is an admin action, cancellation is a user action.
- `reason` is optional; if not supplied, it remains null.
- Admin identity is derived from the JWT token `sub` claim.
- No user notification mechanism is in scope for this feature.
