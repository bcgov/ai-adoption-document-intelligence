# Group Detail Page (`/groups/:groupId`)

## Overview

The Group Detail page renders at `/groups/:groupId` and provides a tabbed interface for viewing information about a specific group. It includes the **Members** tab (for group members, admins, and system admins) and the **Membership Requests** tab (for group admins and system admins only).

## Members Tab

Displays all current members of the group in a table.

| Column | Description |
|--------|-------------|
| Email | The member's email address |
| Joined | The date the user joined the group |
| Role | The member's role — admins see an editable dropdown, other members see a read-only label |
| Actions | Remove button (admins only) |

- **Data source**: `GET /api/groups/:groupId/members`
- **Access**: Group members, group admins, and system admins only. The tab is hidden for users who are not members of the group.

### Change Role Action

Group admins and system admins see a role `Select` (`EDITOR` / `REVIEWER` / `ADMIN`) per row. Changing it calls `PATCH /api/groups/:groupId/members/:userId/role` and refreshes the member list on success.

### Remove Action

The **Remove** button per row is visible only to group admins and system admins. Clicking it opens a confirmation modal; confirming calls `DELETE /api/groups/:groupId/members/:userId` and automatically refreshes the member list on success.

## Header Actions Menu

The page header contains a single **Actions** dropdown menu whose items depend on the caller's role:

### Leave Group (members only)

Visible only to users who are actual roster members of the group (determined from the `useMyGroups` result). System admins who are not roster members do not see this item.

Clicking it opens a Mantine `Modal` confirmation dialog. On confirmation, `DELETE /api/groups/:groupId/leave` is called. On success the user is redirected to `/groups` and all group-related queries are invalidated.

### Join (non-members who are not system admins)

Non-members see a **Join** item, which submits a membership request via `POST /api/groups/request`. When the user already has a pending request for this group (checked via `useMyRequests("PENDING")`), the item is disabled and labelled "Request Pending".

### Edit Group (System Admin only)

Clicking it opens a Mantine `Modal` form pre-populated with the group's current `Name` and `Description`. Submitting the form calls `PATCH /api/groups/:groupId`. On success the modal closes, a green notification is shown, and the all-groups query (`["groups", "all"]`) is invalidated so the page reflects the updated values.

If the API returns an error (e.g. duplicate name), the error message is displayed inline within the modal and the modal remains open.

Client-side validation: the `Name` field is required — submitting with an empty name shows an inline error without calling the API.

### Delete Group (System Admin only)

Clicking it opens a confirmation modal. Confirming calls `DELETE /api/groups/:groupId` (a soft delete). On success the user is redirected to `/groups` and the all-groups query is invalidated.

## Membership Requests Tab

Displays all membership requests for the group in a filterable table. Only visible to group admins and system admins.

| Column | Description |
|--------|-------------|
| Email | The requesting user's email address |
| Requested | The date the request was created |
| Resolved | The date the request was resolved (or `-`) |
| Reason | The optional reason provided by the requester |
| Status | The current status (`PENDING`, `APPROVED`, `DENIED`, `CANCELLED`) |
| Actions | Approve / Deny buttons on `PENDING` rows; resolved and cancelled rows are read-only |

