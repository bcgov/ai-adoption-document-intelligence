# US-005: MapNodeSettings form

**As a** workflow author,
**I want to** configure a Map (fan-out) node's collection / item / index ctx bindings and the body entry/exit nodes,
**So that** I can author map nodes in the visual editor without dropping to JSON.

## Acceptance Criteria

- [x] **Scenario 1**: `collectionCtxKey`, `itemCtxKey`, and optional `indexCtxKey` use `VariablePicker`
    - **Given** the graph declares `ctx.documents` and `ctx.items`
    - **When** `MapNodeSettings` renders for a `MapNode`
    - **Then** all three ctx-key fields are `VariablePicker` instances and their options include the declared ctx keys

- [x] **Scenario 2**: `maxConcurrency` is an optional integer NumberInput
    - **Given** a `MapNode` is selected
    - **When** the user enters `4` in the `maxConcurrency` field, then clears it
    - **Then** `onConfigChange` fires first with `maxConcurrency: 4`, then with `maxConcurrency: undefined`, and entering a value < 1 or non-integer is rejected by the input

- [x] **Scenario 3**: `bodyEntryNodeId` and `bodyExitNodeId` use `NodePicker`
    - **Given** the graph contains multiple nodes
    - **When** the user opens either body picker
    - **Then** all nodes appear (no `filterType` applied) and selection updates the right field via `onConfigChange`

- [x] **Scenario 4**: Editing any field propagates a typed update to `onConfigChange`
    - **Given** the user edits `itemCtxKey`
    - **When** the change fires
    - **Then** `onConfigChange` is called with the full `MapNode` carrying the new value (no other fields mutated)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/MapNodeSettings.tsx`.
- Consumes US-001 (NodePicker) and the existing `VariablePicker`.
- Receives the narrowed `MapNode` type.
- Accompanied by a smoke test.
