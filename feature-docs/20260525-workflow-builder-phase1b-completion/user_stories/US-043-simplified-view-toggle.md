# US-043: Top-bar simplified-view switch collapses groups to chips

**As a** workflow author with a large grouped graph,
**I want** a switch that collapses each group into one canvas chip,
**So that** I can read the high-level structure at a glance.

## Acceptance Criteria

- [x] **Scenario 1**: Top-bar toggle present
    - **Given** the V2 editor canvas
    - **When** the editor mounts
    - **Then** a "Simplified view" Mantine `Switch` is visible in the top bar

- [x] **Scenario 2**: Toggling ON collapses groups
    - **Given** a graph with two groups (`g1: [n1,n2]`, `g2: [n3]`) and one ungrouped node `n4`
    - **When** the switch is toggled ON
    - **Then** the canvas renders 3 visual nodes: a chip for `g1`, a chip for `g2`, and `n4` as a normal node
    - **And** edges crossing into a group attach at the group chip's handle instead of the original underlying node

- [x] **Scenario 3**: Toggling OFF restores the original view
    - **Given** simplified view is ON
    - **When** toggled OFF
    - **Then** the canvas renders all original nodes with the group chips removed; node positions are unchanged

- [x] **Scenario 4**: Group chips reuse the read-only renderer's visual style
    - **Given** the existing `GroupNodeRenderer` pattern at `apps/frontend/src/components/workflow/GraphVisualization.tsx` lines 285–356
    - **When** simplified view chips render
    - **Then** they reuse that visual style (label + icon + node-count badge); the layout helper from the existing reader is reused, not re-implemented

- [x] **Scenario 5**: Selecting a chip opens the group settings panel
    - **Given** simplified view is ON and a group chip is on the canvas
    - **When** the user clicks the chip
    - **Then** `GroupNodeSettings` (US-042) opens for that group in the right rail

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — accept a `simplifiedView: boolean` prop; route group projection through the existing reader's chip renderer.
- `apps/frontend/src/features/workflow-builder/canvas/group-projection.ts` — NEW: helpers that fold nodes into group chips + remap edges.
- `apps/frontend/src/features/workflow-builder/canvas/group-projection.test.ts` — NEW.
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
  — top-bar switch + state.
