# US-023: Custom `WorkflowEdge` xyflow component with type-based styling + labels

**As a** workflow author scanning the canvas,
**I want** each edge to advertise its semantic role (normal vs case-routed vs
on-error) via colour and an inline label,
**So that** I can read the structural intent of a graph without opening the
inspector.

## Acceptance Criteria

- [x] **Scenario 1**: Normal edges render with the existing grey stroke + no label
    - **Given** an edge with `type: "normal"`
    - **When** `WorkflowEdge` renders
    - **Then** the SVG path uses stroke `#9ca3af` (existing default) and renders no label text

- [x] **Scenario 2**: Conditional edge from a switch shows `case[i]: <predicate>`
    - **Given** a switch node `s1` whose `cases[0].edgeId === "e-routed"` and `cases[0].condition` is `{ operator: "equals", left: { ref: "ctx.requiresReview" }, right: { value: true } }`
    - **And** an edge `{ id: "e-routed", source: "s1", target: "n2", type: "conditional" }`
    - **When** `WorkflowEdge` renders that edge
    - **Then** the stroke uses the switch's accent colour (matches `getControlFlowVisualHints("switch").color`)
    - **And** a label reading `case[0]: ctx.requiresReview == true` is rendered near the edge midpoint

- [x] **Scenario 3**: Conditional edge bound to `defaultEdge` labelled `default`
    - **Given** a switch node `s1` with `defaultEdge: "e-default"`
    - **And** an edge `{ id: "e-default", source: "s1", target: "n2", type: "conditional" }`
    - **When** rendered
    - **Then** the label reads `default`

- [x] **Scenario 4**: Conditional edge not referenced by any case labelled `case[?]`
    - **Given** a conditional edge sourced from a switch that does NOT appear in `cases[*].edgeId` or `defaultEdge`
    - **When** rendered
    - **Then** the label reads `case[?]` (visually flagging the orphan binding)

- [x] **Scenario 5**: Error edges render with red stroke + `on error` label
    - **Given** an edge with `type: "error"`
    - **When** `WorkflowEdge` renders
    - **Then** the stroke uses `var(--mantine-color-red-6, #e03131)` and a label reading `on error` is rendered near the midpoint

- [x] **Scenario 6**: Component is a registered xyflow edge type (`workflow-edge`)
    - **Given** `WorkflowEditorCanvas` registers `WorkflowEdge` under key `workflow-edge` in `edgeTypes`
    - **When** the canvas projects `config.edges` into xyflow edges, every edge sets `type: "workflow-edge"` and carries the `GraphEdge` data via `data: { graphEdge, switchNodes }` (or equivalent)
    - **Then** the renderer receives enough context to compute its label without re-walking the whole graph

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- `WorkflowEdge` accepts xyflow's `EdgeProps` plus `data` populated by the
  canvas projection. The projection passes the source `SwitchNode` (if the
  source is a switch) so the renderer can resolve `cases[i].edgeId` →
  `case[i]: <label>` without needing the entire graph.
- Use `@xyflow/react`'s `BaseEdge` + `EdgeLabelRenderer` for the
  label placement (matches the lib's recommended pattern).
- Label background: small `var(--mantine-color-body, #1a1b1e)` pill with
  the accent border colour so labels read against both light + dark
  backgrounds.
- Use the helper from US-021 (`formatConditionLabel`, `formatCaseLabel`).
- TDD: render the component in isolation with a fixture switch node +
  edge, assert label text + stroke colour. Use Mantine + ReactFlowProvider
  test wrappers.

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.test.tsx` — NEW.
