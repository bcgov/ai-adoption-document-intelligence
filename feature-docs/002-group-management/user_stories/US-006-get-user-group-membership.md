# US-006: Get a User's Group Membership

## Summary
As a user or admin, I want to view a user's group membership to understand their access and organization.

## Actors
- Admin
- User

## Main Flow
1. User or admin requests a user's group membership.
2. System retrieves the user's group memberships from the database.
3. System returns the list of groups the user belongs to.

## Endpoint
- `GET /users/:userId/groups` — Get a user's group membership
  - Response: Array of group objects or error message

## Acceptance Criteria
- User or admin can retrieve a user's group memberships.
- System returns a complete list of groups for the user.
- System returns clear success or error messages.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
