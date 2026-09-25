# US-062: `LibraryPickerModal` counterpart to `TemplatesPickerModal`; fetches `/api/workflows?kind=library`

**As a** workflow author wiring up a `childWorkflow` node,
**I want** to browse available library workflows and pick one,
**So that** I don't have to know or paste a library's workflowId by
hand.

## Acceptance Criteria

- [ ] **Scenario 1**: Modal fetches libraries on open
    - **Given** the modal is closed
    - **When** the user opens it (via the host's "Pick library workflow" trigger)
    - **Then** a `GET /api/workflows?kind=library` request is made
    - **And** the response populates the modal's list

- [ ] **Scenario 2**: Each row shows the library's signature
    - **Given** the fetched library list
    - **When** the rows render
    - **Then** each row shows `name`, `description` (truncated), and a compact summary of declared `inputs[]` / `outputs[]` (e.g., "3 inputs · 2 outputs")
    - **And** clicking the row's expand-arrow (or hover) reveals the full per-port label/path/type list

- [ ] **Scenario 3**: Selecting a row emits the selection
    - **Given** a row representing library `L`
    - **When** the user clicks the row's "Use this" button (or double-clicks the row)
    - **Then** the modal closes
    - **And** the host's `onSelect(library)` callback is invoked with the full library workflow record

- [ ] **Scenario 4**: Empty state is helpful
    - **Given** the backend returns zero libraries
    - **When** the modal renders
    - **Then** an empty-state message reads something like "No libraries yet — save a workflow as a library to populate this list" with a link to documentation if available

- [ ] **Scenario 5**: Loading + error states are surfaced
    - **Given** the GET request is in flight or fails
    - **When** the modal renders
    - **Then** a loader spins during fetch
    - **And** an error message is shown if the fetch fails, with a Retry button

- [ ] **Scenario 6**: Modal API mirrors `TemplatesPickerModal`
    - **Given** the new modal
    - **When** TypeScript checks the props
    - **Then** the props shape is `{ opened: boolean; onClose(): void; onSelect(library): void }` — symmetric with `TemplatesPickerModalProps`

- [ ] **Scenario 7**: vitest covers happy + empty + error paths
    - **Given** mocked `useWorkflows({ kind: "library" })` returns (a) one library, (b) empty list, (c) error
    - **When** each scenario runs
    - **Then** the modal renders the expected state and the `onSelect` callback fires only in (a) after the user clicks Use

## Notes

The fetch should go through a new or extended `useWorkflows` hook
variant — `useWorkflows({ kind: "library" })` — that calls
`GET /api/workflows?kind=library`. This keeps the modal stateless
relative to data fetching, mirroring the `TemplatesPickerModal`
pattern (which reads in-memory templates today).

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx` (NEW)
- `apps/frontend/src/data/hooks/useWorkflows.ts` — extend or add `useLibraryWorkflows()` variant
- vitest test file for the modal
