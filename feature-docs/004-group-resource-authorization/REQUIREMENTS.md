# Feature Requirements: Group-Based Resource Authorization

**Feature Folder**: `004-group-resource-authorization`  
**Status**: Ready for User Story Writing  
**Date**: 2026-02-25

---

## 1. Overview

Now that group membership mechanisms are in place, all primary system resources must be secured by group membership. Access to a resource requires the requestor to be a member of the group the resource belongs to. The only exception is the `system-admin` role, which bypasses all group checks. This enforcement must work across both Keycloak SSO (JWT) and API key authentication methods.

---

## 2. Resources in Scope

### 2.1 Top-Level Resources (require new `group_id` column)

| Model | Schema Table | Change Required |
|---|---|---|
| `Document` | `documents` | Add `group_id` (FK → `group`) |
| `Workflow` | `workflows` | Add `group_id` (FK → `group`) |
| `LabelingProject` | `labeling_projects` | Add `group_id` (FK → `group`) |
| `LabelingDocument` | `labeling_documents` | Add `group_id` (FK → `group`) |
| `ApiKey` | `api_keys` | Add `group_id` (FK → `group`), see §4 |

> **Note**: `ClassifierModel` already has a `group_id` and is already compliant.

### 2.2 Sub-Resources (inherit group enforcement via parent — no schema change)

| Model | Parent | Group Inherited From |
|---|---|---|
| `TrainedModel` | `LabelingProject` | `LabelingProject.group_id` |
| `TrainingJob` | `LabelingProject` | `LabelingProject.group_id` |
| `LabeledDocument` | `LabelingProject` | `LabelingProject.group_id` |
| `ReviewSession` | `Document` | `Document.group_id` |

When an operation targets a sub-resource, the system must traverse to the parent to resolve the group_id for the membership check.

---

## 3. Access Control Model

### 3.1 Rules

- A requestor may **read and write** a resource if and only if they are a member of the group that resource belongs to.
- A requestor who is a member of **multiple groups** may access resources belonging to **any** of their groups.
- A requestor with the **`system-admin` role** bypasses all group membership checks entirely.
- If a resource has **no `group_id`** (orphaned/legacy record), access is **blocked** for all non-system-admin users. There is no migration mechanism; orphaned records remain inaccessible.

### 3.2 Authentication Coverage

Group enforcement must work for both authentication methods:

- **Keycloak JWT (SSO)**: Derive the user's identity from the JWT payload; look up their group memberships in the database.
- **API Key**: Derive the group from the `group_id` stored directly on the `ApiKey` record (see §4). The API key itself represents membership in a group.

### 3.3 Implementation Approach

Group enforcement should be implemented as a reusable NestJS guard or decorator that can be applied at the controller or route level, rather than duplicating logic in individual services. The guard must:

1. Identify the requestor (from JWT or API key).
2. Short-circuit with `200 OK` (or proceed) if `system-admin` role is present.
3. Resolve the target resource's `group_id` (directly or via parent traversal).
4. Check whether the requestor's memberships include the resource's group.
5. Return `403 Forbidden` if the check fails; return `404 Not Found` if the resource has no `group_id`.

---

## 4. API Key Changes

### 4.1 Schema Change

Add a `group_id` foreign key to the `ApiKey` model alongside the existing `user_id`:

- `group_id String` — the group this API key grants access to.
- `user_id` — retained; records which user last generated the key.

### 4.2 API Key Behaviour

- An API key is **group-scoped**: it grants access only to resources belonging to that key's group.
- When authenticating via API key, the system uses the key's `group_id` directly for group membership resolution — no user group lookup is required.

### 4.3 Tracking / Audit

- The existing `user_id` and `last_used` fields on `ApiKey` serve as the audit trail.
- No additional audit table is required.
- `user_id` records which user **last generated** the API key for the group.

### 4.4 API Key Request Flow

- A user may request a new API key for a group they are a member of.
- The `user_id` on the resulting `ApiKey` record is set to the requesting user's ID.
- The requesting user must be a member of the target group; this must be validated.

---

## 5. Resource Creation

When creating any top-level resource (`Document`, `Workflow`, `LabelingProject`, `LabelingDocument`):

- The requestor **must supply a `group_id`** in the request body/parameters.
- The system must validate that the requestor is a member of the supplied group.
- If the requestor is not a member of the supplied group, return `403 Forbidden`.
- `system-admin` users may supply any `group_id` without membership validation.

---

## 6. Orphaned Records

- Existing records with no `group_id` following this feature's deployment are **inaccessible** to all non-system-admin users.
- **No bulk migration or assignment endpoint will be built.**
- Only a `system-admin` can interact with orphaned records (via the system-admin bypass).

---

## 7. Non-Functional Requirements

- The group check must add minimal latency; database queries for group membership should be efficient (use indexed lookups on `user_group` table).
- All new guard/service logic must be covered by unit tests.
- The group check guard should be composable with existing auth guards (JWT + API key) without replacing them.
- Documentation must be updated in `/docs-md` to reflect the new authorization layer.

---

## 8. Out of Scope

- `FieldCorrection`, `DocumentLabel`, `OcrResult` — deeply nested sub-resources; access is governed by their parent chain.
- Role-based write restrictions within a group (e.g., only creator can delete) — all group members have equal read/write access.
- Any UI/frontend changes are not described here and should be handled separately.

---

## 9. Open Questions / Gaps

- None identified at this time.
