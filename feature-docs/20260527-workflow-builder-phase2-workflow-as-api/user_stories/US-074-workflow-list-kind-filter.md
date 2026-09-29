# US-074: `WorkflowListPage` adds a SegmentedControl (All / Workflows / Libraries)

**As a** workflow author who has saved library workflows,
**I want** to browse my library workflows from the main workflow list
page,
**So that** I don't need to open a childWorkflow node to see what
library workflows exist.

## Acceptance Criteria

- [x] **Scenario 1**: SegmentedControl is present above the list
    - **Given** the `/workflows` list page
    - **When** it renders
    - **Then** a Mantine `<SegmentedControl>` is present above the list with three options: "Workflows", "Libraries", "All"
    - **And** the default selection is "Workflows" (matches current behavior — libraries hidden by default)

- [x] **Scenario 2**: "Workflows" tab calls the backend with no `kind` filter, including default exclusion
    - **Given** the "Workflows" tab is selected
    - **When** the list fetches
    - **Then** the request hits `/api/workflows` (no `kind` query param)
    - **And** libraries are hidden (backend default per Track 1)

- [x] **Scenario 3**: "Libraries" tab calls the backend with `kind=library`
    - **Given** the "Libraries" tab is selected
    - **When** the list fetches
    - **Then** the request hits `/api/workflows?kind=library`
    - **And** only library workflows appear

- [x] **Scenario 4**: "All" tab calls the backend with no exclusion
    - **Given** the "All" tab is selected
    - **When** the list fetches
    - **Then** the request hits `/api/workflows?kind=all` (or equivalent — extend the backend if needed)
    - **And** both regular and library workflows appear in the list

- [x] **Scenario 5**: Row links unchanged
    - **Given** any row in any tab
    - **When** the user clicks the "Edit (visual)" link
    - **Then** the existing `/workflows/:id/edit-v2` route opens — no changes to row content

- [x] **Scenario 6**: Empty state per tab
    - **Given** a tab with zero matching workflows
    - **When** the list renders
    - **Then** an empty-state message specific to the tab appears ("No library workflows yet. Use 'Save as library' in the editor to create one." for Libraries; existing copy for Workflows)

- [x] **Scenario 7**: Vitest coverage
    - **Given** the page's existing component test
    - **When** `npm test` runs
    - **Then** Scenarios 2, 3, 4 are covered (with mocked TanStack Query responses)

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/pages/WorkflowListPage.tsx` (or the equivalent existing list page) — add the SegmentedControl + wire it to the `useWorkflows({ kind })` hook
- `apps/frontend/src/api/use-workflows.ts` (or equivalent) — accept `kind: "workflow" | "library" | "all"` (extend the existing `kind` typing from Track 1; add the `all` value)
- `apps/backend-services/src/workflow/workflow.controller.ts` — accept `?kind=all` (no filter, no default exclusion) — extend the existing kind query param
- `apps/backend-services/src/workflow/workflow.service.ts` — `buildWorkflowKindWhere()` returns `{}` for `kind=all`
- The page's component test — add the new test cases

## Notes

- The `WorkflowKind` enum has three values today (`primary`, `library`, `benchmark_candidate`); the UI conflates `primary` + `benchmark_candidate` under "Workflows" — the SegmentedControl is a user-facing simplification, not a one-to-one enum exposure.
- The backend's existing `includeBenchmarkCandidates` query param keeps working unchanged — `kind=all` is purely about *also including library*.
