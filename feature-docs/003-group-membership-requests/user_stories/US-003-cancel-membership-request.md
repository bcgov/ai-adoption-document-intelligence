# US-003: Cancel a Group Membership Request

**As an** authenticated user,
**I want to** cancel my own pending membership request,
**So that** I can withdraw a request I no longer need without admin involvement.

## Acceptance Criteria
- [ ] **Scenario 1**: Successful cancellation
    - **Given** an authenticated user with a `PENDING` request they own
    - **When** they call the cancel endpoint with the `request_id`
    - **Then** the request status is updated to `CANCELLED`, `actor_id` is set to the user's ID, `resolved_at` is set to now, and `updated_by` is set to the user's ID

- [ ] **Scenario 2**: Request does not exist
    - **Given** an authenticated user
    - **When** they call the cancel endpoint with a `request_id` that does not exist
    - **Then** the endpoint returns `404 Not Found`

- [ ] **Scenario 3**: Request belongs to a different user
    - **Given** an authenticated user
    - **When** they call the cancel endpoint with a `request_id` owned by a different user
    - **Then** the endpoint returns `403 Forbidden`

- [ ] **Scenario 4**: Request is not in PENDING state
    - **Given** an authenticated user with a request that has already been resolved (`APPROVED`, `DENIED`, or `CANCELLED`)
    - **When** they attempt to cancel it
    - **Then** the endpoint returns `400 Bad Request`

- [ ] **Scenario 5**: Cancellation with optional reason
    - **Given** an authenticated user with a `PENDING` request
    - **When** they cancel it and include an optional reason in the request body
    - **Then** the `reason` field is stored on the record

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- A `CANCELLED` state is distinct from `DENIED` — `CANCELLED` is initiated by the requesting user; `DENIED` is initiated by an admin.
- `reason` is optional; if not supplied, it remains null.
