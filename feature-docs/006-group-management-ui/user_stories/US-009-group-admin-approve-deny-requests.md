# US-009: Allow Group Admins to Approve and Deny Membership Requests

**As a** group admin,
**I want to** approve or deny membership requests for my group,
**So that** I can manage group membership without requiring a system admin.

## Acceptance Criteria
- [x] **Scenario 1**: Group admin successfully approves a request
    - **Given** a caller who is a group admin for the group the request belongs to and a `PENDING` request
    - **When** `PATCH /api/groups/requests/:requestId/approve` is called
    - **Then** a `200 OK` response is returned and the request status is updated to `APPROVED`

- [x] **Scenario 2**: Group admin successfully denies a request
    - **Given** a caller who is a group admin for the group the request belongs to and a `PENDING` request
    - **When** `PATCH /api/groups/requests/:requestId/deny` is called
    - **Then** a `200 OK` response is returned and the request status is updated to `DENIED`

- [x] **Scenario 3**: System admin can still approve and deny
    - **Given** a caller who is a system admin
    - **When** either approve or deny endpoint is called
    - **Then** the operation succeeds as before

- [x] **Scenario 4**: Regular group member receives `403`
    - **Given** a caller who is a member of the group but not a group admin or system admin
    - **When** either approve or deny endpoint is called
    - **Then** a `403 Forbidden` response is returned

- [x] **Scenario 5**: Group admin for a different group receives `403`
    - **Given** a caller who is a group admin for group A tries to act on a request for group B
    - **When** either approve or deny endpoint is called
    - **Then** a `403 Forbidden` response is returned

- [x] **Scenario 6**: Unit tests pass
    - **Given** the updated authorization logic
    - **When** unit tests are run
    - **Then** all new and existing tests pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Update the authorization check on the existing approve and deny endpoints; do not create new endpoints.
- The request's `group_id` is used to look up whether the caller has a `UserGroup` record with `role = ADMIN` for that group.
- Update related controller/service unit tests.
