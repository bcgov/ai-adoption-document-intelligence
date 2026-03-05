# Feature 006 — Group Management UI

## Overview

This feature introduces three sets of UI and API capabilities centred on group management:

1. **Group Members & Requests Page** — Group members can view and manage the membership roster and outstanding join requests for groups they belong to.
2. **My Requests Page** — Any user can view the history of their own membership requests and cancel pending ones.
3. **System Admin Group Management** — Users with the `system-admin` role can create, edit, and soft-delete groups from the same UI, with actions gated by role.

---

## Actors

| Actor | Description |
|-------|-------------|
| **Authenticated User** | Any logged-in user. Can view their own requests and cancel pending ones. |
| **Group Admin** | A user who holds the `group-admin` role scoped to a specific group (recorded in the new `UserGroupRole` table). Can manage members and membership requests for that group. |
| **System Admin** | A user with the `system-admin` role (stored in the global `user_role` table). Can create, edit, and soft-delete any group, and act as group admin for all groups. |

---

## Actors & Role Checking

### System-Admin Role
- System-admin status is determined exclusively by a DB lookup (`DatabaseService.isUserSystemAdmin`), **not** by the JWT `roles` claim (the JWT does not carry role information).
- The `/api/auth/me` endpoint must be updated so the `roles` field in its response is populated from the DB (`user_role` table) rather than from the JWT payload. The current implementation reads `user.roles` off the JWT; this must change to query the DB for the authenticated user's roles and return them as `string[]`.
- The frontend reads `roles` from the `AuthContext` user object and checks `roles.includes('system-admin')` to determine admin status.
- Admin-only backend endpoints must enforce the check using `isUserSystemAdmin`, not the `@Roles()` decorator.

