# US-061: Submitting the modal POSTs a new workflow with `workflowKind: "library"` + metadata stamp

**As a** workflow author who's just declared a library signature,
**I want** the modal's Save button to create a new library workflow in
the backend,
**So that** the library is immediately available to childWorkflow node
pickers + future AI-agent composition.

## Acceptance Criteria

- [ ] **Scenario 1**: Save POSTs a new workflow with the library kind
    - **Given** the modal with valid Name, Description, Inputs, Outputs
    - **When** the user clicks Save
    - **Then** a POST is made to `/api/workflows` with `workflowKind: "library"` in the request body
    - **And** the request body's `config` carries `metadata.kind = "library"`, `metadata.inputs = <user's rows>`, `metadata.outputs = <user's rows>`, `metadata.name = <user's Name>`, `metadata.description = <user's Description>`

- [ ] **Scenario 2**: The current workflow is NOT modified
    - **Given** an existing workflow being edited at `/workflows/:id/edit-v2`
    - **When** "Save as library" succeeds
    - **Then** the original workflow's DB record is unchanged
    - **And** the URL doesn't navigate away

- [ ] **Scenario 3**: Success toast offers a "View library" link
    - **Given** the POST succeeds with a new library workflow ID
    - **When** the toast renders
    - **Then** the toast text reads "Saved as library" or similar
    - **And** the toast includes a "View library" link that navigates to `/workflows/:newLibraryId/edit-v2`

- [ ] **Scenario 4**: API failure is surfaced
    - **Given** the POST fails (e.g., 4xx or 5xx)
    - **When** the modal handles the rejection
    - **Then** an error notification is shown with the backend's error message and the modal stays open with the user's input preserved

- [ ] **Scenario 5**: The existing canvas state is captured at submit time
    - **Given** unsaved canvas changes in the current workflow
    - **When** "Save as library" runs
    - **Then** the canvas state at the moment of submit is what gets POSTed (not the last-saved state)

- [ ] **Scenario 6**: vitest covers the submit path
    - **Given** a vitest file with mocked `useCreateWorkflow` hook
    - **When** the tests run
    - **Then** at least one test asserts the POST body shape (kind + metadata.kind + inputs + outputs)
    - **And** another test asserts success-toast rendering

## Notes

If the backend's `CreateWorkflowDto` doesn't currently accept a `kind`
field, this story extends it. The backend should default to
`kind = "workflow"` (mapped to `WorkflowKind.primary`) when the field
is absent, preserving the current behavior for existing callers.

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx` — submit handler
- `apps/frontend/src/data/hooks/useWorkflows.ts` — extend `useCreateWorkflow` payload type to optionally include `kind` (if not already supported)
- `apps/backend-services/src/workflow/dto/create-workflow.dto.ts` — add optional `kind` field with `@ApiProperty`
- `apps/backend-services/src/workflow/workflow.service.ts` — pass `kind` to Prisma create
- vitest test file for the submit + toast
- backend test coverage for the new `kind` payload field
