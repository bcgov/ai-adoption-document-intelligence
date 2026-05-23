NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone A — Shared schema + types (US-054 to US-056)

| File | Title |
|---|---|
| [US-054-workflow-kind-library-enum.md](./US-054-workflow-kind-library-enum.md) | Add `library` to the `WorkflowKind` Prisma enum + migration |
| [US-055-graph-metadata-library-fields.md](./US-055-graph-metadata-library-fields.md) | Extend `GraphMetadata` with optional `kind`, `inputs[]`, `outputs[]` + `LibraryPortDescriptor` type |
| [US-056-validator-accepts-library-metadata.md](./US-056-validator-accepts-library-metadata.md) | Validator tests confirm existing graphs still validate; library metadata is accepted |

## Milestone B — Backend `?kind=library` filter (US-057 to US-058)

| File | Title |
|---|---|
| [US-057-workflows-kind-query-param.md](./US-057-workflows-kind-query-param.md) | `GET /api/workflows` accepts a `kind=workflow|library` query param + Swagger DTOs |
| [US-058-default-list-excludes-library.md](./US-058-default-list-excludes-library.md) | Default (unfiltered) list excludes library workflows; backend unit tests cover all three paths |

## Milestone C — Frontend "Save as library" (US-059 to US-061)

| File | Title |
|---|---|
| [US-059-save-as-library-top-bar-action.md](./US-059-save-as-library-top-bar-action.md) | "Save as library" button next to Save in `WorkflowEditorV2Page` top bar |
| [US-060-save-as-library-modal-fields.md](./US-060-save-as-library-modal-fields.md) | `SaveAsLibraryModal`: name + description + inputs[] + outputs[] editors |
| [US-061-save-as-library-creates-new-record.md](./US-061-save-as-library-creates-new-record.md) | Submitting the modal POSTs a new workflow with `workflowKind: "library"` + metadata stamp |

## Milestone D — Frontend library picker (US-062 to US-063)

| File | Title |
|---|---|
| [US-062-library-picker-modal.md](./US-062-library-picker-modal.md) | `LibraryPickerModal` counterpart to `TemplatesPickerModal`; fetches `/api/workflows?kind=library` |
| [US-063-child-workflow-uses-library-picker.md](./US-063-child-workflow-uses-library-picker.md) | `ChildWorkflowNodeSettings` replaces free-text `workflowId` with a "Pick library workflow" button |

## Milestone E — Verification (US-064)

| File | Title |
|---|---|
| [US-064-end-to-end-library-verification.md](./US-064-end-to-end-library-verification.md) | Playwright walkthrough: save library → add childWorkflow → pick library → round-trip |

## Suggested Implementation Order (by dependency)

Library workflows have a clearer dependency chain than Phase 1B, since
the shared schema + types need to land before the backend filter, and
the frontend picker depends on the backend filter. Order:

### Phase 1 — schema + types
- [x] **US-054** (WorkflowKind.library Prisma enum + migration)
- [x] **US-055** (GraphMetadata + LibraryPortDescriptor in `@ai-di/graph-workflow`)
- [x] **US-056** (validator tests)

### Phase 2 — backend
- [x] **US-057** (`?kind` query param + Swagger DTOs)
- [x] **US-058** (default excludes library; full backend tests)

### Phase 3 — frontend Save-as-Library
- [x] **US-059** (top-bar button)
- [x] **US-060** (modal fields)
- [x] **US-061** (modal submit → POST new library record)

### Phase 4 — frontend Library Picker
- [x] **US-062** (`LibraryPickerModal`)
- [x] **US-063** (`ChildWorkflowNodeSettings` wires the picker)

### Phase 5 — verification
- [ ] **US-064** (end-to-end Playwright walkthrough — pending dev-server restart + API key)

> Phase 1 must land + Vite restart before Phase 3 starts (because the
> frontend imports the new `LibraryPortDescriptor` type and the new
> `GraphMetadata` fields). Phase 2 must land before Phase 4 (because
> the picker hits the backend filter). Phase 3 and Phase 4 are
> independent and could be parallelised; suggest implementing 3 first
> since 4 verifies against a saved library.
