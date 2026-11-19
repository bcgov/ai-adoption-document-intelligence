# US-082: `VersionHistoryDrawer` renders newest-first list with head badge and action buttons

**As a** workflow author opening the history drawer,
**I want** to see every version newest-first with the current head
clearly marked and per-row Revert + Compare buttons,
**So that** I can review history and choose an action without flipping
to a separate page.

## Acceptance Criteria

- [x] **Scenario 1**: Drawer renders right-side with versions newest-first
    - **Given** a workflow with 3 versions (v1, v2, v3 head)
    - **When** the drawer opens
    - **Then** a right-side Mantine `Drawer` with `position="right"` and `size="md"` mounts
    - **And** rows appear newest-first (v3, v2, v1 reading top-to-bottom)
    - **And** each row shows the version number badge (e.g. `v3`), the ISO `createdAt` formatted human-readably, and the row's action buttons

- [x] **Scenario 2**: Head row carries a `<Badge color="blue">head</Badge>`
    - **Given** the lineage's `workflowVersionId` matches one of the rows
    - **When** the drawer renders
    - **Then** that row (and only that row) shows the "head" badge

- [x] **Scenario 3**: Action buttons present on non-head rows, disabled on head
    - **Given** any row
    - **When** the drawer renders
    - **Then** the row has two buttons: "Revert to this version" and "Compare to head"
    - **And** both buttons are disabled on the head row, with tooltips "Already the head" and "This is the head — nothing to compare" respectively

- [x] **Scenario 4**: Loading / empty / error states
    - **Given** the `useWorkflowVersions` query state
    - **When** loading: the drawer body shows Mantine `<Skeleton>` rows (at least 3)
    - **When** the query resolves to an empty list: a plain text "No versions yet — save the workflow first." is shown
    - **When** the query errors: a red Mantine `<Alert>` with the error message is shown

- [x] **Scenario 5**: Vitest coverage
    - **Given** the new component
    - **When** `npm test` runs in `apps/frontend/`
    - **Then** tests cover: row count + ordering, head badge, button disabled state on head, loading + empty + error states

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` — the drawer component
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — mount the drawer wired to `historyDrawerOpened` state from US-081
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/VersionHistoryDrawer.test.tsx` — scenarios 1–4

## Notes

- The drawer's `onRevert` / `onCompare` callbacks are wired in US-083 and US-084 respectively. This story renders the buttons as no-op stubs (or accepts the handlers as props with a sensible default `() => undefined` for the test surface).
