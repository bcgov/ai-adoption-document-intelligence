# US-010: Wire per-type forms into NodeSettingsPanel

**As a** workflow author,
**I want to** see the right settings form mount automatically when I click on any node,
**So that** I never see the legacy "Settings for {type} nodes are not yet supported in V2" stub for control-flow nodes.

## Acceptance Criteria

- [x] **Scenario 1**: Non-activity node selection mounts the matching per-type form
    - **Given** a graph with one node of each control-flow type
    - **When** the user clicks each one in turn
    - **Then** the right rail mounts `SwitchNodeSettings`, `MapNodeSettings`, `JoinNodeSettings`, `ChildWorkflowNodeSettings`, `PollUntilNodeSettings`, or `HumanGateNodeSettings` respectively — and the legacy stub is gone

- [x] **Scenario 2**: Common header is preserved across all node types
    - **Given** a non-activity node is selected
    - **When** the settings panel renders
    - **Then** the label input, type badge, and delete button still appear above the per-type body, identical to the activity-node panel

- [x] **Scenario 3**: Common footer (input/output port bindings) is preserved
    - **Given** a non-activity node with `inputs` and `outputs` is selected
    - **When** the settings panel renders
    - **Then** the input-port and output-port binding sections appear below the per-type body, identical to the activity-node panel

- [x] **Scenario 4**: Saving / dirty-state matches the activity-node experience
    - **Given** the user makes edits in a per-type form
    - **When** the change fires
    - **Then** the surrounding editor's dirty-state and save flow behave exactly as they do for activity-node edits (`onConfigChange` bubbles up and the Save button reflects pending changes)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Modifies `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` — replace the `node.type !== "activity"` stub at the existing `lines 68-80` range with a switch on `node.type` that delegates to the per-type form.
- Imports per-type forms from `settings/control-flow/index.ts`.
- Accompanied by an integration test that mounts the panel against a config containing one node of each type and asserts the right component mounts each time.
