# US-180: `/dynamic-nodes` management page — list view

**As a** group member managing dynamic nodes across multiple workflows,
**I want** a standalone page that lists every dynamic node in my group with version + usage counts and per-row delete affordance,
**So that** I can audit, edit, or remove dynamic nodes without first opening a workflow that uses them.

## Acceptance Criteria

- [ ] **Scenario 1**: Route registered + page renders the table
    - **Given** `apps/frontend/src/App.tsx`
    - **When** the routes are read after the change
    - **Then** a new route `<Route path="/dynamic-nodes" element={<DynamicNodesListPage />}>` is registered
    - **And** `DynamicNodesListPage.tsx` exports a default component that renders a Mantine `<Table>` with columns: `Slug`, `Head version`, `Last published`, `Versions`, `Used in workflows`, `Actions`

- [ ] **Scenario 2**: List data sourced from `useDynamicNodeList`
    - **Given** the existing hook from US-176
    - **When** the page mounts
    - **Then** the hook fetches `GET /api/dynamic-nodes` and the table renders one row per non-deleted lineage
    - **And** rows are sorted by `slug` ascending (matching the endpoint's order)
    - **And** `Last published` renders as relative time ("3 hours ago")

- [ ] **Scenario 3**: Row actions — Edit + Delete
    - **Given** a row
    - **When** the user clicks the slug (or "Edit" icon)
    - **Then** the page navigates to `/dynamic-nodes/<slug>`
    - **And** clicking the "Delete" icon opens a confirm modal "Delete \`<slug>\`? Used in N workflows. Workflows using this node will stop working until restored." with a red "Delete" button + a "Cancel" button
    - **And** confirming calls `useDynamicNodeDelete(slug)`; on success a green notification + the list refetches

- [ ] **Scenario 4**: Empty state
    - **Given** the calling group has zero dynamic nodes
    - **When** the page renders after the hook resolves
    - **Then** instead of an empty table the page shows a centered "No custom nodes yet" message + a "+ Create your first" button linking to `/dynamic-nodes/new`

- [ ] **Scenario 5**: Loading + error states
    - **Given** the hook is loading
    - **When** the page renders
    - **Then** the table shows 5 Skeleton rows
    - **And** on hook error the page shows a red `<Alert>` with the error message + a retry button

- [ ] **Scenario 6**: Tests cover render + actions
    - **Given** `DynamicNodesListPage.spec.tsx`
    - **When** the test runs
    - **Then** tests pass for: populated list renders rows; empty state renders the CTA; Delete opens confirm modal + calls the mutation on confirm; clicking a slug navigates to the edit route

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/pages/dynamic-nodes/DynamicNodesListPage.tsx` — new file
- `apps/frontend/src/pages/dynamic-nodes/DynamicNodesListPage.spec.tsx` — new test
- `apps/frontend/src/App.tsx` — register route

## Technical notes

- The "Used in N workflows" count comes from the backend's list response (US-167's `usedInWorkflowCount` field — already populated by the LIKE query).
- The confirm-modal "Used in N workflows" wording uses the count from the row's `usedInWorkflowCount`. The DELETE endpoint's response also returns the same count for an updated "Used in N workflows" message in case the count changes between page load and delete click.
- Top-bar nav link is wired in US-181 (alongside the New + Edit pages).
- After landing: no Vite restart (frontend-only).
