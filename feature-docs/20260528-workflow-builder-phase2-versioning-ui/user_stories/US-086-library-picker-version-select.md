# US-086: `LibraryPickerModal` "Version" Select returns `{ workflowId, version? }`

**As a** workflow author picking a library inside a `childWorkflow`
node,
**I want** to optionally pin a specific version of that library at
pick time,
**So that** my parent workflow's behaviour is reproducible without
having to dive into JSON to add a `version` field.

## Acceptance Criteria

- [ ] **Scenario 1**: Version `<Select>` appears after a library is selected
    - **Given** the `LibraryPickerModal` is open and the user has clicked a library row
    - **When** the selection state updates
    - **Then** a Mantine `<Select label="Version">` appears in the modal body (or below the library list)
    - **And** the options are `[{ value: "head", label: "head" }, ...versions.map(v => ({ value: v.id, label: \`v${v.versionNumber}\` }))]` from `useWorkflowVersions(selectedLibraryId)`
    - **And** the default selected value is `"head"`

- [ ] **Scenario 2**: Loading state for the version fetch
    - **Given** a library has just been selected and the version fetch is in flight
    - **When** rendering
    - **Then** the Version `<Select>` is disabled
    - **And** a small Mantine `<Loader size="xs" />` is shown next to it

- [ ] **Scenario 3**: Confirm returns the right shape
    - **Given** the user confirms with library `lib-1` and a chosen version row whose `versionNumber === 3`
    - **When** the confirm callback fires
    - **Then** it returns `{ workflowId: "lib-1", version: 3 }`
    - **And** when the user confirms with `"head"` left selected, it returns `{ workflowId: "lib-1" }` (NO `version` key)

- [ ] **Scenario 4**: Confirm disabled until a library row is selected
    - **Given** the modal has just opened (no row selected)
    - **When** rendering
    - **Then** the Confirm button is disabled
    - **And** the Version Select is hidden or disabled (no row to fetch versions for)

- [ ] **Scenario 5**: Vitest coverage
    - **Given** the modal with the new Select
    - **When** `npm test` runs
    - **Then** tests cover: Select appears after library selection, default `"head"`, returned object shape (with and without `version`), confirm-disabled gating

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx` — add the version Select + amend the confirm callback signature
- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` — update the call site to consume the new `{ workflowId, version? }` shape and stamp `workflowRef.library.version`
- `apps/frontend/src/features/workflow-builder/library/__tests__/LibraryPickerModal.test.tsx` — scenarios 1–4

## Notes

- The badge rendering for the pinned version on the settings panel is a sibling story (US-087); this story focuses on the picker flow.
- The shared schema change (US-076) must land + Vite must restart before this story can complete frontend type-checking.
