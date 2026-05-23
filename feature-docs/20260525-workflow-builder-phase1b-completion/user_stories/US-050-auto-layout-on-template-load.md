# US-050: Apply auto-layout on template-load when positions are missing

**As a** workflow author starting from a template,
**I want** the template to load with a reasonable initial layout,
**So that** I don't see 17 nodes stacked at `x = 80 + i*220`.

## Acceptance Criteria

- [x] **Scenario 1**: Detect "no positions" on initial load
    - **Given** a template payload arriving in `WorkflowEditorV2Page` via React Router state
    - **When** the initial config is hydrated
    - **Then** if none of the nodes have `metadata.position`, `layoutGraph` (US-049) is run once and the result becomes the editor's initial config

- [x] **Scenario 2**: Templates with positions are NOT re-laid-out
    - **Given** a template whose nodes already carry `metadata.position`
    - **When** loaded
    - **Then** the editor uses the existing positions; no auto-layout runs

- [x] **Scenario 3**: Partial positions: mixed-state templates
    - **Given** a template where some nodes have positions and others don't
    - **When** loaded
    - **Then** policy: only auto-layout if NO nodes have positions (mixed-state preserves the partial positions; user can hit "Auto-arrange" manually to fix). Document this in the story; alternative auto-only-the-missing requires layout-with-fixed-points which is out of scope.

- [x] **Scenario 4**: Save preserves auto-laid-out positions
    - **Given** an auto-laid-out template
    - **When** the user saves without dragging anything
    - **Then** the save payload includes the computed positions

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
  — detect missing-positions case on initial mount, call `layoutGraph`.
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx` — assertion.
