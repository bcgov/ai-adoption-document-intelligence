# US-004: Approve a Group Membership Request

**As a** system admin,
**I want to** approve a pending group membership request,
**So that** the requesting user is automatically added to the group in a single atomic operation.

## Acceptance Criteria
- [ ] **Scenario 1**: Successful approval
    - **Given** a system admin and a `PENDING` membership request
    - **When** the admin calls the approve endpoint with the `request_id`
    - **Then** within a single database transaction: the user is added to the group AND the request status is updated to `APPROVED` with `actor_id`, `resolved_at`, and `updated_by` recorded

- [ ] **Scenario 2**: Request does not exist
    - **Given** a system admin
    - **When** they call the approve endpoint with a `request_id` that does not exist
    - **Then** the endpoint returns `404 Not Found`

- [ ] **Scenario 3**: Request is not in PENDING state
    - **Given** a system admin
    - **When** they attempt to approve a request with status other than `PENDING`
    - **Then** the endpoint returns `400 Bad Request`

- [ ] **Scenario 4**: Transaction rolls back on failure
    - **Given** a system admin approving a valid `PENDING` request
    - **When** either the group membership insertion or the status update fails mid-transaction
    - **Then** the entire transaction is rolled back, the request remains `PENDING`, and `500 Internal Server Error` is returned

- [ ] **Scenario 5**: Approval with optional reason
    - **Given** a system admin approving a request
    - **When** they include an optional reason in the request body
    - **Then** the `reason` field is stored on the request record

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Reuse the existing add-user-to-group database logic rather than duplicating it.
- No membership role is assigned at approval time — the user is simply added to the group.
- The approval and the status update must be wrapped in a single Prisma transaction to ensure atomicity.
- Admin identity is derived from the JWT token `sub` claim.
