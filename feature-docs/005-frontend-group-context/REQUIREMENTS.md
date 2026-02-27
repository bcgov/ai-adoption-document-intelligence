# Feature 005 — Frontend Group Context & Active Group Selector

## Overview

The backend has been updated to enforce `group_id`-based access control on most endpoints. The frontend must be updated to:

1. Retrieve the user's available groups via the `/me` endpoint.
2. Store and manage the **active group** in a new `GroupContext`.
3. Expose a **searchable dropdown** in the app header so the user can switch active groups.
4. Update the hooks that explicitly send `group_id` to the backend (body / query params) to pull from context.

---

## 1. Backend — Extend the `/me` Response

### 1.1 Summary
The `GET /api/auth/me` endpoint must be extended to include the user's group memberships in its response so the frontend can obtain groups and auth state in a single request.

### 1.2 Changes Required

**`MeResponseDto`**
Add a `groups` field to the DTO:
```
groups: Array<{ id: string; name: string }>
```

**`AuthController.getMe`**
After building the current response, look up the authenticated user's groups using the existing `GroupService.getUserGroups(userId)` method and append them to the response.

### 1.3 Acceptance Criteria
- `GET /api/auth/me` returns a `groups` array alongside the existing fields.
- The array contains `{ id, name }` objects representing every group the user is a member of.
- If the user has no memberships the array is empty (`[]`).
- System-admin users receive all groups in the array (same as calling `GET /api/groups`).

---

## 2. Frontend — `GroupContext`

### 2.1 Summary
A new React context (`GroupContext`) wraps the authenticated portion of the app and manages which group is currently active. It is separate from `AuthContext`.

### 2.2 State & Behaviour

| State | Type | Description |
|---|---|---|
| `availableGroups` | `Array<{ id: string; name: string }>` | All groups the user belongs to (from `/me` response) |
| `activeGroup` | `{ id: string; name: string } \| null` | The currently selected group |
| `setActiveGroup` | `(group: { id: string; name: string }) => void` | Lets the user change the active group |

