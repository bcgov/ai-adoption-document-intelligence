# US-059: "Save as library" button next to Save in `WorkflowEditorV2Page` top bar

**As a** workflow author who wants to turn the current canvas into
a reusable building block,
**I want** a top-bar action to "Save as library",
**So that** I can declare the library signature and persist it without
disturbing the current workflow's save state.

## Acceptance Criteria

- [ ] **Scenario 1**: Button is present in the top bar
    - **Given** the V2 editor at `/workflows/create-v2` or `/workflows/:id/edit-v2`
    - **When** the top bar renders
    - **Then** a "Save as library" button is visible, sized + styled consistently with the existing Save button

- [ ] **Scenario 2**: Click opens the `SaveAsLibraryModal`
    - **Given** the top bar
    - **When** the user clicks "Save as library"
    - **Then** the `SaveAsLibraryModal` opens with the current workflow's `name` and `description` prefilled

- [ ] **Scenario 3**: Modal can be cancelled
    - **Given** the modal is open
    - **When** the user clicks Cancel (or the close X)
    - **Then** the modal closes without making any backend calls or mutating the editor's state

- [ ] **Scenario 4**: Existing Save button is unchanged
    - **Given** the existing Save button
    - **When** clicked
    - **Then** the workflow saves with `workflow_kind = primary` as before (no implicit library promotion)

- [ ] **Scenario 5**: Component tests for the top bar
    - **Given** vitest tests for `WorkflowEditorV2Page.tsx`
    - **When** the tests run
    - **Then** at least one test asserts the "Save as library" button is present and clicking it opens the modal

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — add the button + modal-open state
- `apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx` (NEW — shell, US-060 fills in fields)
- `apps/frontend/src/features/workflow-builder/__tests__/WorkflowEditorV2Page.test.tsx` (or sibling test file) — add button-presence + open-modal test
