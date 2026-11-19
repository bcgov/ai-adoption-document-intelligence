# US-060: `SaveAsLibraryModal`: name + description + inputs[] + outputs[] editors

**As a** workflow author saving a library,
**I want** to declare a clear signature (name + description + inputs +
outputs) in the modal,
**So that** the library's consumers (childWorkflow nodes + the AI
agent) have a well-typed contract.

## Acceptance Criteria

- [ ] **Scenario 1**: Modal renders four sections
    - **Given** the modal is open
    - **When** it renders
    - **Then** four sections appear in order: Name (TextInput), Description (Textarea), Inputs (list editor), Outputs (list editor)

- [ ] **Scenario 2**: Name and Description prefill
    - **Given** a workflow with `metadata.name = "My Workflow"` and `metadata.description = "Sample"`
    - **When** the modal opens
    - **Then** the Name field shows "My Workflow" and the Description field shows "Sample"
    - **And** the user can edit either before saving

- [ ] **Scenario 3**: Inputs editor adds + removes rows
    - **Given** the Inputs section
    - **When** the user clicks "Add input"
    - **Then** a new row appears with empty Label, Path, and Type fields
    - **And** each row has a remove button that drops it from the list

- [ ] **Scenario 4**: Row shape matches `LibraryPortDescriptor`
    - **Given** a populated Inputs row with label "Doc URL", path "ctx.documentUrl", type "string"
    - **When** the form state is read
    - **Then** the row serializes to `{ label: "Doc URL", path: "ctx.documentUrl", type: "string" }`

- [ ] **Scenario 5**: Outputs editor behaves identically to Inputs
    - **Given** the Outputs section
    - **When** the same operations are performed
    - **Then** behavior is the same — same row shape, same add/remove affordances

- [ ] **Scenario 6**: Form validation blocks empty Name
    - **Given** the Name field is empty
    - **When** the user clicks Save
    - **Then** an inline error is shown and no backend call is made
    - **And** the row-level fields (label, path) are similarly required: empty rows cannot be saved

- [ ] **Scenario 7**: vitest covers the modal
    - **Given** a sibling vitest file
    - **When** the tests run
    - **Then** at least three tests cover: row add/remove, prefill from metadata, validation on submit

## Notes

The list editor row UI should mirror `ExposedParamsEditor` (located at
`apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx`)
adapted to the simpler `LibraryPortDescriptor` shape (no `nodeId`, no
`options`, no `default`). Consider extracting a shared list-editor
shell if the duplication is meaningful — otherwise inline the rows.

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx` — fills in the modal shell with all four sections
- `apps/frontend/src/features/workflow-builder/library/LibraryPortListEditor.tsx` (NEW) — reusable list editor for inputs + outputs
- vitest test file for the modal
