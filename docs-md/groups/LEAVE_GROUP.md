# Leave Group

## Overview

Authenticated users who are roster members of a group can remove themselves from it via the **Leave Group** action on the Group Detail page.

## Frontend

### UI Flow

1. The user navigates to `/groups/:groupId` (Group Detail page).
2. The page header's **Actions** menu contains a **Leave Group** item — visible only to users who are roster members (`isMember`, derived from `useMyGroups`).
3. Clicking **Leave Group** opens a Mantine `Modal` confirmation dialog.
4. Confirming (the red **Leave** button) calls `DELETE /api/groups/:groupId/leave`.
5. On success the user is redirected to `/groups` and all group-related React Query caches are invalidated (`["groups"]` query key).
6. Cancelling closes the dialog without making any API call. If the API call fails, a red error notification is shown.

The Groups page (`/groups`) **My Groups** and **All Groups** tabs also expose a per-row **Leave** action with the same confirmation flow.

### Hook

`useLeaveGroup(groupId: string)` in `apps/frontend/src/data/hooks/useGroups.ts`:

- **Mutation**: `DELETE /api/groups/:groupId/leave`
- **On success**: invalidates `["groups"]` query key
- **Redirect**: performed at the call-site via `onSuccess` callback + `useNavigate`

## Backend

| Method | Path | Auth |
|--------|------|------|
| DELETE | `/api/groups/:groupId/leave` | JWT (authenticated user) |

The endpoint removes the authenticated caller from the specified group. The user ID is taken from the resolved identity (`req.resolvedIdentity.userId`, populated by the `IdentityGuard` from the JWT `sub` claim). Returns `200 OK` with `{ "success": true }` on success, and records a `user_left_group` audit event.

See `apps/backend-services/src/group/group.controller.ts` (`leaveGroup`) and `apps/backend-services/src/group/group.service.ts` (`leaveGroup`) for implementation details.

## Authorization

- Only roster members of the group can leave. The `@Identity({ groupPermissions: { groupIdFrom: { param: "groupId" }, requiredPermissions: [Permission.GROUP_LEAVE] } })` guard rejects non-members with `403 Forbidden`.
- System admins bypass the guard's membership check, but if they are not roster members the delete of the `UserGroup` record fails, so the call still returns an error.
