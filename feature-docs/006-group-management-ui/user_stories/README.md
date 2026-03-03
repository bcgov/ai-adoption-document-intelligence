# Feature 006 — User Stories

User stories for **Group Management UI**.

---

## Phase 1 — Database Migrations & Schema

| # | Story | Status |
|---|-------|--------|
| US-001 | [Add `UserGroupRole` Table via Prisma Migration](./US-001-add-user-group-role-table.md) | - [x] |
| US-002 | [Extend `Group` Model with `description`, `deleted_at`, and `deleted_by` Fields](./US-002-extend-group-model-fields.md) | - [x] |

---

## Phase 2 — Backend: Auth & Role Updates

| # | Story | Status |
|---|-------|--------|
| US-003 | [Return Admin Status and Group Roles from the Database in `/me`](./US-003-me-endpoint-roles-from-db.md) | - [x] |
| US-004 | [Exclude Soft-Deleted Groups from All Group Queries](./US-004-exclude-soft-deleted-groups-from-queries.md) | - [x] |

---

## Phase 3 — Backend: Group Members Endpoints

| # | Story | Status |
|---|-------|--------|
| US-005 | [`GET /api/groups/:groupId/members` Endpoint](./US-005-get-group-members-endpoint.md) | - [x] |
| US-006 | [`DELETE /api/groups/:groupId/members/:userId` Endpoint](./US-006-remove-group-member-endpoint.md) | - [x] |
| US-007 | [`DELETE /api/groups/:groupId/leave` Endpoint](./US-007-leave-group-endpoint.md) | - [x] |

---

## Phase 4 — Backend: Group Requests Endpoints

| # | Story | Status |
|---|-------|--------|
| US-008 | [`GET /api/groups/:groupId/requests` Endpoint](./US-008-get-group-requests-endpoint.md) | - [x] |
| US-009 | [Allow Group Admins to Approve and Deny Membership Requests](./US-009-group-admin-approve-deny-requests.md) | - [x] |
| US-010 | [`GET /api/groups/requests/mine` Endpoint](./US-010-get-my-requests-endpoint.md) | - [x] |

---

## Phase 5 — Backend: System Admin Group CRUD Endpoints

| # | Story | Status |
|---|-------|--------|
| US-011 | [`POST /api/groups` — Create Group (System Admin Only)](./US-011-create-group-endpoint.md) | - [x] |
| US-012 | [`PUT /api/groups/:groupId` — Update Group (System Admin Only)](./US-012-update-group-endpoint.md) | - [ ] |
| US-013 | [`DELETE /api/groups/:groupId` — Soft-Delete Group (System Admin Only)](./US-013-soft-delete-group-endpoint.md) | - [x] |

---

## Phase 6 — Frontend: Navigation

| # | Story | Status |
|---|-------|--------|
| US-014 | [Add Groups Link to Sidebar Navigation](./US-014-sidebar-navigation-links.md) | - [x] |

---

## Phase 7 — Frontend: Groups Page (Tabbed)

| # | Story | Status |
|---|-------|--------|
| US-015 | [Groups Page (`/groups`) with My Groups and My Requests Tabs](./US-015-groups-listing-page.md) | - [x] |

---

## Phase 8 — Frontend: Group Detail Page — Members Tab

| # | Story | Status |
|---|-------|--------|
| US-016 | [Group Detail Page — Members Tab](./US-016-group-detail-members-tab.md) | - [ ] |
| US-017 | [Remove Member Action on Group Detail Page](./US-017-remove-member-action.md) | - [ ] |
| US-018 | [Leave Group Action on Group Detail Page](./US-018-leave-group-action.md) | - [ ] |

---

## Phase 9 — Frontend: Group Detail Page — Membership Requests Tab

| # | Story | Status |
|---|-------|--------|
| US-019 | [Group Detail Page — Membership Requests Tab](./US-019-group-detail-requests-tab.md) | - [ ] |
| US-020 | [Approve Membership Request Action](./US-020-approve-request-action.md) | - [ ] |
| US-021 | [Deny Membership Request Action](./US-021-deny-request-action.md) | - [ ] |

---

## Phase 10 — Frontend: My Requests Tab

| # | Story | Status |
|---|-------|--------|
| US-022 | [My Requests Tab on the Groups Page](./US-022-my-requests-page.md) | - [x] |
| US-023 | [Cancel Membership Request Action on My Requests Tab](./US-023-cancel-request-action.md) | - [ ] |

---

## Phase 11 — Frontend: System Admin Group Management

| # | Story | Status |
|---|-------|--------|
| US-024 | [Create Group Button and Form (System Admin)](./US-024-create-group-form.md) | - [ ] |
| US-025 | [Edit Group Button and Form (System Admin)](./US-025-edit-group-form.md) | - [ ] |
| US-026 | [Delete Group with Soft-Delete Confirmation (System Admin)](./US-026-delete-group-action.md) | - [ ] |

---

## Phase 12 — Frontend: Request Membership Enhancement

| # | Story | Status |
|---|-------|--------|
| US-027 | [Display Group Description on Request Membership Page](./US-027-group-description-on-request-page.md) | - [ ] |
