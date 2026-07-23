# Remove User from Group

## API Endpoint

`DELETE /api/groups/:groupId/members/:userId`

Removes a user from a group.

### Response
- `200 OK` with `{ "success": true }`
- `403 Forbidden` if the caller is not a group admin of the group or a system admin
- `404 Not Found` if the group does not exist or the user is not a member of the group

## Description
Removes the specified user from the specified group by deleting the `UserGroup` record. Returns `404 Not Found` if the group does not exist or the user is not a member. Authorization is enforced by the `@Identity` guard (`groupIdFrom` the `groupId` path param, minimum role `ADMIN`); system admins bypass the membership check. A `member_removed` audit event is recorded.

## Frontend (Group Detail Page — Members Tab)

Group admins and system admins see a **Remove** button for each row in the Members table.

### Confirmation Dialog

Clicking **Remove** opens a Mantine `Modal` asking the admin to confirm the removal. The dialog shows the member's email address.

- **Remove** (confirm button) — fires `DELETE /api/groups/:groupId/members/:userId` via the `useRemoveGroupMember` mutation, then closes the dialog and invalidates the members query to refresh the list.
- **Cancel** — closes the dialog without making any API call.

The Members tab (`apps/frontend/src/components/group/MembersTab.tsx`) also lets admins change a member's role via a per-row dropdown (`PATCH /api/groups/:groupId/members/:userId/role`).

### Error Handling

If the API call fails, a red error notification is shown via the shared `notifications` API from `apps/frontend/src/ui/` and the dialog is closed.
