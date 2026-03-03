# Group Detail Page (`/groups/:groupId`)

## Overview

The Group Detail page renders at `/groups/:groupId` and provides a tabbed interface for viewing information about a specific group. It includes the **Members** tab (for group members, admins, and system admins) and the **Membership Requests** tab (for group admins and system admins only).

## Members Tab

Displays all current members of the group in a table.

| Column | Description |
|--------|-------------|
| Email | The member's email address |
| Joined | The date the user joined the group |
| Actions | Remove button (admins only) |

- **Data source**: `GET /api/groups/:groupId/members`
- **Access**: Group members, group admins, and system admins only. The tab is hidden for users who are not members of the group.

### Remove Action

The **Remove** button per row is visible only to group admins and system admins. Clicking it calls `DELETE /api/groups/:groupId/members/:userId` and automatically refreshes the member list on success.

### Leave Group Action

A **Leave Group** button is shown in a **Danger Zone** section below the members table. It is visible only to users who are actual roster members of the group (i.e. present in `availableGroups`). System admins who are not roster members do not see this button.

Clicking it opens a Mantine `Modal` confirmation dialog. On confirmation, `DELETE /api/groups/:groupId/leave` is called. On success the user is redirected to `/groups` and all group-related queries are invalidated.

## Membership Requests Tab

Displays all membership requests for the group in a filterable table. Only visible to group admins and system admins.

| Column | Description |
|--------|-------------|
| Email | The requesting user's email address |
| Requested | The date the request was created |
| Reason | The optional reason provided by the requester |
| Status | The current status (`PENDING`, `APPROVED`, `DENIED`, `CANCELLED`) |
| Actions | Action buttons (reserved for future approve/deny actions — US-020, US-021) |

- **Data source**: `GET /api/groups/:groupId/requests?status=<status>`
- **Access**: Group admins and system admins only.
- **Default filter**: `PENDING`
- **Available status filters**: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`

The status filter is rendered as a Mantine `Select` component. Changing the filter re-fetches requests with the selected status.

## Component Structure

```
GroupDetailPage
├── MembersTab             – Table of group members with optional Remove and Leave actions
└── RequestsTab            – Table of membership requests with status filter (admin-only)
```

## Navigation

The Groups page (`/groups`) navigates to this page when a group row is clicked. The App router handles `/groups/:groupId` inside `MainApp`, rendering `GroupDetailPage` in place of the main content area.

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useGroupMembers(groupId)` | `GET /api/groups/:groupId/members` | MembersTab |
| `useRemoveGroupMember(groupId)` | `DELETE /api/groups/:groupId/members/:userId` | MembersTab |
| `useLeaveGroup(groupId)` | `DELETE /api/groups/:groupId/leave` | MembersTab |
| `useGroupRequests(groupId, status?)` | `GET /api/groups/:groupId/requests?status=...` | RequestsTab |
| `useMyGroups(userId)` | `GET /api/groups/user/:userId` | GroupDetailPage (admin role lookup) |
| `useGroup()` (GroupContext) | — (cached from `/me`) | GroupDetailPage (membership check + group name) |

## Authorization

| Role | Can see Members tab | Can see Remove button | Can see Leave Group button | Can see Requests tab |
|------|--------------------|-----------------------|---------------------------|----------------------|
| Non-member | No | No | No | No |
| Group member (`MEMBER`) | Yes | No | Yes | No |
| Group admin (`ADMIN`) | Yes | Yes | Yes | Yes |
| System admin (not a roster member) | Yes | Yes | No | Yes |
| System admin (also a roster member) | Yes | Yes | Yes | Yes |

- Membership is determined by checking `useGroup().availableGroups` (populated from `GET /api/auth/me` via GroupContext).
- `isActualMember` is true when `availableGroups` contains the current group (used for the Leave Group button).
- Admin role is determined by checking `useMyGroups` result for `role === "ADMIN"` on the current group, or by `AuthContext.isSystemAdmin`.
- The current group ID is resolved from the URL via `useMatch("/groups/:groupId")` rather than `useParams`, since the page renders inside a wildcard route.

## State Management

- `useRemoveGroupMember` invalidates `["groups", groupId, "members"]` on success.
- `useLeaveGroup` invalidates all `["groups"]` queries on success and the caller redirects to `/groups`.
- `useGroupRequests` query key is `["groups", groupId, "requests", status]`; changing the status filter causes an automatic re-fetch.
