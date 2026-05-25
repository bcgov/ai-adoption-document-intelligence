# US-179: `VersionHistoryPane` — version list + view modal + revert

**As a** dynamic-node author,
**I want** a side pane that shows my lineage's version history newest-first with view and revert actions,
**So that** I can compare a past version against head, restore a version as the new head, or just understand how the script has evolved — mirroring the Phase 2 Track 3 library-workflow pattern.

## Acceptance Criteria

- [ ] **Scenario 1**: New `VersionHistoryPane.tsx` lists versions newest-first
    - **Given** edit mode (`slug` is set), and `useDynamicNode(slug)` returns `{ versions: [{ versionNumber: 3, ... }, { versionNumber: 2, ... }, { versionNumber: 1, ... }] }`
    - **When** the pane renders
    - **Then** the rows render in order v3, v2, v1 (newest-first)
    - **And** each row shows: `v{n}` indigo badge + relative publish timestamp + optional blue "head" badge + "View" + "Revert" buttons

- [ ] **Scenario 2**: Empty / loading / error states
    - **Given** create mode (no slug yet)
    - **When** the pane renders
    - **Then** it shows a gray "No versions yet — publish to create v1" placeholder
    - **And** while `useDynamicNode` is loading (edit mode) it shows 3 Skeleton rows
    - **And** on error it shows a red `<Alert>` with the error message

- [ ] **Scenario 3**: View modal opens with side-by-side script blocks
    - **Given** a non-head version row
    - **When** the user clicks "View"
    - **Then** a Mantine `<Modal size="80%">` opens with two `<JsonInput readOnly>` panels side-by-side: selected version on the left, head on the right
    - **And** NO diff library is used — same shape as Phase 2 Track 3's compare modal
    - **And** for the head row, the "View" button is disabled with tooltip "This is the head"

- [ ] **Scenario 4**: Revert flow uses a confirm modal + PUT
    - **Given** a non-head version row
    - **When** the user clicks "Revert"
    - **Then** Mantine `modals.openConfirmModal` opens "Reverting will publish v{n}'s script as the new head (v{N+1}). Continue?"
    - **And** confirming calls `useDynamicNodePublish(slug)` with the v{n} script as the body — this creates a new version (mirroring how PUT always creates rather than mutating)
    - **And** on success: green "Reverted to v{n} as v{N+1}" notification + the version history refetches via the standard invalidation chain

- [ ] **Scenario 5**: "Head" badge tracks the lineage's `headVersionId`
    - **Given** the lineage's head is v3
    - **When** the pane renders
    - **Then** only v3's row has the blue "head" badge
    - **And** after a revert that makes v4 the new head, the badge moves to v4 on the next render

- [ ] **Scenario 6**: Tests cover render + view + revert + invalidation
    - **Given** `VersionHistoryPane.spec.tsx`
    - **When** the test runs
    - **Then** tests pass for: empty state in create mode; populated list in edit mode; click View opens the modal with the right two scripts; head's View is disabled; Revert calls the publish mutation with the old script; head badge moves after revert

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/dynamic-nodes/VersionHistoryPane.tsx` — new file
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/VersionHistoryPane.spec.tsx` — new test
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` — wire the pane

## Technical notes

- The view modal uses the same shape as Phase 2 Track 3's `VersionHistoryDrawer` compare modal — keep the components similar enough that a future refactor could unify them.
- Revert always creates a new version (matches the Phase 2 Track 3 D1 decision). Old versions remain in `dynamic_node_version` for full history.
- "Pin head to specific version" is out of 6.0 — revert is the only path. Per-version pin is filed for 6.x.
- This story closes Milestone E. After landing US-176 → US-179, the editor component is feature-complete; Milestone F mounts it.
- After landing: no Vite restart (frontend-only).
