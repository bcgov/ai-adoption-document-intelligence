# US-049: `layoutGraph` helper + top-bar "Auto-arrange" button

**As a** workflow author with a freshly-loaded template or a messy
graph,
**I want** a one-click auto-arrange that lays out nodes top-to-bottom
or left-to-right,
**So that** I don't have to hand-place 17 nodes.

## Acceptance Criteria

- [ ] **Scenario 1**: Helper at `canvas/auto-layout.ts`
    - **Given** a `GraphWorkflowConfig`
    - **When** `layoutGraph(config, { rankdir: "LR", nodesep: 60, ranksep: 80 })` is called
    - **Then** it returns a new `GraphWorkflowConfig` with every node's `metadata.position` set to dagre's layout output
    - **And** edges' source/target references are honoured by the layout
    - **And** the function is pure (input unchanged)

- [ ] **Scenario 2**: Re-use the existing dagre import from the read-only renderer
    - **Given** `dagre-esm` already a dep used by `GraphVisualization.tsx`
    - **When** the helper is implemented
    - **Then** it lifts the dagre call out of the read-only renderer into the shared helper; the read-only renderer is refactored to use the new helper (no behaviour change)

- [ ] **Scenario 3**: Top-bar "Auto-arrange" button
    - **Given** the V2 editor canvas with a loaded graph
    - **When** the user clicks "Auto-arrange"
    - **Then** the helper runs, the config updates via `onConfigChange`, and the viewport re-fits to the new layout

- [ ] **Scenario 4**: Auto-arrange treats group sub-graphs as compound nodes (if simplified view is OFF)
    - **Given** a graph with one group `g1: [n1,n2,n3]`
    - **When** auto-arrange runs in non-simplified view
    - **Then** the group's members are laid out as a cluster (dagre's compound graph support) so the group's nodes stay near each other

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/auto-layout.test.ts` — NEW.
- `apps/frontend/src/components/workflow/GraphVisualization.tsx` — refactor to use the new helper.
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
  — add top-bar button.
