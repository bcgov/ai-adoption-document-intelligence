# US-004: Delete an Existing Group

## Summary
As an admin, I want to delete existing groups to remove obsolete or unused groupings.

## Actors
- Admin

## Main Flow
1. Admin selects a group to delete.
2. System validates the group exists.
3. System deletes the group and updates related mappings.
4. System returns confirmation.

## Endpoint
- `DELETE /groups/:groupId` — Delete a group
  - Response: Success or error message

## Acceptance Criteria
- Admin can delete a group by ID.
- System validates group existence before deletion.
- System returns clear success or error messages.
- Group and related mappings are removed from the database.

## Notes
- No document-specific logic; must support arbitrary workloads.
- Proper typing required for all endpoints.
- Related tests and documentation must be updated.
