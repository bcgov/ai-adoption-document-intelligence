# Groups Page (`/groups`)

## Overview

The Groups page is a tabbed interface at `/groups` that consolidates group-related information for authenticated users. It includes two tabs: **My Groups** and **My Requests**.

## My Groups Tab

Displays the groups associated with the authenticated user.

| User Type | Groups Shown |
|-----------|-------------|
| Regular user | Only the groups the user belongs to (fetched from `GET /api/groups/user/:userId`) |
| System admin | All active (non-soft-deleted) groups (fetched from `GET /api/groups`) |

Clicking a row navigates to `/groups/:groupId` (group detail page).

## My Requests Tab

Displays all membership requests submitted by the authenticated user, with status filtering.

- **Data source**: `GET /api/groups/requests/mine?status={filter}`
- **Default filter**: `PENDING`
- **Available filters**: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`
- **Columns**: Group, Submitted (date), Status, Reason, Actions
- **Cancel action**: For `PENDING` requests only, a Cancel button calls `PATCH /api/groups/requests/:requestId/cancel` and invalidates the request list cache.

## Component Structure

```
GroupsPage
├── MyGroupsTab            – Groups table (admin: all groups, user: own groups)
└── MyRequestsTab          – Requests table with status filter and cancel action
```

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useMyGroups(userId, options?)` | `GET /api/groups/user/:userId` | MyGroupsTab (non-admin) |
| `useAllGroups(options?)` | `GET /api/groups` | MyGroupsTab (system admin) |
| `useMyRequests(status?)` | `GET /api/groups/requests/mine` | MyRequestsTab |
| `useCancelMembershipRequest()` | `PATCH /api/groups/requests/:requestId/cancel` | MyRequestsTab |

## State Management

- Tab selection is handled by Mantine's `Tabs` component with `defaultValue="my-groups"`.
- Status filter state is local to `MyRequestsTab` (React `useState`).
- On successful cancellation, the `["groups", "requests", "mine"]` TanStack Query cache key is invalidated to refetch the updated list.

## Authorization

System admin status is determined from `AuthContext.isSystemAdmin` (evaluates `roles.includes("system-admin")`).
