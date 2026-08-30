# US-007: ChildWorkflowNodeSettings form

**As a** workflow author,
**I want to** invoke another workflow as a child (by library id) and map ctx in/out,
**So that** I can compose workflows in the visual editor.

## Acceptance Criteria

- [x] **Scenario 1**: `workflowRef.type` SegmentedControl toggles between `library` and `inline`
    - **Given** a `ChildWorkflowNode` with `workflowRef.type === "library"` is selected
    - **When** the user clicks the `inline` segment
    - **Then** `onConfigChange` fires with `workflowRef.type === "inline"` and the body swaps to the inline view

- [x] **Scenario 2**: Library mode renders a `TextInput` for `workflowId`
    - **Given** `workflowRef.type === "library"`
    - **When** the user types a workflow id and blurs
    - **Then** `onConfigChange` fires with `workflowRef.workflowId` set to the typed value

- [x] **Scenario 3**: Inline mode shows read-only JSON preview + advisory hint
    - **Given** `workflowRef.type === "inline"`
    - **When** the inline view renders
    - **Then** the inline `graph` is shown as read-only JSON and a `Text c="dimmed"` hint explains "Inline graph editing is not yet supported in V2; switch to JSON editor to author."

- [x] **Scenario 4**: `inputMappings` list editor supports add + remove rows
    - **Given** a `ChildWorkflowNode` with two `inputMappings`
    - **When** the user clicks Add Row, then Remove on row 0
    - **Then** `onConfigChange` fires with `inputMappings.length === 3`, then `2`, and each row is `{ port: TextInput, ctxKey: VariablePicker }`

- [x] **Scenario 5**: `outputMappings` list editor supports add + remove rows
    - **Given** a `ChildWorkflowNode` with one `outputMappings`
    - **When** the user clicks Add Row twice, then Remove on row 1
    - **Then** `onConfigChange` fires with `outputMappings.length === 2, then 3, then 2`, and each row is `{ port: TextInput, ctxKey: VariablePicker }`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx`.
- Receives the narrowed `ChildWorkflowNode` type.
- Inline graph editing is explicitly out of scope.
- Accompanied by a smoke test.
