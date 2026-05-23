# US-046: Right-click context menu on canvas nodes

**As a** workflow author,
**I want** right-clicking a canvas node to open a context menu,
**So that** I can run node-specific actions (e.g., change activity type, delete) quickly.

## Acceptance Criteria

- [ ] **Scenario 1**: Right-click on a node opens a Mantine `Menu` anchored to the cursor
    - **Given** an activity node on the canvas
    - **When** the user right-clicks the node
    - **Then** a context menu opens with entries: "Change activity type" (enabled), "Delete node" (enabled), and additional entries reserved for future
    - **And** the canvas's default right-click (xyflow / browser) is suppressed for this case

- [ ] **Scenario 2**: Right-click on a switch / map / etc. shows the menu with "Change activity type" DISABLED
    - **Given** a control-flow node
    - **When** right-clicked
    - **Then** the menu opens but the "Change activity type" entry is disabled with a tooltip ("Control-flow nodes can't be type-swapped")

- [ ] **Scenario 3**: Click-away closes the menu
    - **Given** the menu is open
    - **When** the user clicks anywhere outside
    - **Then** the menu closes; no action is run

- [ ] **Scenario 4**: Delete entry deletes the node + adjacent edges
    - **Given** the menu's "Delete node" is clicked
    - **When** triggered
    - **Then** the existing `handleNodesDelete` path runs (same as keyboard-delete)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — add `onNodeContextMenu` handler + Menu state.
- `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.test.tsx` — NEW.
