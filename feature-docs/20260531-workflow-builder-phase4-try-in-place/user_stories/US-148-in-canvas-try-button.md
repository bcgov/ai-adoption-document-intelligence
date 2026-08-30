# US-148: New "Try" top-bar button for source.api / legacy isInput workflows

**As a** user iterating on a workflow without a `source.upload` node (source.api OR legacy isInput),
**I want** a "Try" top-bar button next to the existing "Run this workflow" button that opens the Run drawer pre-selected on a new "Try" tab,
**So that** I have a canvas-iteration trigger that's distinct from the API-validation Run flow.

## Acceptance Criteria

- [x] **Scenario 1**: Button placement + icon
    - **Given** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
    - **When** read after the change
    - **Then** a new top-bar button labelled "Try" with `IconBolt` (Tabler) renders between "Save as library" and "Run this workflow"
    - **And** the button uses Mantine variant `"filled"` with `color="blue"` (visually distinct from the existing Run button's outline variant)

- [x] **Scenario 2**: Disabled state in create mode
    - **Given** the editor is in create mode (no `lineageId` yet)
    - **When** the button renders
    - **Then** it's disabled with a Mantine `<Tooltip>` "Save the workflow first" (same pattern as the existing "Run this workflow" button)
    - **And** the disabled visual matches the existing pattern

- [x] **Scenario 3**: Click opens RunWorkflowDrawer pre-selected on Try tab
    - **Given** a saved workflow without a `source.upload` node
    - **When** the Try button is clicked
    - **Then** the `RunWorkflowDrawer` opens
    - **And** the active tab is "Try" (US-149 implements the tab)
    - **And** the existing JsonInput body is prefilled per `useWorkflowRunSpec` (Phase 2 Track 2 behaviour)

- [x] **Scenario 4**: Hidden for source.upload-only workflows
    - **Given** a workflow with a `source.upload` node and NO `source.api` (so Upload & Try is the trigger)
    - **When** the editor renders
    - **Then** the new "Try" top-bar button is HIDDEN (not just disabled — the source.upload settings panel's "Upload & Try" button is the canonical trigger)
    - **And** the existing "Run this workflow" button remains visible

- [x] **Scenario 5**: Visible for mixed workflows (source.api + source.upload)
    - **Given** a workflow with BOTH `source.api` AND `source.upload`
    - **When** the editor renders
    - **Then** the Try button is VISIBLE (the user can trigger via either path; Try is the source.api path)
    - **And** the Upload & Try button on the source.upload settings panel is also available

- [x] **Scenario 6**: Component test
    - **Given** the page test
    - **When** tests run
    - **Then** at least 4 cases pass: Try button visible on source.api workflow, hidden on source.upload-only, visible on mixed, disabled in create mode

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — add the Try top-bar button
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx` (or page-level integration test) — new tests

## Technical notes

- The button's "should it be visible?" predicate: `hasSourceApi || hasIsInputCtx || (!hasSourceApi && !hasIsInputCtx && !hasSourceUpload)`. Simplifies to: visible when there's any non-upload-driven input path. Hidden only when source.upload is the ONLY input.
- The presence of `source.api` is detected by walking `config.nodes` for `node.type === "source" && node.sourceType === "source.api"`. Same pattern as `RunWorkflowDrawer`'s existing detection (US-123).
- The "Try" tab itself is US-149; this story only adds the button + drawer-open trigger.
- After landing: no Vite restart (frontend-only).
