# US-011: Palette "Flow Control" section + skeleton-add handlers

**As a** workflow author,
**I want to** add control-flow nodes to the canvas by clicking entries in the left palette,
**So that** I do not need to drop to the JSON editor just to insert a switch, map, or pollUntil node.

## Acceptance Criteria

- [x] **Scenario 1**: New "Flow Control" section appears at the top of the palette
    - **Given** the palette renders
    - **When** the user scans the palette
    - **Then** a "Flow Control" section is the first section above the existing activity categories, listing the six control-flow node types

- [x] **Scenario 2**: Each Flow-Control entry has an icon, display name, and short description
    - **Given** the "Flow Control" section renders
    - **When** the user hovers each entry
    - **Then** every entry shows a Tabler icon, the type's display name (e.g. "Switch", "Map (fan-out)", "Join (fan-in)", "Child Workflow", "Poll Until", "Human Gate"), and a short description visible on hover

- [x] **Scenario 3**: Clicking an entry adds a skeleton node with correct defaults
    - **Given** the canvas is empty (or in any state)
    - **When** the user clicks each Flow-Control entry in turn
    - **Then** a new node of the corresponding type appears in `config.nodes` with these defaults: `switch → cases: []`; `map → empty ctxKey strings + empty body refs`; `join → empty sourceMapNodeId, strategy: "all"`; `childWorkflow → workflowRef: { type: "library", workflowId: "" }`; `pollUntil → empty activityType, interval: "30s"`; `humanGate → empty signal.name, timeout: "1h", onTimeout: "fail"`

- [x] **Scenario 4**: Skeleton position uses the existing add-position logic
    - **Given** the canvas already has N nodes
    - **When** the user clicks a Flow-Control entry
    - **Then** the new node's `metadata.position` is calculated by the same logic the activity adds use (the existing `x=80 + i*240, y=100 + (i%3)*140` stagger or its successor)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Modifies `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`.
- The palette currently sources entries from `ACTIVITY_CATALOG`. Control-flow entries are a separate hard-coded list of `{ type, displayName, description, iconHint }` — they are NOT activities and should not be added to `ACTIVITY_CATALOG`.
- Reuse existing node-id-generation and position-calculation helpers; do not invent new ones.
- A click-handler test confirms each entry produces the expected node skeleton in `onConfigChange`.
