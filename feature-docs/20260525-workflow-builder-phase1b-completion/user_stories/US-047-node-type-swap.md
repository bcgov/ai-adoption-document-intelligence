# US-047: "Change activity type" action preserves overlapping config

**As a** workflow author,
**I want** to change a node's activity type in place without losing
overlapping parameter keys,
**So that** I can iterate on workflow shape without re-typing labels and
configs.

## Acceptance Criteria

- [ ] **Scenario 1**: "Change activity type" opens an activity picker
    - **Given** the context menu (US-046) on an activity node is open
    - **When** the user clicks "Change activity type"
    - **Then** an activity-picker modal opens (Search + categorised list — reuse `ActivityPalette` patterns)

- [ ] **Scenario 2**: Picking a new type preserves intersecting parameters
    - **Given** a node `n1` of type `A` with `parameters: { x: 1, y: "foo" }`, and a target type `B` whose catalog Zod schema declares fields `x` and `z`
    - **When** the user picks type `B`
    - **Then** `config.nodes[n1]` becomes `{ ...same id/label/inputs/outputs/errorPolicy/retry/timeout/metadata.position, activityType: "B", parameters: { x: 1, z: <default> } }`
    - **And** `y` is dropped (not in the new schema)

- [ ] **Scenario 3**: Existing edges remain
    - **Given** edges in/out of `n1` exist
    - **When** the swap completes
    - **Then** no edges are removed or re-typed (edges reference the node by id)

- [ ] **Scenario 4**: A swap that violates Zod (e.g., required new field) shows a save-time error via the existing validation drawer
    - **Given** target type `B` requires a new field `z` (not in `A`)
    - **When** the swap completes with `z` defaulted to `""`
    - **Then** the catalog Zod validation fires immediately via the existing debounced validator, surfacing the missing-required error as expected

- [ ] **Scenario 5**: Control-flow nodes can't be swapped
    - **Given** a switch / map / join / etc. node
    - **When** the menu's "Change activity type" entry is clicked
    - **Then** nothing happens (the entry is disabled per US-046 Scenario 2)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx`
  — wire "Change activity type" to open the picker.
- `apps/frontend/src/features/workflow-builder/canvas/NodeTypeSwapModal.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/NodeTypeSwapModal.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/swap-node-type.ts` — NEW: pure helper that takes old node + new type + new catalog and computes the swapped node.
- `swap-node-type.test.ts` — NEW.
