# US-084: Compare-to-head modal — two side-by-side read-only `JsonInput` blocks

**As a** workflow author wanting to understand what changed between
two versions,
**I want** a side-by-side view of an older version's config and the
current head's config,
**So that** I can eyeball the differences before deciding whether to
revert or pin to a library version.

## Acceptance Criteria

- [x] **Scenario 1**: Compare-to-head opens a large modal with two columns
    - **Given** a non-head row in `VersionHistoryDrawer`
    - **When** the user clicks "Compare to head"
    - **Then** a Mantine `<Modal size="80%">` opens
    - **And** the modal has two side-by-side columns inside a Mantine `<SimpleGrid cols={2}>` (or `<Grid>`)
    - **And** the left column header reads `"v{n} — {iso timestamp}"` for the selected version
    - **And** the right column header reads `"head (v{headN} — {iso timestamp})"`

- [x] **Scenario 2**: Each column renders a read-only `JsonInput`
    - **Given** the modal is open
    - **When** the configs have been fetched
    - **Then** each column contains a Mantine `<JsonInput value={JSON.stringify(config, null, 2)} readOnly autosize maxRows={40} formatOnBlur={false} />`
    - **And** both panels scroll independently

- [x] **Scenario 3**: Selected-version config fetched via `useWorkflowVersion`
    - **Given** the modal mounts with a `versionId` prop
    - **When** rendering
    - **Then** `useWorkflowVersion(lineageId, versionId)` is invoked for the left column
    - **And** the current head's config comes from the already-loaded `useWorkflow(lineageId)` (no extra fetch — reuse the editor's cached query)
    - **And** loading state shows a single skeleton block in the left column while the version fetch is in flight

- [x] **Scenario 4**: Error / not-found state
    - **Given** the version fetch returns 404 or errors
    - **When** the modal renders
    - **Then** the left column shows a red Mantine `<Alert>` with the error message
    - **And** the right column still renders head's config

- [x] **Scenario 5**: Vitest coverage
    - **Given** the new modal
    - **When** `npm test` runs
    - **Then** tests cover: modal opens via callback, two columns + headers render, JsonInputs are readOnly, error state renders the alert

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx` — the new modal component
- `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` — wire the Compare button to open the modal (track open state + selected versionId)
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/CompareToHeadModal.test.tsx` — scenarios 1–4

## Notes

- The modal does NOT do diff highlighting — that's filed as out-of-scope per REQUIREMENTS D1. Two `JsonInput` blocks side-by-side is the explicit Track 3 deliverable.
- Reusing the editor's already-loaded `useWorkflow(lineageId)` for head avoids a redundant fetch and keeps the head config consistent with what the canvas is showing.
