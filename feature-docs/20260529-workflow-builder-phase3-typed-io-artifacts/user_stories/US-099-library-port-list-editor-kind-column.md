# US-099: `LibraryPortListEditor` "Kind" Select column

**As a** library publisher,
**I want** to annotate each of my library's declared inputs/outputs with an `ArtifactKind`,
**So that** parent workflows referencing this library via a `childWorkflow` node get typed handles + filtered pickers + save-time kind enforcement at the library boundary.

## Acceptance Criteria

- [ ] **Scenario 1**: New "Kind" column renders alongside the existing columns
    - **Given** `SaveAsLibraryModal` is open with one or more `inputs[]` rows in the `LibraryPortListEditor`
    - **When** the editor renders
    - **Then** each row shows columns in the order: Label, Path, Type, **Kind**, (existing trailing actions)
    - **And** the Kind column header reads `"Kind"`
    - **And** the same column appears in the `outputs[]` section

- [ ] **Scenario 2**: Kind Select uses the same options as US-098
    - **Given** any port row's Kind Select is opened
    - **When** the options render
    - **Then** the options are identical to US-098 Scenario 2 (blank "—" first, then registry entries grouped by family, plus array variants)
    - **And** the implementation re-uses `buildKindSelectOptions()` from `kind-select-options.ts` (US-098) — no duplication

- [ ] **Scenario 3**: Save flow persists `kind` onto `LibraryPortDescriptor`
    - **Given** a library being saved with one input whose Kind is "Document" and one output whose Kind is "OcrResult"
    - **When** the modal's Confirm button is clicked
    - **Then** the `POST /api/workflows` body's `metadata.inputs[0].kind === "Document"` and `metadata.outputs[0].kind === "OcrResult"`
    - **And** the backend stores the values verbatim
    - **And** a subsequent `GET /api/workflows/:id` returns the same `kind` values

- [ ] **Scenario 4**: "—" stripped on save; legacy libraries reload cleanly
    - **Given** a port row whose Kind is "—" (or has never been set)
    - **When** saved + reloaded
    - **Then** the persisted JSON has no `kind` key on that descriptor
    - **And** legacy libraries (pre-Phase-3, no `kind` fields anywhere) reload with all rows showing "—" by default
    - **And** existing Phase 2 Track 1 tests around `LibraryPortListEditor` remain green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/library/LibraryPortListEditor.tsx` — add the new column
- `apps/frontend/src/features/workflow-builder/library/LibraryPortListEditor.test.tsx` — extend existing tests with scenarios 1-4

## Technical notes

- Re-use the helper from US-098 (`kind-select-options.ts`). Avoid drift between the two editors.
- The column placement (after Type) is the LibraryPortListEditor analog of US-098's "after Description, before Default" — same flow concept, adapted to the LibraryPort schema's existing column order.
- Save serialization must strip empty `kind` fields the same way US-098 does.
