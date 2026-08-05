# Groups Page (`/groups`)

## Overview

The Groups page is a tabbed interface at `/groups` that consolidates group-related information for authenticated users. It includes three tabs: **My Groups**, **My Requests**, and **All Groups**. System admins also see a **Create Group** button to provision new groups.

## Create Group (System Admins Only)

A **Create Group** button appears in the page header for users with the `system-admin` role. Clicking it opens a modal form with:

- **Name** (required) — the group's unique display name
- **Description** (optional) — a short description of the group

On successful submission, `POST /api/groups` is called, the modal closes, a success notification is shown, and the All Groups cache is invalidated to refresh the list. Server-side errors (e.g. duplicate name) are displayed inline inside the modal without closing it. Client-side validation ensures the Name field is not empty before submission.

## My Groups Tab

Displays the groups the authenticated user belongs to (fetched from `GET /api/groups/user/:userId` — the same source for regular users and system admins).

Clicking a row navigates to `/groups/:groupId` (group detail page). A **Leave** button allows the user to leave any group they belong to (with a confirmation modal). The table (shared `GroupsTable` component) includes a search field and sortable Name/Description columns.

## My Requests Tab

Displays all membership requests submitted by the authenticated user, with status filtering.

- **Data source**: `GET /api/groups/requests/mine?status={filter}`
- **Default filter**: `PENDING`
- **Available filters**: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`, `ALL`
- **Columns**: Group, Submitted (date), Status, Reason, Actions (the shared `RequestsTable` component also provides a search field and sortable columns)
- **Cancel action**: For `PENDING` requests only, a Cancel button opens a confirmation modal, then calls `PATCH /api/groups/requests/:requestId/cancel` and invalidates the request list cache.
- **Self-approve (system admins only)**: System admins also see an **Approve** button on their own `PENDING` requests, which opens a confirmation modal and calls `PATCH /api/groups/requests/:requestId/approve`.

## All Groups Tab

Displays all available groups in the system. For each group the user can:

- **Join** — submits a membership request via `POST /api/groups/request`
- **Leave** — removes the user from the group via `DELETE /api/groups/:groupId/leave` (with a confirmation modal)

The Join button is disabled and labelled "Request Pending" if the user already has a pending request for that group. Clicking a row navigates to `/groups/:groupId`.

## Component Structure

```
GroupsPage
├── CreateGroupModal       – Modal form for creating a new group (system admins only)
├── MyGroupsTab            – Groups table (GroupsTable) with leave action
├── MyRequestsTab          – Requests table (RequestsTable) with status filter, cancel and admin self-approve actions
└── AllGroupsTab           – Full groups list (GroupsTable) with join/leave actions
```

The tables themselves are shared components in `apps/frontend/src/components/group/` (`GroupsTable.tsx`, `RequestsTable.tsx`).

## Data Hooks (frontend)

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useMyGroups(userId)` | `GET /api/groups/user/:userId` | MyGroupsTab, AllGroupsTab |
| `useAllGroups()` | `GET /api/groups` | AllGroupsTab |
| `useMyRequests(status?)` | `GET /api/groups/requests/mine` | MyRequestsTab, MyGroupsTab, AllGroupsTab (pending-request state) |
| `useCancelMembershipRequest()` | `PATCH /api/groups/requests/:requestId/cancel` | MyRequestsTab |
| `useApproveMembershipRequest(groupId)` | `PATCH /api/groups/requests/:requestId/approve` | MyRequestsTab (system-admin self-approve) |
| `useLeaveGroup(groupId)` | `DELETE /api/groups/:groupId/leave` | MyGroupsTab, AllGroupsTab |
| `useRequestMembership()` | `POST /api/groups/request` | MyGroupsTab, AllGroupsTab |
| `useCreateGroup()` | `POST /api/groups` | CreateGroupModal |

## State Management

- Tab selection is handled by Mantine's `Tabs` component with `defaultValue="my-groups"`.
- Status filter, search, and sort state are local to the shared `RequestsTable` component (React `useState`).
- `createGroupOpen` state in `GroupsPage` controls the Create Group modal visibility.
- On successful group creation, the `["groups", "all"]` TanStack Query cache key is invalidated.
- On successful cancellation or membership request, the `["groups", "requests", "mine"]` cache key is invalidated.
- The leave mutation invalidates the `["groups"]` cache key on success.
- The approve mutation invalidates `["groups", groupId, "requests"]`, `["groups", groupId, "members"]`, `["groups", "user"]`, and `["groups", "requests", "mine"]` so join/leave button states update immediately.

## Authorization

System admin status is determined from `AuthContext.isSystemAdmin`. The **Create Group** button and `CreateGroupModal` are only rendered when `isSystemAdmin` is `true`.
