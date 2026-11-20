# US-022: `EdgePicker` accepts an optional `edgeTypes` filter

**As a** workflow author binding a switch case to an outgoing edge,
**I want** the picker to list only the edges that are valid candidates for
that role (i.e. typed `conditional`),
**So that** I don't accidentally bind a `normal` edge to a case slot.

## Acceptance Criteria

- [x] **Scenario 1**: Without `edgeTypes` prop, behavior is unchanged
    - **Given** an `EdgePicker` with `fromNodeId="n1"` and no `edgeTypes` prop
    - **When** `config.edges` contains a mix of `normal`, `conditional`, and `error` edges all sourced from `n1`
    - **Then** all of those edges appear as options

- [x] **Scenario 2**: With `edgeTypes={["conditional"]}`, only conditional edges appear
    - **Given** an `EdgePicker` with `edgeTypes={["conditional"]}`
    - **And** `config.edges` has three edges from `n1`: one each of `normal` / `conditional` / `error`
    - **When** the picker is opened
    - **Then** only the `conditional` edge is offered as a candidate

- [x] **Scenario 3**: Selected value pointing to a non-matching type still surfaces (with stale warning)
    - **Given** an `EdgePicker` with `edgeTypes={["conditional"]}` and `value="edge-x"`
    - **And** `edge-x` exists in `config.edges` with `type: "normal"` (the type was changed after binding)
    - **When** the component renders
    - **Then** the existing stale-reference warning fires for `edge-x`
    - **And** clearing the selection works as before

- [x] **Scenario 4**: Empty filter list shows no candidates (and no crash)
    - **Given** an `EdgePicker` with `edgeTypes={[]}` (intentional empty filter)
    - **When** rendered
    - **Then** the dropdown is empty (no options) and no error is thrown

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Add a new optional prop `edgeTypes?: GraphEdge["type"][]` to
  `EdgePickerProps`. When provided, restrict `options` to edges whose `type`
  is included.
- Stale-warning logic should remain orthogonal — if the bound `value` no
  longer matches the type filter, the existing "edge changed source / no
  longer exists" warning still applies semantically; no new branch needed
  beyond what's there.
- TDD: add scenarios to `EdgePicker.test.tsx`, then implement.

## Files modified

- `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx`
- `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.test.tsx`
