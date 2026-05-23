# US-044: `exposedParams[]` list editor inside the group panel

**As a** workflow author publishing a group as a reusable sub-flow,
**I want** to surface a small set of "exposed parameters" that consumers
edit without diving into the underlying nodes,
**So that** a parent workflow can configure the group as a black box.

## Acceptance Criteria

- [ ] **Scenario 1**: List shell with Add / Remove rows
    - **Given** a group panel (US-042)
    - **When** the panel renders
    - **Then** an `exposedParams[]` sub-section is present with an "Add parameter" button
    - **And** each row has: `label` (TextInput), `nodeId` (Select from group's nodeIds), `paramPath` (TextInput or VariablePicker), and `type` (Select: text / number / boolean / enum)

- [ ] **Scenario 2**: Edits propagate to `config.nodeGroups[<id>].exposedParams[i]`
    - **Given** one exposed param row
    - **When** the user edits any of its fields
    - **Then** `onConfigChange` fires with the corresponding param updated

- [ ] **Scenario 3**: `type = "enum"` reveals an `options[]` list editor
    - **Given** a row with `type: "enum"`
    - **When** the row renders
    - **Then** a list editor for `options[]` (strings) is visible; for other types it's hidden

- [ ] **Scenario 4**: `nodeId` Select restricted to group members
    - **Given** a group with `nodeIds: ["n1","n2"]`
    - **When** the `nodeId` Select is opened in a row
    - **Then** only `n1` and `n2` appear as options

- [ ] **Scenario 5**: Removing a node from the group prunes its exposedParams
    - **Given** `nodeIds: ["n1","n2"]`, `exposedParams: [{ nodeId: "n2", ... }]`
    - **When** `n2` is removed from the group (US-041 collision rule or manual edit)
    - **Then** any `exposedParams` entry referencing `n2` is removed; surface as a warning toast

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx`
  — embed `ExposedParamsEditor`.
