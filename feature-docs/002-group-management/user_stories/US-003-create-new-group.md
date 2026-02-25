# US-003: Create a New Group

## Summary
As an admin, I want to create new groups so that users can be organized for access and management.

## Actors
- Admin

## Main Flow
1. Admin submits a request to create a group.
2. System validates group name and creates the group.
3. System returns the new group details.

## Endpoint
- `POST /groups` — Create a new group
  - Request body: `{ name: string, description?: string }`
  - Response: Group object or error message

## Acceptance Criteria
- Admin can create a group with a unique name.
- System validates group name uniqueness.
- System returns clear success or error messages.
- Group is added to the groups table.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
