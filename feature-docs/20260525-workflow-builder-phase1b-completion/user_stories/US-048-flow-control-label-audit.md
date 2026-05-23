# US-048: Replace engineering jargon in Flow Control labels

**As a** non-technical workflow author,
**I want** the Flow Control palette entries to read in plain English,
**So that** I can pick the right control-flow node without prior
familiarity with workflow-engine vocabulary.

## Acceptance Criteria

- [ ] **Scenario 1**: Audit table proposed for sign-off
    - **Given** the current labels in
      `apps/frontend/src/features/workflow-builder/palette/control-flow-palette-entries.ts`
    - **When** this story starts
    - **Then** a side-by-side table of proposed renames is added to this
      story's "Proposed labels" section and surfaced for Alex to approve
      before code changes land

- [ ] **Scenario 2**: After sign-off, labels are updated
    - **Given** an approved label set
    - **When** the file is edited
    - **Then** each `displayName` is replaced with its approved
      end-user phrasing
    - **And** the existing tests that match label text are updated in
      lockstep (no behavior change beyond the visible string)

- [ ] **Scenario 3**: Palette + node-renderer labels stay in sync
    - **Given** the renames
    - **When** a palette label changes (e.g., "Map (fan-out)")
    - **Then** the corresponding canvas-node renderer label (in
      `control-flow-visual-hints.ts`) is updated to match

## Proposed labels (subject to Alex's call)

| Current `displayName` | Proposed |
|---|---|
| Switch | Branch by condition |
| Map (fan-out) | Run for each item |
| Join (fan-in) | Collect results |
| Child workflow | Sub-workflow |
| Poll until | Wait until condition |
| Human gate | Wait for approval |

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/palette/control-flow-palette-entries.ts`
- `apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts` (if it duplicates labels)
- Any tests that match against the old `displayName` strings.
