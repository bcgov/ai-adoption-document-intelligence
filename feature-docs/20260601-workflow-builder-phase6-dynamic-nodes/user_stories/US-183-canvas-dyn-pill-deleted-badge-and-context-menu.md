# US-183: Canvas DYN pill + "Deleted" badge + right-click "Edit script" in-situ modal

**As a** workflow author looking at the canvas,
**I want** dynamic nodes visually distinct via a "DYN" pill, soft-deleted lineages flagged with a "Deleted" badge, and a right-click "Edit script" affordance that opens the editor in a modal,
**So that** I instantly recognize custom nodes versus static activities + can iterate on a script without leaving the canvas.

## Acceptance Criteria

- [ ] **Scenario 1**: DYN pill on canvas dynamic-node renderer
    - **Given** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (and the node renderer it dispatches to for `dyn.*` types)
    - **When** a node with `type.startsWith("dyn.")` renders
    - **Then** the node header shows a small grape-colored `<Badge size="xs">DYN</Badge>` pill at the top-right
    - **And** static activity nodes are unchanged

- [ ] **Scenario 2**: "Deleted" badge when the slug is missing from the merged catalog
    - **Given** a workflow's config references `type: "dyn.foo"` but `useActivityCatalog`'s merged response has no matching entry (because the lineage was soft-deleted)
    - **When** the canvas renders the node
    - **Then** instead of the DYN pill the node shows a red `<Badge color="red">Deleted</Badge>` pill
    - **And** the node's body shows the slug + a muted "(deleted dynamic node)" subtitle since no signature is available

- [ ] **Scenario 3**: Right-click "Edit script" entry in NodeContextMenu
    - **Given** `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx`
    - **When** the user right-clicks a `dyn.*` node
    - **Then** the context menu (already extant from Phase 1B Milestone J) grows a new "Edit script" entry
    - **And** clicking it opens a Mantine `<Modal size="80%">` mounting `<DynamicNodeEditor slug={node.type.replace("dyn.", "")} layout="modal" />`
    - **And** for static-activity nodes the menu is unchanged

- [ ] **Scenario 4**: In-situ modal closes + canvas updates after publish
    - **Given** the in-situ modal is open editing a dynamic node
    - **When** the user clicks Publish and the PUT succeeds
    - **Then** the modal closes
    - **And** the canvas's node renderer updates via the standard catalog invalidation (US-175) — if port kinds changed, ports may rewire visually; existing edges that no longer typecheck surface a binding-walk error on the next save

- [ ] **Scenario 5**: "Deleted" badge disables Try
    - **Given** a workflow containing a `dyn.foo` node whose lineage is soft-deleted
    - **When** the user attempts to click Try (Phase 4 top-bar Try button)
    - **Then** Try is disabled with a Tooltip "Workflow contains deleted dynamic nodes — restore or remove them first"
    - **And** the workflow remains saveable + running it via `/runs` would fail loudly with `DynamicNodeDeletedError`

- [ ] **Scenario 6**: Tests cover all three affordances
    - **Given** `WorkflowEditorCanvas.spec.tsx` + `NodeContextMenu.spec.tsx` (extending existing files)
    - **When** the suite runs
    - **Then** tests pass for: DYN pill renders on `dyn.*` nodes only; Deleted badge renders when the catalog has no matching entry; right-click on a `dyn.*` node shows the Edit script entry; clicking it opens the modal with the right slug; Try is disabled when a deleted dynamic node is on the canvas

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — add DYN pill + Deleted badge logic
- `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx` — add Edit script entry
- `apps/frontend/src/features/workflow-builder/canvas/dynamic-node-renderer.tsx` (or extend the existing `ActivityNodeRenderer`) — render the deleted-state body
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.spec.tsx` — extend
- `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.spec.tsx` — extend

## Technical notes

- The "is this entry in the merged catalog?" check happens at the canvas-render boundary — read the merged catalog from `useActivityCatalog`, look up by `type`, and branch on present/absent.
- The Try button's disable state already supports Tooltip-based reasons (Phase 4 introduced this for create mode). Extend the disable predicate with the deleted-dynamic-node check.
- After landing: no Vite restart (frontend-only).
