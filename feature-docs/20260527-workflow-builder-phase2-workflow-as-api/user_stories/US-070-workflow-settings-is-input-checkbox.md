# US-070: `WorkflowSettingsDrawer` adds an `isInput` checkbox per ctx row

**As a** workflow author preparing my workflow to be triggered as an API,
**I want** a checkbox in the workflow settings drawer that marks a ctx
declaration as a caller-supplied input,
**So that** the Run drawer can derive a precise input schema without me
needing to author it separately.

## Acceptance Criteria

- [ ] **Scenario 1**: Each ctx row has an "Input" checkbox
    - **Given** the workflow settings drawer with the ctx declarations list
    - **When** the drawer is opened
    - **Then** every ctx row displays an "Input" checkbox alongside the existing name / type / description fields
    - **And** the checkbox label is short ("Input" or similar) and has a tooltip ("Mark this ctx entry as a caller-supplied input. Surfaced in the workflow's Run panel and the run-spec endpoint.")

- [ ] **Scenario 2**: Checking the box updates the in-flight config
    - **Given** an unchecked checkbox for ctx entry `foo`
    - **When** the user clicks the checkbox
    - **Then** `ctx.foo.isInput` becomes `true` in the editor's working config
    - **And** the change is included in the next Save

- [ ] **Scenario 3**: Unchecking removes / sets-false the flag
    - **Given** a checked checkbox for ctx entry `foo` (with `isInput: true` in the loaded config)
    - **When** the user unchecks it
    - **Then** `ctx.foo.isInput` becomes `false` (or is omitted entirely — pick one and be consistent)
    - **And** the change is included in the next Save

- [ ] **Scenario 4**: Loaded workflows reflect persisted flag values
    - **Given** a saved workflow with `ctx.customerId.isInput === true`
    - **When** the editor loads it
    - **Then** the corresponding row's checkbox is checked

- [ ] **Scenario 5**: Vitest coverage
    - **Given** the component test file (`WorkflowSettingsDrawer.test.tsx` or equivalent)
    - **When** `npm test` runs in `apps/frontend`
    - **Then** Scenarios 2 + 3 + 4 are covered by tests using `@testing-library/react`

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/WorkflowSettingsDrawer.tsx` (or the existing equivalent that renders the ctx declarations list) — add the checkbox column + change handler
- The component's test file — add the three test cases above
