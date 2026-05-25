# US-176: `DynamicNodeEditor` shell + TanStack hooks

**As a** frontend engineer building the dynamic-node authoring surface,
**I want** a shell component that lays out the three panes + four TanStack hooks (`useDynamicNode`, `useDynamicNodeList`, `useDynamicNodePublish`, `useDynamicNodeDelete`),
**So that** subsequent stories (US-177/US-178/US-179) fill in each pane against a stable data layer that's used by BOTH the in-situ modal (US-183) and the management page (US-180/US-181).

## Acceptance Criteria

- [ ] **Scenario 1**: New `dynamic-nodes/` feature directory with the shell component
    - **Given** `apps/frontend/src/features/workflow-builder/dynamic-nodes/`
    - **When** read after the change
    - **Then** the directory contains `DynamicNodeEditor.tsx` exporting a default `DynamicNodeEditor` component that accepts `{ slug?: string; onAfterPublish?: (publishedSlug: string) => void; onClose?: () => void }`
    - **And** when `slug` is undefined the component is in create mode (boilerplate script, POST on publish); when `slug` is set the component is in edit mode (load script, PUT on publish)

- [ ] **Scenario 2**: Three-pane Mantine layout
    - **Given** the shell component
    - **When** rendered
    - **Then** it uses Mantine `<Grid>` (or `<SimpleGrid>`) with three columns sized ~60% / ~25% / ~15%
    - **And** the panes are placeholder components for now (`<CodePane>`, `<SignaturePreviewPane>`, `<VersionHistoryPane>`) — bodies land in US-177/US-178/US-179
    - **And** a top bar above the grid contains "Publish" + "Delete" buttons (disabled in create mode until the script parses; Delete disabled in create mode entirely)

- [ ] **Scenario 3**: Four TanStack hooks declared
    - **Given** the directory after the change
    - **When** read
    - **Then** it exports: `useDynamicNode(slug)` (GET /api/dynamic-nodes/:slug), `useDynamicNodeList()` (GET /api/dynamic-nodes), `useDynamicNodePublish(slug?)` (POST when slug is null, PUT otherwise), `useDynamicNodeDelete(slug)` (DELETE)
    - **And** each hook uses the standard project conventions (TanStack v5 query/mutation, `apiClient` from the existing wrapper)

- [ ] **Scenario 4**: Hook invalidations wired correctly
    - **Given** the mutations
    - **When** any of POST / PUT / DELETE succeeds
    - **Then** the mutation's `onSuccess` invalidates: `['activity-catalog']` (for the palette), `['dynamic-node', slug]` (the single-lineage detail hook), `['dynamic-node-list']` (the list hook)
    - **And** the catalog hot-reload from US-175 then closes the loop on the canvas

- [ ] **Scenario 5**: Top bar errors surface via Mantine notifications
    - **Given** the Publish button is clicked and the backend returns 400 with `errors: [...]`
    - **When** the mutation rejects
    - **Then** the shell renders a red Mantine notification "Publish failed — see error markers" without unmounting the editor
    - **And** the structured errors are passed to the `CodePane` (US-177) for inline rendering — this story sets up the error-passing prop, US-177 consumes it

- [ ] **Scenario 6**: Tests cover the shell shape + mutation routing
    - **Given** `DynamicNodeEditor.spec.tsx`
    - **When** the test runs
    - **Then** it asserts: shell renders three panes in create mode + boilerplate is passed to CodePane; in edit mode, useDynamicNode is fetched and the script is wired into CodePane; Publish in create mode calls POST; Publish in edit mode calls PUT; Delete only renders in edit mode

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` — new file
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNode.ts` — new hook
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNodeList.ts` — new hook
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNodePublish.ts` — new hook
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNodeDelete.ts` — new hook
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.spec.tsx` — new test
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/index.ts` — barrel exports

## Technical notes

- This story is the scaffolding for Milestone E + F. US-177/178/179 fill in the pane bodies; US-180/181/183 mount the shell.
- The hook bodies are small — each is roughly 15-20 lines (fetcher + queryKey + invalidation). The aggregate is one of the simplest milestone openers.
- Keep the shell's prop API minimal: `{ slug?, onAfterPublish?, onClose? }`. Don't add cross-cutting concerns here; they belong in the mounts.
- After landing: ask Alex to restart Vite if `@ai-di/graph-workflow` was rebuilt (US-161 already triggered this) — otherwise no restart for frontend-only changes.
