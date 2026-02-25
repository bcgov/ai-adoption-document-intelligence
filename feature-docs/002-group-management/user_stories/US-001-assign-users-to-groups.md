# US-001: Assign Users to Groups

## Summary
As an admin, I want to assign users to groups so that group-based access and management can be handled efficiently.

## Actors
- Admin
- User

## Main Flow
1. Admin selects a group.
2. Admin assigns one or more users to the group.
3. System updates the group-user mapping table.
4. Admin can remove users from a group.

## Endpoints
- `POST /groups/:groupId/users` — Assign users to a group
  - Request body: `{ userIds: [string] }`
  - Response: Success or error message
- `DELETE /groups/:groupId/users/:userId` — Remove a user from a group
  - Response: Success or error message

## Acceptance Criteria
- Admin can assign multiple users to a group in a single request.
- Admin can remove a user from a group.
- System validates that users and groups exist before assignment.
- System returns clear success or error messages.
- Changes are reflected in the group-user mapping table.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
