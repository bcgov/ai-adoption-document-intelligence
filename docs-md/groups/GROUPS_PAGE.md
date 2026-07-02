# Groups Page (`/groups`)

## Overview

The Groups page is a tabbed interface at `/groups` that consolidates group-related information for authenticated users. It includes three tabs: **My Groups**, **My Requests**, and **All Groups**. System admins also see a **Create Group** button to provision new groups.

## Create Group (System Admins Only)

A **Create Group** button appears in the page header for users with the `system-admin` role. Clicking it opens a modal form with:

- **Name** (required) — the group's unique display name
- **Description** (optional) — a short description of the group

On successful submission, `POST /api/groups` is called, the modal closes, a success notification is shown, and the All Groups cache is invalidated to refresh the list. Server-side errors (e.g. duplicate name) are displayed inline inside the modal without closing it. Client-side validation ensures the Name field is not empty before submission.

## My Groups Tab

Displays the groups associated with the authenticated user.

| User Type | Groups Shown |
|-----------|-------------|
| Regular user | Only the groups the user belongs to (fetched from `GET /api/groups/user/:userId`) |
| System admin | All active (non-soft-deleted) groups (fetched from `GET /api/groups`) |

Clicking a row navigates to `/groups/:groupId` (group detail page). A **Leave** button allows the user to leave any group they belong to (with a confirmation modal).

## My Requests Tab

Displays all membership requests submitted by the authenticated user, with status filtering.

- **Data source**: `GET /api/groups/requests/mine?status={filter}`
- **Default filter**: `PENDING`
- **Available filters**: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`
- **Columns**: Group, Submitted (date), Status, Reason, Actions
- **Cancel action**: For `PENDING` requests only, a Cancel button calls `PATCH /api/groups/requests/:requestId/cancel` and invalidates the request list cache.

## All Groups Tab

Displays all available groups in the system. For each group the user can:

- **Join** — submits a membership request via `POST /api/groups/request`
- **Leave** — removes the user from the group via `DELETE /api/groups/:groupId/leave` (with a confirmation modal)

The Join button is disabled if the user already has a pending request for that group.

## Component Structure

```
GroupsPage
├── CreateGroupModal       – Modal form for creating a new group (system admins only)
├── MyGroupsTab            – Groups table with leave action
├── MyRequestsTab          – Requests table with status filter and cancel action
└── AllGroupsTab           – Full groups list with join/leave actions
```

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useMyGroups(userId)` | `GET /api/groups/user/:userId` | MyGroupsTab, AllGroupsTab |
| `useAllGroups()` | `GET /api/groups` | AllGroupsTab |
| `useMyRequests(status?)` | `GET /api/groups/requests/mine` | MyRequestsTab |
| `useCancelMembershipRequest()` | `PATCH /api/groups/requests/:requestId/cancel` | MyRequestsTab |
| `useLeaveGroup(groupId)` | `DELETE /api/groups/:groupId/leave` | MyGroupsTab, AllGroupsTab |
| `useRequestMembership()` | `POST /api/groups/request` | AllGroupsTab |
| `useCreateGroup()` | `POST /api/groups` | CreateGroupModal |

## State Management

- Tab selection is handled by Mantine's `Tabs` component with `defaultValue="my-groups"`.
- Status filter state is local to `MyRequestsTab` (React `useState`).
- `createGroupOpen` state in `GroupsPage` controls the Create Group modal visibility.
- On successful group creation, the `["groups", "all"]` TanStack Query cache key is invalidated.
- On successful cancellation, the `["groups", "requests", "mine"]` cache key is invalidated.
- Leave and membership mutations invalidate the `["groups"]` cache key on success.

## Authorization

System admin status is determined from `AuthContext.isSystemAdmin`. The **Create Group** button and `CreateGroupModal` are only rendered when `isSystemAdmin` is `true`.
