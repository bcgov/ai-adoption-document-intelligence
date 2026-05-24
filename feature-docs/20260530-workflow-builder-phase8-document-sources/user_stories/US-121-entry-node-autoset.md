# US-121: `entryNodeId` autoset on source-node-first drop

**As a** workflow author dragging a source node onto an empty canvas,
**I want** the editor to set the workflow's `entryNodeId` to the source's id automatically,
**So that** the source is recognised as the workflow's entry point without me having to manually configure it.

## Acceptance Criteria

- [ ] **Scenario 1**: Source dropped on empty canvas → `entryNodeId` set
    - **Given** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` (or the canvas-state Zustand store that owns graph state)
    - **When** the canvas has no nodes (`Object.keys(config.nodes).length === 0`) and the user drops a source palette entry
    - **Then** the new `SourceNode` is created AND `config.entryNodeId` is set to the new source node's id
    - **And** a vitest asserts the entryNodeId state update

- [ ] **Scenario 2**: Additional nodes don't override entryNodeId
    - **Given** a workflow with a source node already on the canvas (entryNodeId pointing at it)
    - **When** the user drops an activity (or another source) onto the canvas
    - **Then** `entryNodeId` is unchanged
    - **And** the new node is added to `config.nodes` but does NOT replace the entry

- [ ] **Scenario 3**: Existing workflows opened in editor — `entryNodeId` never silently rewritten
    - **Given** an existing legacy workflow whose `entryNodeId` points at an activity node (no source nodes in the config)
    - **When** the user opens the workflow in the V2 editor
    - **Then** `entryNodeId` is NOT changed
    - **And** the user can still drop a source node onto the canvas, but the autoset does NOT fire (the canvas had nodes — Scenario 1's empty-canvas precondition fails)
    - **And** the user can manually rewire `entryNodeId` to the source via the existing entryNode picker

- [ ] **Scenario 4**: Frontend vitest coverage
    - **Given** a test for the canvas-state mutation that handles drops
    - **When** the test exercises both branches (empty canvas vs non-empty)
    - **Then** Scenarios 1 + 2 are asserted explicitly
    - **And** Scenario 3 has a test asserting the entryNodeId is preserved when an existing workflow loads

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — extend the drop-handler (or the Zustand action it calls) to autoset entryNodeId when canvas was empty
- A matching `.test.tsx` for the page or for the Zustand action (whichever the existing pattern uses)

## Technical notes

- This story is intentionally tiny — it's a single conditional in the drop handler. Keep it small.
- The "canvas is empty" check is `Object.keys(config.nodes).length === 0` BEFORE the new node is added, not after.
- Per DOCUMENT_SOURCES_DESIGN.md §5 + L22, the runtime treats `entryNodeId` pointing at a source node as "no-op the source, start at its outbound-edge target". The runtime change for that semantics is NOT in this story — the runtime hook is L22-flavored but the engine doesn't need a code change because source nodes' "execution" is already absorbed by the /runs ctx-merge (no Temporal activity). The editor merely sets `entryNodeId` to the source id; the rest is data flow.
- US-121 can land in PARALLEL with US-117/118/119/120 — it's independent of the renderer + palette + settings (it only depends on the catalog entries existing for the drop handler to call into).