### Group-Admin Role
- A new `UserGroupRole` table associates a user, a group, and a role name (e.g. `group-admin`).
- A user is a group admin for a given group if a `UserGroupRole` record exists with their `user_id`, the group's `group_id`, and `role = 'group-admin'`.
- When a user is approved for group membership (via the approve-request flow), they are added to `UserGroup` only — they are **not** automatically assigned the `group-admin` role. Group-admin assignment is a separate, explicit action (out of scope for this feature's approval flow; the DB structure must be in place, but a management UI for assigning group admins is deferred).
- Backend endpoints that are scoped to group admins must check for a `UserGroupRole` record with `role = 'group-admin'` for the relevant group, or fall back to system-admin status.

---

## Part 1: Group Members & Requests Page

### 1.1 Navigation

- A **Groups** link is added to the application sidebar navigation, accessible to all authenticated users.
- Clicking **Groups** navigates to a groups listing page (`/groups`).
- From the groups listing, clicking a specific group navigates to a group detail page (`/groups/:groupId`).
- Non-admin users see only the groups they are members of.
- System admins see all groups (already the case via the `/me` response returning all groups for admins).

### 1.2 Group Detail Page Layout

The group detail page (`/groups/:groupId`) contains two tabs:

#### Tab 1: Members

Displays all current members of the group in a table with the following columns:

| Column | Description |
|--------|-------------|
| Email | Member's email address |
| Joined | The `created_at` date of the `UserGroup` record (date the user was added) |
| Actions | Remove button (shown in a column at the right) |

- **Remove Member**: Clicking Remove opens a confirmation dialog before executing the removal. This removes the `UserGroup` record for that user and group.
- **Leave Group**: The currently authenticated user sees a "Leave Group" button in a separate section (e.g., a danger zone at the bottom of the tab or a header action). Clicking it opens a confirmation dialog before removing themselves from the group.

#### Tab 2: Membership Requests

Displays membership requests for the group in a table with the following columns:

| Column | Description |
|--------|-------------|
| Email | Email of the requesting user |
| Requested | `created_at` date of the request |
| Reason | Optional reason provided at time of request |
| Status | Current status (PENDING, APPROVED, DENIED, CANCELLED) |
| Actions | Approve / Deny buttons (for PENDING rows only) |

- The table includes a **status filter** that defaults to **PENDING**.
- All statuses are available as filter options (PENDING, APPROVED, DENIED, CANCELLED).
- **Approve**: Clicking Approve on a PENDING request approves it immediately (no confirmation dialog required, as this is a non-destructive action). An optional reason field is presented before confirming.
- **Deny**: Clicking Deny on a PENDING request opens a confirmation dialog. An optional reason field is included in the dialog.
- Resolved or cancelled rows are read-only (no action buttons).

### 1.3 Access Control

- A user who is **not** a group admin for the group (via `UserGroupRole`) and is **not** a system admin must receive a `403 Forbidden` when attempting to access the group detail endpoints or perform member/request actions.
- System admins can access and act on any group's members and requests.
- Ordinary group members (users in `UserGroup` who do not have a `group-admin` `UserGroupRole` record) can view the group detail page in read-only mode but cannot approve/deny requests or remove other members.

### 1.4 New Backend Endpoints Required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/groups/:groupId/members` | Returns all members (user id, email, joined date) of the group. Requires caller to be a group member, group admin, or system admin. |
| `DELETE` | `/api/groups/:groupId/members/:userId` | Removes a user from the group. Requires caller to be a group admin or system admin. Cannot remove a user that is not in the group (404). |
| `DELETE` | `/api/groups/:groupId/leave` | The authenticated caller removes themselves from the group. Returns 400 if the caller is not a member. |
| `GET` | `/api/groups/:groupId/requests` | Returns membership requests for a group, with optional `?status=` query param. Requires caller to be a group admin or system admin. |

> **Note**: The approve (`PATCH /api/groups/requests/:requestId/approve`) and deny (`PATCH /api/groups/requests/:requestId/deny`) endpoints already exist in the backend. The existing scoping must be updated so that a group admin for the relevant group (or a system admin) can call them — not just system admins.

---

## Part 2: My Requests Page

### 2.1 Navigation

- A **My Requests** link or section is added to the sidebar navigation, accessible to all authenticated users.
- Route: `/my-requests`

### 2.2 Page Behaviour

- The page fetches and displays all of the authenticated user's membership requests across all groups.
- Results are shown in a table with the following columns:

| Column | Description |
|--------|-------------|
| Group | Name of the group the request was made for |
| Submitted | `created_at` date of the request |
| Status | Current status (PENDING, APPROVED, DENIED, CANCELLED) |
| Reason | Reason recorded on the request (if any) |
| Actions | Cancel button (PENDING rows only) |

- A **status filter** is shown, defaulting to **PENDING**.
- All statuses are available as filter options.
- **Cancel**: Clicking Cancel on a PENDING request opens a confirmation dialog before executing. The action calls the existing `DELETE /api/groups/requests/:requestId` (or equivalent cancel endpoint).

### 2.3 New Backend Endpoint Required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/groups/requests/mine` | Returns all membership requests made by the authenticated user. Supports optional `?status=` query param. |

> **Note**: The cancel endpoint already exists (`POST /api/groups/requests/:requestId/cancel` or equivalent). Confirm the exact path matches the existing implementation.

---

## Part 3: System Admin Group Management

### 3.1 Placement

- Admin-specific controls are displayed on the same **Groups** page and **Group Detail** page as described in Part 1.
- Controls are only rendered when `isSystemAdmin` is `true` in the frontend auth context. Non-admin users must not see these controls.
- All admin-only backend endpoints must enforce `isUserSystemAdmin` via the existing `DatabaseService` method, returning `403 Forbidden` for non-admins.

### 3.2 Create Group

- A **Create Group** button is shown on the groups listing page (`/groups`) for system admins.
- Clicking it opens a modal or inline form with the following fields:
  - `Name` (string, required, must be unique)
  - `Description` (string, optional)
- Submitting the form calls `POST /api/groups` with `{ name, description? }`.
- On success, the groups list refreshes and the new group is visible.
- On error (e.g., duplicate name), a descriptive error message is displayed.

### 3.3 Edit Group

- An **Edit** button is shown per group row/card on the groups listing page, visible to system admins only.
- Clicking it opens a modal or inline form pre-populated with the current values that allows editing:
  - `Name` (string, required, must be unique)
  - `Description` (string, optional)
- Submitting the form calls `PUT /api/groups/:groupId` with the updated fields.
- On success, the groups list refreshes with the updated values.

### 3.4 Delete Group (Soft Delete)

- A **Delete** button is shown per group row/card on the groups listing page, visible to system admins only.
- Clicking it opens a **confirmation dialog** before executing. The dialog must clearly state that this action will disable the group.
- On confirmation, calls `DELETE /api/groups/:groupId`.
- The backend performs a **soft delete**:
  - Sets `deleted_at` to the current timestamp.
  - Sets `deleted_by` to the authenticated admin's user ID.
  - The group record remains in the database; no cascade deletes occur.
  - The group is excluded from all subsequent group listings and operations.
  - Outstanding `PENDING` membership requests for the group are **not automatically cancelled** — they are simply no longer actionable since the group will no longer appear in listings.
- On success, the group is removed from the groups listing in the UI.

### 3.5 New/Updated Backend Endpoints Required

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/groups` | Creates a new group. System admin only. Body: `{ name: string, description?: string }`. |
| `PUT` | `/api/groups/:groupId` | Updates a group's editable fields. System admin only. Body: `{ name: string, description?: string }`. Returns 404 if group not found or is soft-deleted. |
| `DELETE` | `/api/groups/:groupId` | Soft-deletes a group. System admin only. Sets `deleted_at` and `deleted_by`. Returns 404 if group not found. |

> **Note**: If a `POST /api/groups` endpoint already exists from a prior feature, confirm it enforces system-admin authorization and update it accordingly.

---

## Database Changes Required

All changes must be applied via a Prisma migration in `apps/shared/prisma/migrations/`.

### `Group` model changes

| Column | Type | Description |
|--------|------|-------------|
| `description` | `String?` | Optional human-readable description of the group. |
| `deleted_at` | `DateTime?` | Null = active group; non-null = soft-deleted. |
| `deleted_by` | `String?` | User ID of the admin who performed the soft delete. |

### New `UserGroupRole` model

A new table that records role assignments scoped to a specific group:

```prisma
model UserGroupRole {
  user_id  String
  group_id String
  role     String   // e.g. 'group-admin'

  user  User  @relation(fields: [user_id], references: [id])
  group Group @relation(fields: [group_id], references: [id])

  @@id([user_id, group_id, role])
  @@index([group_id])
  @@map("user_group_role")
}
```

### `/me` response — `roles` field sourced from DB

The `AuthController.getMe` method currently reads roles off the JWT payload (`user.roles`). This must be changed to query the `user_role` table and return the user's role names as `string[]`. The `MeResponseDto.roles` field remains `string[]`; only the data source changes.

### Query updates

All existing group-fetching queries (including `GET /api/groups`, `GET /api/groups/user/:userId`, and the `/me` group list) must be updated to exclude soft-deleted groups (`WHERE deleted_at IS NULL`).

### `description` field on the membership request page

The existing **Request Membership** page (`/request-membership`) must be updated to display each group's `description` (when present) alongside the group name, so users have context when choosing which group to join.

---

## Non-Functional Requirements

- All new frontend components must use Mantine UI components for consistency.
- All new frontend data fetching must use TanStack React Query with proper loading and error states.
- All new backend controller methods must include JSDoc, Swagger `@ApiOperation`, `@ApiResponse`, and `@ApiParam` decorators.
- All new/modified backend code must have corresponding unit tests. Run tests after implementation and fix failures before submission.
- All code must pass biome lint and format checks.

---

## Open Questions

1. **Leave Group vs Remove Member**: These are two distinct actions (different UX placement) but share underlying backend logic (deleting a `UserGroup` record). Confirm whether they should share a single endpoint or be kept separate for clarity.

2. **Group-admin assignment UI**: This feature creates the `UserGroupRole` table and enforces group-admin checks on the backend, but does not include a UI for assigning the `group-admin` role to a user. That is deferred. For testing, records can be inserted directly into the database.

3. **Soft-delete and existing data**: When a group is soft-deleted, all associated resources (workflows, documents, API keys, labeling projects) remain untouched. Whether those resources should reflect the deleted state in their own views is out of scope for this feature.
