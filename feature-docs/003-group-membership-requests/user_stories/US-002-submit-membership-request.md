# US-002: Submit a Group Membership Request

**As an** authenticated user,
**I want to** submit a request to join a specific group,
**So that** an admin can review and approve my access.

## Acceptance Criteria
- [x] **Scenario 1**: Successful request submission
    - **Given** an authenticated user and a valid `group_id` for a group they are not already a member of
    - **When** the user calls the request-membership endpoint with that `group_id`
    - **Then** a new `GroupMembershipRequest` record is created with `status = PENDING`, `user_id` from the JWT `sub` claim, and `created_at` / `created_by` set to now / the requesting user

- [x] **Scenario 2**: Group does not exist
    - **Given** an authenticated user
    - **When** they submit a request with a `group_id` that does not exist
    - **Then** the endpoint returns `404 Not Found`

- [x] **Scenario 3**: User is already a member of the group
    - **Given** an authenticated user who is already a member of the target group
    - **When** they submit a membership request for that group
    - **Then** the endpoint returns success silently and no new record is created

- [x] **Scenario 4**: User already has a pending request for the group
    - **Given** an authenticated user who already has a `PENDING` request for the target group
    - **When** they submit another membership request for the same group
    - **Then** the endpoint returns success silently and no duplicate record is created

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The controller endpoint for this operation already exists; this story covers the service and repository logic.
- User identity (`user_id`) must be derived solely from the `sub` field of the JWT token payload — it must not be accepted from the request body.
- `created_by` and `user_id` will be the same value (the requesting user's ID) on creation.
