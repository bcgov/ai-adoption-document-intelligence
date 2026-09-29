# US-006: JoinNodeSettings form

**As a** workflow author,
**I want to** point a Join node at its source Map node and choose the fan-in strategy + results ctx key,
**So that** I can author join nodes in the visual editor without dropping to JSON.

## Acceptance Criteria

- [x] **Scenario 1**: `sourceMapNodeId` uses `NodePicker` filtered to map nodes
    - **Given** the graph contains activity, switch, and map nodes
    - **When** the user opens the `sourceMapNodeId` picker
    - **Then** only nodes whose `type === "map"` are listed

- [x] **Scenario 2**: `strategy` renders as a SegmentedControl with `all` / `any`
    - **Given** a `JoinNode` with `strategy: "all"` is selected
    - **When** the user clicks the `any` segment
    - **Then** `onConfigChange` fires with `strategy: "any"`

- [x] **Scenario 3**: `resultsCtxKey` uses `VariablePicker`
    - **Given** the graph declares `ctx.results`
    - **When** `JoinNodeSettings` renders
    - **Then** the `resultsCtxKey` field is a `VariablePicker` with the declared ctx keys available

- [x] **Scenario 4**: Editing any field propagates a typed update to `onConfigChange`
    - **Given** the user edits any of the three fields
    - **When** the change fires
    - **Then** `onConfigChange` is called with the full `JoinNode` carrying the new value

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/JoinNodeSettings.tsx`.
- Consumes US-001 (NodePicker with `filterType="map"`) and the existing `VariablePicker`.
- Receives the narrowed `JoinNode` type.
- Accompanied by a smoke test.
