# US-153: `useWorkflowRuns` hook + `RunHistoryDrawer` shell + `RunHistoryFilters`

**As a** user wanting to look back at past executions of a workflow,
**I want** a Run history drawer (sibling to the existing Version history drawer) that lists past runs with status / date / version filters and infinite-scroll pagination,
**So that** I have a dedicated UI surface for "what did this workflow do recently?" without conflating it with the per-config Version history.

## Acceptance Criteria

- [ ] **Scenario 1**: Top-bar "Run history" button
    - **Given** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
    - **When** read after the change
    - **Then** a new top-bar button labelled "Run history" with `IconClipboardList` (Tabler) renders between "Save" and "Run this workflow"
    - **And** disabled in create mode with Tooltip "Save the workflow first"
    - **And** click opens a new `<RunHistoryDrawer>` component

- [ ] **Scenario 2**: `useWorkflowRuns` infinite-query hook
    - **Given** `apps/frontend/src/features/workflow-builder/run-history/useWorkflowRuns.ts` (new file)
    - **When** read
    - **Then** it exports `function useWorkflowRuns(workflowId: string, filters: ListRunsQuery)` returning a TanStack `useInfiniteQuery` result
    - **And** `queryKey: ["workflow-runs", workflowId, filters]`
    - **And** `getNextPageParam: (lastPage) => lastPage.nextCursor`
    - **And** changing the filters resets pagination (new query key)

- [ ] **Scenario 3**: `RunHistoryDrawer` layout
    - **Given** `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx` (new file)
    - **When** read
    - **Then** it renders a right-side Mantine `<Drawer position="right" size="lg">` with: a sticky header containing `RunHistoryFilters`, a scrollable list area with `RunRow` (US-154) per row, and an `IntersectionObserver` sentinel at the bottom that triggers `fetchNextPage`
    - **And** loading: 3 `<Skeleton>` rows; empty (no runs match filters): "No runs match these filters."; error: red `<Alert>`

- [ ] **Scenario 4**: `RunHistoryFilters` component
    - **Given** `apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx` (new file)
    - **When** read
    - **Then** it renders: a Mantine `<Select label="Status" data={["all", "running", "succeeded", "failed", "cancelled"]}>`, two `<DateInput label="From" / "To">` (Mantine `@mantine/dates`), and a `<Select label="Version">` populated from `useWorkflowVersions(workflowId)` (Phase 2 Track 3 hook)
    - **And** changes propagate up via an `onChange(filters)` prop
    - **And** "all" status / undefined dates / undefined version → no filter (omits the query param)

- [ ] **Scenario 5**: Cursor-pagination on scroll
    - **Given** the user scrolls past the visible rows
    - **When** the bottom sentinel intersects the viewport
    - **Then** `fetchNextPage` is triggered, the next 50 rows append, and `IntersectionObserver` re-arms
    - **And** when `hasNextPage === false`, no more fetches; a small "End of history" line renders

- [ ] **Scenario 6**: Tests cover hook + drawer + filters
    - **Given** the drawer + filter + hook test files
    - **When** tests run
    - **Then** at least 5 cases pass: drawer opens from button, filters propagate to hook query key, hook fetches initial page, infinite-scroll triggers nextPage, empty-state renders

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run-history/useWorkflowRuns.ts` — hook
- `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx` — drawer
- `apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx` — filters
- `apps/frontend/src/features/workflow-builder/run-history/useWorkflowRuns.test.tsx` — hook test
- `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.test.tsx` — drawer test
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — add Run history top-bar button + drawer mount

## Technical notes

- TanStack's `useInfiniteQuery` is already a dependency. The hook returns `data.pages = [{ runs, nextCursor }, ...]`; the drawer flattens via `pages.flatMap(p => p.runs)`.
- The `RunRow` component is US-154's responsibility — this story stops at the drawer shell + filters + hook.
- `@mantine/dates` for `<DateInput>` may need to be added if not already present. Check `apps/frontend/package.json` before opening the PR; if absent, add it (it's a sibling of `@mantine/core`).
- After landing: no Vite restart (frontend-only).
