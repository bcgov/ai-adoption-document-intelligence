# US-042: Right-rail group settings body (label / icon / color / exposedParams)

**As a** workflow author working with a group,
**I want** a settings body for the group with label, icon, color and an
exposed-params slot,
**So that** I can name and surface meaningful sub-flow boundaries.

## Acceptance Criteria

- [ ] **Scenario 1**: Selecting a group opens the panel
    - **Given** a group `g1` with `label: "Pay-stub branch"`, `icon: "currency"`, `color: "blue"`
    - **When** the user clicks the group's chip on the canvas (US-043 simplified view) OR clicks the group's row in a group list
    - **Then** the right-rail mounts `GroupNodeSettings` populated with the existing values

- [ ] **Scenario 2**: Editing `label` propagates
    - **Given** a group panel
    - **When** the user types into `label`
    - **Then** `onConfigChange` fires with `config.nodeGroups[g1].label` updated

- [ ] **Scenario 3**: Icon picker shows the icons from `GROUP_ICONS`
    - **Given** the existing icon-picker pattern in `GraphVisualization.tsx`'s `GROUP_ICONS` map (lines 274–283)
    - **When** the panel renders
    - **Then** a Select shows the same set of icon keys with their visual previews

- [ ] **Scenario 4**: Color picker uses the Mantine `ColorPicker` (or a fixed Mantine swatch list)
    - **Given** the panel
    - **When** the user picks a colour
    - **Then** `config.nodeGroups[g1].color` is updated

- [ ] **Scenario 5**: Delete group button removes the entry
    - **Given** a group panel
    - **When** the trash icon is clicked
    - **Then** `config.nodeGroups[g1]` is deleted and the underlying `nodeIds` are returned to "ungrouped" state (no other changes to those nodes)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx`
  — route "group-selected" to `GroupNodeSettings`.
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
  — track "active group id" in addition to "active node id".
