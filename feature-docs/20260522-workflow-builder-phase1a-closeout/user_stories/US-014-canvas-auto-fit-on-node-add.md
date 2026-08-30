# US-014: Auto-fit canvas viewport when a node is added

**As a** workflow author,
**I want to** have the canvas auto-fit so the newly added node is in view after I click a palette entry,
**So that** I don't have to manually scroll or use the Controls fit button to find a node that landed at the staggered offscreen position.

## Acceptance Criteria

- [x] **Scenario 1**: Adding a node from the palette fits the new node into view
    - **Given** the visual editor is open with N nodes on the canvas
    - **When** the user clicks an activity (or control-flow) palette entry, increasing the node count to N+1
    - **Then** the canvas viewport animates so the new node is visible (xyflow `fitView` is called)

- [x] **Scenario 2**: Dragging an existing node does not trigger a re-fit
    - **Given** the canvas has at least one node positioned anywhere on the plane
    - **When** the user drags that node to a new position (drag start → drag stop)
    - **Then** the viewport stays where it was; `fitView` is NOT called

- [x] **Scenario 3**: Loading the editor on an existing workflow still does the initial fit
    - **Given** the user navigates to `/workflows/:workflowId/edit-v2` on a workflow with multiple nodes
    - **When** the canvas mounts
    - **Then** xyflow's existing `fitView` prop fires once on mount (unchanged behaviour)

- [x] **Scenario 4**: Selection / edge connect / edge delete do NOT trigger a re-fit
    - **Given** the canvas has multiple nodes and edges
    - **When** the user clicks a node to select it, draws a new edge between two nodes, or deletes an edge
    - **Then** the viewport stays where it was; `fitView` is NOT called

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- `useReactFlow` is only available to components mounted inside a `ReactFlowProvider`. The current canvas calls `<ReactFlow>` directly at its top level — to use `useReactFlow().fitView()` from the same component, the canvas must wrap its inner JSX in `<ReactFlowProvider>`.
- The clean refactor: rename the current `WorkflowEditorCanvas` body to `WorkflowEditorCanvasInner`, then export a new `WorkflowEditorCanvas` that returns `<ReactFlowProvider><WorkflowEditorCanvasInner {...props} /></ReactFlowProvider>`. The page-level prop interface of `WorkflowEditorCanvas` stays unchanged.
- Detection of "a node was added" uses a `useRef<number>` of the previous `internalNodes.length`. When the new length is greater than the previous (and we're not on the very first render where the ref starts at 0), call `fitView({ padding: 0.25, duration: 300, nodes: [{ id: newestNodeId }] })`. Limiting `nodes:` to just the newest node biases the fit toward the addition instead of zooming out to encompass the whole graph each time.
- Identifying the "newest node": diff the previous node-id set against the current set; the single id in the new set that wasn't in the previous set is the addition. If multiple nodes appeared at once (e.g. a load), fall back to fitting the whole graph (no `nodes:` filter).
- Use `requestAnimationFrame` (or a microtask via `setTimeout(0)`) to defer the `fitView` call to after xyflow has re-projected the new node, otherwise the bounding box won't include it.
- Tests: mount `WorkflowEditorCanvas` via React Testing Library against a mocked `@xyflow/react` so `fitView` is observable. Mantine + ReactFlow already have spec patterns in the prior US-012 / US-013 tests; reuse them.

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — refactor + add fitView trigger.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx` — new test file (or add cases to the existing one if it exists).