**Initialisation (on auth load):**
1. Groups are read from the `AuthContext` user object (populated from `/me`).
2. On first load, attempt to restore a previously persisted group from `localStorage` (key: `activeGroupId`). If the stored ID exists in `availableGroups`, restore it.
3. If no persisted group is found (or the stored group is no longer in the user's list), auto-select the first group in `availableGroups`.
4. If `availableGroups` is empty, `activeGroup` is `null`.

**Persistence:**
- Whenever `activeGroup` changes, write `activeGroup.id` to `localStorage` under the key `activeGroupId`.

### 2.3 Type Updates
The `MeResponse` / `AuthUser` interfaces in `AuthContext.tsx` must be extended to include `groups: Array<{ id: string; name: string }>`.

### 2.4 Acceptance Criteria
- `GroupContext` provides `availableGroups`, `activeGroup`, and `setActiveGroup` to all consumers.
- The active group auto-selects the first available group when none is persisted.
- The active group is restored from `localStorage` on page refresh if still valid.
- `activeGroup` is `null` when the user has no group memberships.
- A `useGroup` convenience hook is exported and throws if used outside `GroupContext`.

---

## 3. Frontend — Group Selector UI

### 3.1 Summary
A searchable dropdown is placed in the **top header / app bar**, adjacent to the user avatar, allowing the user to switch their active group.

### 3.2 Appearance & Behaviour

- **All users:** The dropdown lists only the groups in `availableGroups`.
- **System-admin users:** The dropdown is still searchable and lists all groups (which will already be all groups because the `/me` response returns all groups for admins).
- **No groups:** When `availableGroups` is empty, the dropdown is replaced with a non-interactive message (e.g., _"No groups — request membership"_) that navigates to the **Group Membership Request page** (see Section 5).
- The dropdown is **searchable** (filter-as-you-type within the list).
- The currently active group is shown as the selected value.
- Selecting a group calls `setActiveGroup` in `GroupContext`.

### 3.3 Acceptance Criteria
- The group selector is visible in the header for all authenticated users.
- Selecting a group from the dropdown updates the `GroupContext` active group.
- The change persists as described in Section 2.
- An empty-groups state shows a prompt message instead of the selector.

---

## 4. Frontend — No-Group Route Guard

### 4.1 Summary
If a non-admin user has no group memberships (`availableGroups` is empty and the user is not a system-admin), they must be redirected away from all main application pages and shown only the **Group Membership Request page**.

### 4.2 Behaviour
- After `GroupContext` has loaded (auth + groups resolved), if `activeGroup` is `null` and the user is not a system-admin, the app routes the user to a dedicated `/request-membership` page.
- All other navigation (sidebar, direct URL entry) is blocked while the user has no group — they are redirected back to `/request-membership`.
- Once the user gains a group membership (e.g., after an admin approves their request), on the next `/me` refresh the groups list will be populated, the guard will lift, and normal routing resumes.

### 4.3 Acceptance Criteria
- A user with no groups cannot reach any page other than the membership request page.
- The routing guard is checked after `GroupContext` finishes loading (not during the loading state) to avoid flashing.
- System-admin users are exempt from this guard.

---

## 5. Frontend — Group Membership Request Page

### 5.1 Summary
A new page (`/request-membership`) allows users with no group membership to browse available groups and submit a membership request.

### 5.2 Behaviour
- The page calls `GET /api/groups` to list all available groups.
- The user can select a group and submit a request via the existing `POST /api/groups/request` endpoint.
- After submitting, the page shows a confirmation message indicating that their request is pending approval.
- The page is accessible to any authenticated user (including those with no groups) and is the **only** page accessible to users with no group memberships.

### 5.3 Acceptance Criteria
- The page renders a list of available groups the user can request to join.
- Submitting a request calls `POST /api/groups/request` with the selected group ID.
- A success or error state is shown after submission.
- The page is linked from the no-groups dropdown message in the header.

---

## 6. Frontend — Hook Updates

### 4.1 Scope
Only the hooks that **explicitly pass `group_id`** in a request body or query parameter to the backend need to be updated. Hooks that hit GET-all endpoints (where the backend derives group access from the JWT identity) do **not** need a group parameter added.

### 6.2 Hooks to Update

#### `useDocuments` (or related upload hooks)
The document upload flow sends `group_id` as part of `UploadDocumentDto`:
- The upload hook / upload component must read `activeGroup.id` from `GroupContext` and include it as `group_id` in the upload request body.
- If `activeGroup` is `null`, the upload action must be **disabled** (button greyed out) with a tooltip explaining that a group must be selected.

#### `useWorkflows` — `useCreateWorkflow`
`POST /api/workflows` requires `groupId` in the request body (`CreateWorkflowDto`):
- `useCreateWorkflow` must read `activeGroup.id` from `GroupContext` and inject it as `groupId` automatically—callers do not pass `groupId` explicitly.
- If `activeGroup` is `null`, the create mutation throws / returns an error before calling the API.

### 6.3 Hooks NOT in Scope
The following hooks use GET-all endpoints where the backend already scopes to the user's groups via their identity—no frontend group parameter is required:
- `useDocuments` (GET list)
- `useWorkflows` (GET list, GET by id)
- Document detail / delete / update (scoped by document's own `group_id`)
- HITL, training, labeling hooks (group is derived from the resource's stored `group_id`)

> **Note:** `useClassifier` already passes `group_id` in its calls and is out of scope.

### 6.4 Acceptance Criteria
- `useCreateWorkflow` automatically includes `activeGroup.id` as `groupId` without callers needing to pass it.
- Document upload automatically includes `activeGroup.id` as `group_id`.
- When `activeGroup` is `null`, upload and workflow creation are gracefully blocked (not silent failures).
- No other hook interfaces change.

---

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Type safety** | No `any` types. All new interfaces must be fully typed. |
| **Tests** | Backend: update / add unit tests for the extended `/me` endpoint. Frontend: update component/hook tests that now depend on `GroupContext`. |
| **Backwards compatibility** | Not required — callers of the modified hooks may need to remove any `groupId` arguments they were previously passing manually. |
| **Performance** | Groups are loaded once on login via `/me`; no additional network request is needed for group data. |
| **Linting** | All changes must pass the existing Biome lint and format checks. |

---

## 8. Out of Scope

- Approving/denying membership requests from within this UI (handled in a subsequent ticket).
- Changing the GET-all endpoints to accept an explicit group filter query param.
- API key authentication paths (group context applies only to Keycloak SSO users). This should not be needed for frontend changes, as frontend operations do not user the API key authentication option.

---

## 9. Open Questions / Gaps

- **Admin group loading at scale:** For system-admin users the `/me` response will include all groups. Performance at large scale is a known concern but is deferred to a future iteration.
