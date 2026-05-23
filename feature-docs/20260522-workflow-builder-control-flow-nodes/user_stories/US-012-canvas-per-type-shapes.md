# US-012: Canvas renders distinct shapes for control-flow nodes

**As a** workflow author,
**I want to** see each control-flow node type on the canvas in a visually distinct shape,
**So that** I can scan the workflow and immediately recognize flow-control behaviour vs activities.

## Acceptance Criteria

- [x] **Scenario 1**: Switch renders as a diamond
    - **Given** a `switch` node is on the canvas
    - **When** `WorkflowEditorCanvas` renders
    - **Then** the node's shape is a diamond, visually matching the existing `GraphVisualization.tsx` switch shape

- [x] **Scenario 2**: Map and Join render with fan-out / fan-in icon overlays
    - **Given** a `map` node and a `join` node are on the canvas
    - **When** the canvas renders
    - **Then** each is a rectangle, with the map node showing a fan-out icon overlay and the join node showing a fan-in icon overlay

- [x] **Scenario 3**: PollUntil, HumanGate, ChildWorkflow render as rectangles with the type's icon
    - **Given** one of each is on the canvas
    - **When** the canvas renders
    - **Then** each appears as a rectangle with the type-appropriate Tabler icon in the node header

- [x] **Scenario 4**: All control-flow nodes are selectable / draggable / connectable like activities
    - **Given** any control-flow node is on the canvas
    - **When** the user clicks it, drags it, or pulls a connection out of it
    - **Then** the behaviour matches an activity node — selection toggles, position updates persist into `metadata.position`, `onConnect` fires

- [x] **Scenario 5**: Validation badges surface on control-flow nodes
    - **Given** a control-flow node has validation errors per `validateGraphConfig`
    - **When** the canvas renders
    - **Then** the same red badge that appears on invalid activity nodes (commit `c8dc5cc7`) also appears on the control-flow node, and clicking it opens the validation drawer scrolled to the relevant entry

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Modifies `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`.
- Port the diamond shape from `apps/frontend/src/components/workflow/GraphVisualization.tsx` (the existing read-only renderer); do not re-invent.
- Use the iconHint→Tabler mapping that's already established for activities; extend the mapping table to cover the control-flow icons.
- A canvas-render test mounts a config with one node of each type and snapshots the resulting node visuals (or asserts the right xyflow `data.shape` and icon are present).
