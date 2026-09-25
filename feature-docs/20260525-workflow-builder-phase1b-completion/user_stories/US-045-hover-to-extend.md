# US-045: Hovering an outgoing handle pops a node picker; click adds + connects

**As a** workflow author building chains incrementally,
**I want** to hover a node's outgoing handle and pick the next node from
a small palette,
**So that** I can extend a chain in one click without dragging.

## Acceptance Criteria

- [x] **Scenario 1**: Hover-trigger surface on outgoing source handle
    - **Given** an activity node with the normal source handle (`id="out"`)
    - **When** the cursor hovers the handle for ≥ 200ms
    - **Then** a small Mantine `Popover` opens anchored to the handle, showing a categorised list (activity types grouped by category) + control-flow shortcuts

- [x] **Scenario 2**: Picker dismisses on click-away
    - **Given** the popover is open
    - **When** the user clicks anywhere off the popover or the handle loses hover (with a 200ms grace)
    - **Then** the popover closes without adding any node

- [x] **Scenario 3**: Picking an entry adds + connects in one action
    - **Given** the popover is open and the user clicks "Run activity → data.transform"
    - **When** the click fires
    - **Then** a new `ActivityNode` is added with `activityType: "data.transform"`, default position to the right of the source
    - **And** a new edge connects the source's `out` handle to the new node's target handle
    - **And** the edge type is inferred per `handleConnect` (normal for activity sources; conditional for switch sources)

- [x] **Scenario 4**: New node is auto-selected and fit into view
    - **Given** the picker just added a node
    - **When** the action completes
    - **Then** the new node becomes the selected node (right-rail switches to it) and `fitView` animates to bring it into view (matches US-014's auto-fit pattern)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — wire hover state on source handle; mount the popover.
