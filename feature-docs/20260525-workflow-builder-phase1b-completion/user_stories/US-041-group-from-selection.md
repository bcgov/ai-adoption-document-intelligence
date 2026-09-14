# US-041: "Group selected" top-bar action creates a `nodeGroups[<id>]` entry

**As a** workflow author building a complex graph,
**I want** to lasso-select N nodes and group them into a named cluster,
**So that** I can label / collapse / share sub-flows.

## Acceptance Criteria

- [x] **Scenario 1**: Top-bar button reveals when ≥ 2 nodes selected
    - **Given** the V2 editor canvas with two activity nodes selected (xyflow's marquee or shift-click)
    - **When** the editor's top bar renders
    - **Then** a "Group selected" button is visible and enabled

- [x] **Scenario 2**: Button disabled with < 2 selected
    - **Given** no nodes, or exactly one node, selected
    - **When** the top bar renders
    - **Then** the button is either hidden or disabled with a tooltip

- [x] **Scenario 3**: Click creates a `nodeGroups[<id>]` entry
    - **Given** two activity nodes `n1`, `n2` selected
    - **When** "Group selected" is clicked
    - **Then** `config.nodeGroups[<newId>]` is added with `{ label: "Group 1" (auto-numbered), nodeIds: ["n1","n2"], exposedParams: [] }`
    - **And** the right-rail switches to the group settings panel (US-042) for the new group

- [x] **Scenario 4**: A node can only belong to one group at a time
    - **Given** `n1` already belongs to group `g1`, and `n1` + `n2` are selected
    - **When** "Group selected" is clicked
    - **Then** `n1` is removed from `g1.nodeIds` and added to the new group; if `g1.nodeIds` becomes empty, `g1` is dropped from `config.nodeGroups`

- [x] **Scenario 5**: Auto-numbering avoids collisions
    - **Given** existing groups `Group 1`, `Group 3`
    - **When** a new group is created
    - **Then** the new label is `Group 2` (fill the gap) or `Group 4` (next-up — pick deterministically and document)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — track multi-selection (xyflow's `selectionMode`).
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
  — top-bar "Group selected" button + handler.
- `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx` — NEW shell (US-042).
- Tests for canvas + top bar.
