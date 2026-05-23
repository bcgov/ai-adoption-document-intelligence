# US-004: SwitchNodeSettings form

**As a** workflow author,
**I want to** define switch cases (condition → outgoing edge) and an optional default edge in the settings panel,
**So that** I can author switch nodes in the visual editor without dropping to JSON.

## Acceptance Criteria

- [ ] **Scenario 1**: Renders existing cases as a list of editable rows
    - **Given** a `SwitchNode` with two `cases` entries is selected
    - **When** `SwitchNodeSettings` renders
    - **Then** two rows appear, each containing a `ConditionExpressionEditor` bound to the case's `condition` and an `EdgePicker` bound to the case's `edgeId`

- [ ] **Scenario 2**: Add Case appends an empty case
    - **Given** a switch node with one case
    - **When** the user clicks Add Case
    - **Then** `onConfigChange` fires with a node whose `cases.length === 2` and the new case has an empty condition + empty `edgeId`

- [ ] **Scenario 3**: Remove Case removes the targeted case
    - **Given** a switch node with three cases
    - **When** the user clicks Remove on row index 1
    - **Then** `onConfigChange` fires with `cases.length === 2` and the original index-0 and index-2 cases remain in order

- [ ] **Scenario 4**: Editing a row's condition or edgeId propagates to `onConfigChange`
    - **Given** the user edits any field inside one of the case rows
    - **When** the change fires
    - **Then** `onConfigChange` is called with the updated `SwitchNode` carrying the new value

- [ ] **Scenario 5**: `defaultEdge` is editable via an EdgePicker scoped to outgoing edges from this node
    - **Given** the canvas has multiple edges, only some of which originate from the selected switch node
    - **When** the user opens the `defaultEdge` picker
    - **Then** only edges with `source === switchNode.id` appear, and selecting one updates `defaultEdge` via `onConfigChange`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`.
- Consumes US-002 (EdgePicker) and US-003 (ConditionExpressionEditor) primitives.
- Receives the narrowed `SwitchNode` type, not `GraphNode`.
- Accompanied by a smoke test that seeds a switch node, performs an edit, and verifies the `onConfigChange` payload.
