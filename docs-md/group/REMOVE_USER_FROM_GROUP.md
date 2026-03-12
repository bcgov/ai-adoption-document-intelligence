# Remove User from Group

## API Endpoint

`DELETE /api/groups/:groupId/members/:userId`

Removes a user from a group.

### Response
- `200 OK` with success message
- `404 Not Found` if group or user not found
- `400 Bad Request` if user is not a member of the group

## Description
Removes the specified user from the specified group. Throws an error if the group or user does not exist, or if the user is not a member of the group.

## Frontend (Group Detail Page — Members Tab)

Group admins and system admins see a **Remove** button for each row in the Members table.

### Confirmation Dialog

Clicking **Remove** opens a Mantine `Modal` asking the admin to confirm the removal. The dialog shows the member's email address.

- **Confirm** — fires `DELETE /api/groups/:groupId/members/:userId` via the `useRemoveGroupMember` mutation, then closes the dialog and invalidates the members query to refresh the list.
- **Cancel** — closes the dialog without making any API call.

### Error Handling

If the API call fails, a red error notification is shown via `@mantine/notifications` and the dialog is closed.
