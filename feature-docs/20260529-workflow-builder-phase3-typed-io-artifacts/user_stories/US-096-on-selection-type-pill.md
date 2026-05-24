# US-096: On-selection type pill next to node handles

**As a** workflow author selecting a node,
**I want** a small badge listing the typed signature of the node's ports,
**So that** colourblind users get text not just colour, and multi-port nodes have a canonical display surface for their full signature.

## Acceptance Criteria

- [ ] **Scenario 1**: Single-port node selected → one-line badge near each handle
    - **Given** a selected `document.split` node (single typed output `segments: Segment[]`)
    - **When** the canvas renders the selection
    - **Then** a Mantine `<Badge>` renders adjacent to the output handle showing the kind literal `"SEGMENT[]"` (uppercase, single-line)
    - **And** if the same node had a single typed input, an analogous badge renders adjacent to the input handle
    - **And** the badge colour matches the handle's kind palette colour (green for Segment, blue for Document, etc.) — colour redundancy is intentional for accessibility

- [ ] **Scenario 2**: Multi-port node selected → expanded list pill
    - **Given** a selected `document.classify` node (inputs `ocrResult: OcrResult`, `segment: Segment`; outputs `segmentType: Classification`, `confidence: Artifact`, `matchedRule: Artifact`)
    - **When** the canvas renders the selection
    - **Then** the input-side pill expands to a stacked list: `"ocrResult: OcrResult"`, `"segment: Segment"`
    - **And** the output-side pill expands to: `"segmentType: Classification"`, `"confidence: Artifact"`, `"matchedRule: Artifact"`
    - **And** each row in the expanded pill is colour-coded by that port's kind (Artifact wildcards render gray)
    - **And** the pill is positioned next to the (gray) handle, not overlapping the node body

- [ ] **Scenario 3**: Pill hides when the node is deselected
    - **Given** a selected node with its pill visible
    - **When** the user clicks empty canvas (deselecting) or selects another node
    - **Then** the pill disappears from the originally-selected node
    - **And** the new selection's pill (if any) renders correctly

- [ ] **Scenario 4**: Pill renders nothing when no ports declare a kind
    - **Given** a selected legacy node (no `kind` annotations anywhere — pre-Phase-3 unfanned entries)
    - **When** the canvas renders the selection
    - **Then** no pill renders on either side
    - **And** the gray handle + its "Multiple outputs..." tooltip from US-095 remain the only kind signal
    - **And** no jsdom errors about missing children / undefined kinds surface in the unit test

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.tsx` — new component
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — render `<NodeTypePill>` next to handles when the node is `selected`
- `apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.test.tsx` — covers scenarios 1-4 (vitest + jsdom)

## Technical notes

- Use Mantine `<Badge>` for the single-port case; Mantine `<Stack gap="2">` of `<Badge>` for the multi-port case. No custom CSS.
- `selected` is derived from xyflow's node `data.selected` (or whatever the existing canvas uses; mirror current selection plumbing).
- Pill positioning: absolute, anchored to the handle's right edge (output side) or left edge (input side), offset by 6-8px. Tweak in dev once running.
- The pill is the canonical multi-port signature display surface. Make sure the spacing and alignment read cleanly even with 4-5 rows.
- Accessibility: the badge text IS the screen-reader-visible content; aria-label is redundant.
