# US-007: Request Membership to a Group

## Summary
As a user, I want to request membership to a specific group so that I can join groups relevant to my interests or responsibilities.

## Actors
- User
- Admin (for approval)

## Main Flow
1. User selects a group and submits a membership request.
2. System records the request and notifies the admin.
3. Admin reviews and approves or rejects the request.
4. System updates the group-user mapping table and notifies the user.

## Endpoints
- `POST /groups/:groupId/membership-requests` — Submit a membership request
  - Request body: `{ userId: string, reason?: string }`
  - Response: Success or error message
- `POST /groups/:groupId/membership-requests/:requestId/approve` — Approve a membership request
  - Response: Success or error message
- `POST /groups/:groupId/membership-requests/:requestId/reject` — Reject a membership request
  - Response: Success or error message

## Acceptance Criteria
- User can submit a membership request for a group.
- Admin can approve or reject requests.
- System records and tracks membership requests.
- System returns clear success or error messages.
- Changes are reflected in the group-user mapping table.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
