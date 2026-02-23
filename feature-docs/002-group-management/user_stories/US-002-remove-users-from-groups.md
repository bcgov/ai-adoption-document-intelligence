# US-002: Remove Users from Groups

## Summary
As an admin, I want to remove users from groups so that group memberships can be managed and updated as needed.

## Actors
- Admin

## Main Flow
1. Admin selects a group and user to remove.
2. Admin submits a request to remove the user from the group.
3. System validates the group and user exist.
4. System updates the group-user mapping table.
5. System returns confirmation.

## Endpoint
- `DELETE /groups/:groupId/users/:userId` — Remove a user from a group
  - Response: Success or error message

## Acceptance Criteria
- Admin can remove a user from a group.
- System validates group and user existence before removal.
- System returns clear success or error messages.
- Changes are reflected in the group-user mapping table.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
