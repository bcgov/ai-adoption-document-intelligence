# US-181: `/dynamic-nodes/new` + `/dynamic-nodes/:slug` pages + top-bar nav link

**As a** group member,
**I want** standalone full-page mounts of the editor for create + edit + the top-bar nav link to reach them,
**So that** the editor is discoverable from anywhere in the app and the full-page layout gives the panes more room than the in-situ modal.

## Acceptance Criteria

- [x] **Scenario 1**: Create route + page
    - **Given** `apps/frontend/src/App.tsx`
    - **When** the routes are read after the change
    - **Then** `<Route path="/dynamic-nodes/new" element={<DynamicNodeNewPage />}>` is registered
    - **And** `DynamicNodeNewPage.tsx` exports a default component that mounts `<DynamicNodeEditor onAfterPublish={(slug) => navigate(\`/dynamic-nodes/\${slug}\`)} />` (transitions to the edit page after first publish, so the version history pane lights up)

- [x] **Scenario 2**: Edit route + page
    - **Given** the same App.tsx
    - **When** read
    - **Then** `<Route path="/dynamic-nodes/:slug" element={<DynamicNodeEditPage />}>` is registered
    - **And** `DynamicNodeEditPage.tsx` reads `slug` from `useParams()` and mounts `<DynamicNodeEditor slug={slug} />`
    - **And** if `useDynamicNode(slug)` returns 404 the page renders "Dynamic node not found or deleted" with a link back to `/dynamic-nodes`

- [x] **Scenario 3**: Top-bar nav link "Dynamic nodes"
    - **Given** the top-bar nav component (currently shows Workflows / Templates / Settings — locate the existing component)
    - **When** the nav is read after the change
    - **Then** a new link "Dynamic nodes" is added between the existing entries
    - **And** the active state highlights when on any `/dynamic-nodes*` route

- [x] **Scenario 4**: Full-page layout for the editor
    - **Given** the editor is mounted full-page (NOT inside a modal)
    - **When** rendered
    - **Then** the panes get more room (~70% / ~20% / ~10% — wider code pane on full-page; narrower side panes)
    - **And** the editor exposes a layout-mode prop (`"modal" | "full-page"`) so the same component works in both contexts
    - **And** the default layout-mode for the new + edit pages is `"full-page"`

- [x] **Scenario 5**: After-delete navigation
    - **Given** the edit page is open and the user clicks Delete + confirms
    - **When** the mutation succeeds
    - **Then** the page navigates back to `/dynamic-nodes` (the list)
    - **And** the list refetches via the standard invalidation chain

- [x] **Scenario 6**: Tests cover both pages + nav
    - **Given** `DynamicNodeNewPage.spec.tsx` + `DynamicNodeEditPage.spec.tsx`
    - **When** the suite runs
    - **Then** tests pass for: new page mounts editor in create mode; edit page reads slug + mounts editor in edit mode; navigation after publish transitions correctly; 404 path renders the "not found" message; delete navigates back to list

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/pages/dynamic-nodes/DynamicNodeNewPage.tsx` — new file
- `apps/frontend/src/pages/dynamic-nodes/DynamicNodeEditPage.tsx` — new file
- `apps/frontend/src/pages/dynamic-nodes/DynamicNodeNewPage.spec.tsx` — new test
- `apps/frontend/src/pages/dynamic-nodes/DynamicNodeEditPage.spec.tsx` — new test
- `apps/frontend/src/App.tsx` — register both routes
- `apps/frontend/src/<existing-top-bar-nav-location>/TopBarNav.tsx` — add the link
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` — accept `layout?: "modal" | "full-page"` prop

## Technical notes

- The `layout` prop adjusts the grid ratio (full-page vs modal) — keep the pane components themselves unchanged.
- 404 handling: the `useDynamicNode` hook's `error.status === 404` (or equivalent error shape from the existing apiClient) drives the not-found render.
- After landing: no Vite restart (frontend-only).
