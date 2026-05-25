# US-182: Activity palette "Custom" section + "+ New custom node" button

**As a** workflow author building on the canvas,
**I want** the activity palette to surface my group's dynamic nodes in a "Custom" section with a "+ New custom node" button,
**So that** I drop a custom node onto the canvas the same way I drop static activities, and I can author one without leaving the workflow editor.

## Acceptance Criteria

- [ ] **Scenario 1**: New "Custom" section appears in the palette
    - **Given** `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`
    - **When** the calling group has at least one non-deleted dynamic-node lineage
    - **Then** the palette renders a "Custom" section AFTER the existing "Flow Control" section (matches the Phase 8 Sources placement)
    - **And** the section shows one row per dynamic node in the merged catalog (entries where `dynamicNodeSlug` is set)

- [ ] **Scenario 2**: Each dynamic-node entry renders with a "DYN" pill
    - **Given** a dynamic-node entry in the palette
    - **When** rendered
    - **Then** the row shows: the catalog entry's name (`signature.name`), the description as a hover tooltip, AND a small grape-colored "DYN" pill on the right
    - **And** the row's port-color hints come from the entry's declared kinds (same Phase 3 palette as static rows)

- [ ] **Scenario 3**: "+ New custom node" button at the top of the section
    - **Given** the "Custom" section
    - **When** rendered
    - **Then** a "+ New custom node" button anchors the top of the section
    - **And** clicking the button opens a Mantine `<Modal size="80%">` mounting `<DynamicNodeEditor layout="modal" onAfterPublish={...} onClose={...} />` in create mode
    - **And** the button is present even when the group has zero dynamic nodes (so the section always renders with at least the button — drives the first-create flow)

- [ ] **Scenario 4**: Successful publish drops the new node on the canvas
    - **Given** the modal is open in create mode and a successful publish lands
    - **When** the `onAfterPublish(slug)` callback fires
    - **Then** the modal closes
    - **And** a new node `{ id: <generated>, type: "dyn.<slug>", parameters: <defaults from paramsSchema>, position: <next free position on the canvas> }` is added to the workflow's config
    - **And** the canvas re-renders with the new node selected

- [ ] **Scenario 5**: Drag-and-drop existing dynamic-node entries works
    - **Given** an existing dynamic-node entry in the palette
    - **When** the user drags it onto the canvas
    - **Then** a new node with `type: "dyn.<slug>"` is added at the drop position
    - **And** the node renders via the standard `ActivityNodeRenderer` with the DYN pill from US-183 (this story sets up the source; US-183 renders the pill on the canvas)

- [ ] **Scenario 6**: Tests cover the section + button + drop
    - **Given** `ActivityPalette.spec.tsx` (extending the existing test file)
    - **When** the suite runs
    - **Then** tests pass for: Custom section renders when the catalog has dynamic entries; "+ New custom node" button opens the modal; successful publish closes the modal + drops the node; drag-and-drop of an existing entry adds a node with the correct type

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx` — extend with the Custom section + button
- `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.spec.tsx` — extend
- `apps/frontend/src/features/workflow-builder/palette/usePaletteSections.ts` (or wherever the section partition logic lives) — split the merged catalog into static-by-category + dynamic-as-custom

## Technical notes

- Use the existing palette section conventions — color, spacing, icon — and just add the new "Custom" category. Don't introduce new visual chrome.
- The next-free-position logic for auto-drop matches the existing palette's behavior (e.g. last-clicked-node + offset).
- After landing: no Vite restart (frontend-only).
