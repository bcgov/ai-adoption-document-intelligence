# Group Detail Page (`/groups/:groupId`)

## Overview

The Group Detail page renders at `/groups/:groupId` and provides a tabbed interface for viewing information about a specific group. Currently it includes the **Members** tab.

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

## Component Structure

```
GroupDetailPage
└── MembersTab             – Table of group members with optional Remove action
```

## Navigation

The Groups page (`/groups`) navigates to this page when a group row is clicked. The App router handles `/groups/:groupId` inside `MainApp`, rendering `GroupDetailPage` in place of the main content area.

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useGroupMembers(groupId)` | `GET /api/groups/:groupId/members` | MembersTab |
| `useRemoveGroupMember(groupId)` | `DELETE /api/groups/:groupId/members/:userId` | MembersTab |
| `useMyGroups(userId)` | `GET /api/groups/user/:userId` | GroupDetailPage (admin role lookup) |
| `useGroup()` (GroupContext) | — (cached from `/me`) | GroupDetailPage (membership check + group name) |

## Authorization

| Role | Can see Members tab | Can see Remove button |
|------|--------------------|-----------------------|
| Non-member | No | No |
| Group member (`MEMBER`) | Yes | No |
| Group admin (`ADMIN`) | Yes | Yes |
| System admin | Yes | Yes |

- Membership is determined by checking `useGroup().availableGroups` (populated from `GET /api/auth/me` via GroupContext).
- Admin role is determined by checking `useMyGroups` result for `role === "ADMIN"` on the current group, or by `AuthContext.isSystemAdmin`.
- The current group ID is resolved from the URL via `useMatch("/groups/:groupId")` rather than `useParams`, since the page renders inside a wildcard route.

## State Management

- `useRemoveGroupMember` invalidates `["groups", groupId, "members"]` on success.
