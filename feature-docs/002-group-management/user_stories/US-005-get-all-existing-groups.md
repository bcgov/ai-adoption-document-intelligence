# US-005: Get All Existing Groups

## Summary
As an admin or user, I want to retrieve a list of all existing groups for management or selection purposes.

## Actors
- Admin
- User

## Main Flow
1. User or admin requests the list of groups.
2. System retrieves all groups from the database.
3. System returns the list of groups.

## Endpoint
- `GET /groups` — Get all groups
  - Response: Array of group objects or error message

## Acceptance Criteria
- User or admin can retrieve all groups.
- System returns a complete list of groups.
- System returns clear success or error messages.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
