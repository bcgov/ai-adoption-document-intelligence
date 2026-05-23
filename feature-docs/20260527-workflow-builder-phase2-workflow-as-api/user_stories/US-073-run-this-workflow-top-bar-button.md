# US-073: "Run this workflow" top-bar button in `WorkflowEditorV2Page` opens the drawer

**As a** workflow author in the V2 editor,
**I want** a top-bar button to open the Run drawer,
**So that** the run-trigger affordance is one click away from the
canvas without needing to leave the editor.

## Acceptance Criteria

- [ ] **Scenario 1**: Button is present and labeled
    - **Given** the `WorkflowEditorV2Page` is rendered for an existing (saved) workflow
    - **When** the top bar is observed
    - **Then** a button labeled "Run this workflow" (or icon + tooltip) is present, placed between "Save" and "Save as library"

- [ ] **Scenario 2**: Click opens `RunWorkflowDrawer`
    - **Given** the page is rendered with a non-null workflow id
    - **When** the user clicks the button
    - **Then** the `RunWorkflowDrawer` mounts with `opened={true}` and the current workflow's id

- [ ] **Scenario 3**: Disabled in create mode
    - **Given** the page is on the `/workflows/create-v2` route (no workflow id yet)
    - **When** the top bar renders
    - **Then** the button is disabled
    - **And** a tooltip explains "Save the workflow first to enable Run."

- [ ] **Scenario 4**: Drawer closes on close icon / backdrop
    - **Given** the drawer is open
    - **When** the user closes it
    - **Then** the button's state resets and the drawer unmounts

- [ ] **Scenario 5**: Vitest coverage
    - **Given** the page's existing component test
    - **When** `npm test` runs
    - **Then** Scenarios 1, 2, and 3 are covered

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — add the top-bar button + state for opening the drawer
- The page's component test — add the new test cases
