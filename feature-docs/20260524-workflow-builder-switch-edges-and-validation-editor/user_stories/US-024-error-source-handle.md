# US-024: Error source handle on nodes whose `errorPolicy.onError === "fallback"`

**As a** workflow author building a graph with error-handling branches,
**I want** nodes that opt into fallback routing to expose a dedicated error
output handle on the canvas,
**So that** I can draw the fallback edge visually and have it stamped as a
typed `error` edge.

## Acceptance Criteria

- [x] **Scenario 1**: Activity node without fallback policy renders only the normal source handle
    - **Given** an `ActivityNode` with no `errorPolicy` or with `errorPolicy.onError !== "fallback"`
    - **When** `ActivityNodeRenderer` renders
    - **Then** the only source handle is the existing right-side one (id implicit / `null`)

- [x] **Scenario 2**: Activity node with fallback policy renders both normal + error handles
    - **Given** an `ActivityNode` with `errorPolicy.onError === "fallback"`
    - **When** rendered
    - **Then** two source handles exist: the existing right-side one (kept as `id="out"`) plus a new bottom-side handle with `id="error"` and a red background colour
    - **And** the rectangle layout still fits within the node bounds

- [x] **Scenario 3**: Same rule applies to control-flow rectangle nodes
    - **Given** a `MapNode` / `JoinNode` / `ChildWorkflowNode` / `PollUntilNode` / `HumanGateNode` with `errorPolicy.onError === "fallback"`
    - **When** rendered through `ControlFlowRectangleRenderer`
    - **Then** the same `id="error"` bottom handle is present
    - **And** the existing `id="out"` right handle still renders

- [x] **Scenario 4**: Switch node never gets an error handle
    - **Given** a `SwitchNode` (even with a fallback `errorPolicy`)
    - **When** rendered through `SwitchNodeRenderer`
    - **Then** no error handle is rendered (switch nodes route via cases + defaultEdge, not via error)

- [x] **Scenario 5**: Existing edges still connect to the renamed `out` handle without breaking
    - **Given** a config with existing edges sourced at activity nodes (saved before the rename)
    - **When** the canvas projects those edges into xyflow form
    - **Then** edges with no explicit `sourcePort` continue to render correctly (xyflow defaults to the first available source handle, which is `out`)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Add a `errorPolicy?: ErrorPolicy` field to `ActivityNodeData` and
  `ControlFlowNodeData` so the renderer doesn't have to re-look-up the
  source node by id. Populate from `node.errorPolicy` in
  `projectFlowNodes`.
- The existing source handle is currently rendered without an explicit
  `id`. Switch it to `id="out"` so we can disambiguate from `id="error"`.
  This requires no schema change (edges don't currently store
  `sourcePort` from the canvas — that's still future work tracked
  separately).
- Use `Position.Bottom` for the error handle. Visual: small red circle.
- TDD: extend `WorkflowEditorCanvas.test.tsx` with render-time fixtures
  that include / exclude `errorPolicy.onError === "fallback"`, asserting
  handle DOM via xyflow's testid + `aria-label` or by `data-handleid`.

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — `ActivityNodeData` + `ControlFlowNodeData` gain `errorPolicy`; both
    `ActivityNodeRenderer` and `ControlFlowRectangleRenderer` conditionally
    render the error handle. `SwitchNodeRenderer` is untouched.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`
  — new fixtures + assertions.
