# US-063: `ChildWorkflowNodeSettings` replaces free-text `workflowId` with a "Pick library workflow" button

**As a** workflow author placing a `childWorkflow` node,
**I want** to pick the referenced library from a list instead of
typing a workflowId by hand,
**So that** typos are impossible and I can see each library's signature
before committing.

## Acceptance Criteria

- [ ] **Scenario 1**: Library branch shows the picker button
    - **Given** a `childWorkflow` node selected with `workflowRef.type === "library"`
    - **When** the right-rail settings panel renders
    - **Then** the free-text `workflowId` TextInput is gone
    - **And** a "Pick library workflow" button is shown in its place

- [ ] **Scenario 2**: Clicking the button opens the modal
    - **Given** the button is visible
    - **When** the user clicks it
    - **Then** `LibraryPickerModal` opens

- [ ] **Scenario 3**: Picking a library writes the workflowRef
    - **Given** the picker is open and the user selects library `L` (id `lib-123`)
    - **When** the modal's `onSelect` fires
    - **Then** the node's `workflowRef` is updated to `{ type: "library", workflowId: "lib-123" }`
    - **And** the modal closes

- [ ] **Scenario 4**: Selected library's signature renders below the picker
    - **Given** a `childWorkflow` node with `workflowRef.workflowId = "lib-123"` set
    - **When** the settings panel renders
    - **Then** a read-only summary of the library's name + declared `inputs[]` / `outputs[]` shows below the picker button
    - **And** the summary fetches the library on mount if not already cached

- [ ] **Scenario 5**: Picker can be reopened to swap libraries
    - **Given** an already-selected library
    - **When** the user clicks "Pick library workflow" again
    - **Then** the modal reopens, allowing a different selection
    - **And** picking a new library overwrites the previous `workflowId`

- [ ] **Scenario 6**: Inline branch is unchanged
    - **Given** a `childWorkflow` node with `workflowRef.type === "inline"`
    - **When** the settings panel renders
    - **Then** the inline branch's existing UI is unchanged (only the library branch was modified)

- [ ] **Scenario 7**: vitest covers the new flow
    - **Given** mocked `LibraryPickerModal` + mocked library fetch
    - **When** tests run
    - **Then** at least one asserts: button → modal open → onSelect → workflowRef updated

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` — replace TextInput with button + render signature summary
- vitest test file for `ChildWorkflowNodeSettings` — new tests for the picker flow