- **Data source**: `GET /api/groups/:groupId/requests?status=<status>`
- **Access**: Group admins and system admins only.
- **Default filter**: `PENDING`
- **Available status filters**: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`, `ALL`

The status filter is rendered as a Mantine `Select` component. Changing the filter re-fetches requests with the selected status. The shared `RequestsTable` component also provides a search field and sortable columns.

### Approve / Deny Actions

Clicking **Approve** or **Deny** opens a modal with an optional reason textarea. Confirming calls `PATCH /api/groups/requests/:requestId/approve` or `PATCH /api/groups/requests/:requestId/deny` respectively and refreshes the request (and, for approve, member) lists.

## Component Structure

```
GroupDetailPage
├── MembersTab             – Table of group members with role dropdown and Remove action (admin-only actions)
└── GroupRequestsTab       – Table of membership requests with status filter and approve/deny actions (admin-only)
```

Both live in `apps/frontend/src/components/group/`.

## Navigation

The Groups page (`/groups`) navigates to this page when a group row is clicked. The route is registered as a `groups/:groupId` child route of the root route in `App.tsx`, rendering `GroupDetailPage` inside the `RootLayout` shell.

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useGroupMembers(groupId)` | `GET /api/groups/:groupId/members` | MembersTab |
| `useRemoveGroupMember(groupId)` | `DELETE /api/groups/:groupId/members/:userId` | MembersTab |
| `useUpdateGroupMemberRole(groupId)` | `PATCH /api/groups/:groupId/members/:userId/role` | MembersTab |
| `useLeaveGroup(groupId)` | `DELETE /api/groups/:groupId/leave` | GroupDetailPage (leave modal) |
| `useUpdateGroup(groupId)` | `PATCH /api/groups/:groupId` | GroupDetailPage (edit group modal) |
| `useDeleteGroup(groupId)` | `DELETE /api/groups/:groupId` | GroupDetailPage (delete modal) |
| `useRequestMembership()` | `POST /api/groups/request` | GroupDetailPage (Join menu item) |
| `useMyRequests("PENDING")` | `GET /api/groups/requests/mine?status=PENDING` | GroupDetailPage (pending-request check) |
| `useGroupRequests(groupId, status?)` | `GET /api/groups/:groupId/requests?status=...` | GroupRequestsTab |
| `useApproveMembershipRequest(groupId)` | `PATCH /api/groups/requests/:requestId/approve` | GroupRequestsTab |
| `useDenyMembershipRequest(groupId)` | `PATCH /api/groups/requests/:requestId/deny` | GroupRequestsTab |
| `useMyGroups(userId)` | `GET /api/groups/user/:userId` | GroupDetailPage (membership + admin role lookup) |
| `useAllGroups()` | `GET /api/groups` | GroupDetailPage (group name + description) |

## Authorization

| Role | Members tab | Remove / role change | Leave Group | Join | Requests tab | Edit Group | Delete Group |
|------|-------------|----------------------|-------------|------|--------------|------------|--------------|
| Non-member | No | No | No | Yes | No | No | No |
| Group member (`EDITOR`) | Yes | No | Yes | No | No | No | No |
| Group admin (`ADMIN`) | Yes | Yes | Yes | No | Yes | No | No |
| System admin (not a roster member) | Yes | Yes | No | No | Yes | Yes | Yes |
| System admin (also a roster member) | Yes | Yes | Yes | No | Yes | Yes | Yes |

- Membership (`isMember`) is determined by checking the `useMyGroups` result (`GET /api/groups/user/:userId`) for the current group — it gates the Members tab and the Leave Group item.
- Admin role (`isAdmin`) is determined by checking `useMyGroups` result for `role === "ADMIN"` on the current group, or by `AuthContext.isSystemAdmin`.
- The current group ID is resolved from the URL via `useMatch("/groups/:groupId")`.

## State Management

- `useRemoveGroupMember` and `useUpdateGroupMemberRole` invalidate `["groups", groupId, "members"]` on success.
- `useLeaveGroup` invalidates all `["groups"]` queries on success and the caller redirects to `/groups`.
- `useUpdateGroup` and `useDeleteGroup` invalidate `["groups", "all"]` on success; delete also redirects to `/groups`.
- `useApproveMembershipRequest` invalidates `["groups", groupId, "requests"]`, `["groups", groupId, "members"]`, `["groups", "user"]`, and `["groups", "requests", "mine"]`; `useDenyMembershipRequest` invalidates `["groups", groupId, "requests"]`.
- `useGroupRequests` query key is `["groups", groupId, "requests", status]`; changing the status filter causes an automatic re-fetch.
