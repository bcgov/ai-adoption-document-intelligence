# Leave Group

## Overview

Authenticated users who are roster members of a group can remove themselves from it via the **Leave Group** action on the Group Detail page.

## Frontend

### UI Flow

1. The user navigates to `/groups/:groupId` (Group Detail page).
2. On the **Members** tab, a **Danger Zone** section with a **Leave Group** button is rendered below the members table — visible only to users who are actual roster members (`isActualMember`).
3. Clicking **Leave Group** opens a Mantine `Modal` confirmation dialog.
4. Confirming calls `DELETE /api/groups/:groupId/leave`.
5. On success the user is redirected to `/groups` and all group-related React Query caches are invalidated.
6. Cancelling closes the dialog without making any API call.

### Hook

`useLeaveGroup(groupId: string)` in `apps/frontend/src/data/hooks/useGroups.ts`:

- **Mutation**: `DELETE /api/groups/:groupId/leave`
- **On success**: invalidates `["groups"]` query key
- **Redirect**: performed at the call-site via `onSuccess` callback + `useNavigate`

## Backend

| Method | Path | Auth |
|--------|------|------|
| DELETE | `/api/groups/:groupId/leave` | JWT (authenticated user) |

The endpoint removes the authenticated caller from the specified group. The user ID is extracted from the JWT token (`req.user.sub`). Returns `204 No Content` on success.

See `apps/backend-services/src/group/group.controller.ts` (`leaveGroup`) and `apps/backend-services/src/group/group.service.ts` (`leaveGroup`) for implementation details.

## Authorization

- Only roster members of the group can leave.
- System admins who are not roster members cannot call this endpoint (it will return an error since they are not members).
