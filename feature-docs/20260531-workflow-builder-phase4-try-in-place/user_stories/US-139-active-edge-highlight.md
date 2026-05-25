# US-139: `computeActiveEdges` + active-edge animation

**As a** user watching a Try execute on the canvas,
**I want** the edge connecting the currently-running node to its downstream pending node to animate (xyflow dashed-stroke + blue colour),
**So that** the execution path is visually obvious without me reading node statuses one-by-one.

## Acceptance Criteria

- [ ] **Scenario 1**: Pure helper `computeActiveEdges`
    - **Given** `apps/frontend/src/features/workflow-builder/run/active-edges.ts` (new file)
    - **When** read
    - **Then** it exports `function computeActiveEdges(config: GraphWorkflowConfig, statuses: Record<string, NodeRunStatus>): Set<string>` (returning a set of edge ids)
    - **And** an edge `{ id, source, target }` is active when `statuses[source]?.status === "running"` AND (`statuses[target]?.status === "pending"` OR `statuses[target] === undefined`)
    - **And** the helper is a pure function (no side effects)

- [ ] **Scenario 2**: Multiple active edges supported simultaneously
    - **Given** a graph where two activities run in parallel (e.g., a `map` branch)
    - **When** both source nodes are "running" simultaneously
    - **Then** `computeActiveEdges` returns the union of both edges' ids
    - **And** the canvas animates both edges

- [ ] **Scenario 3**: No active edges in terminal state
    - **Given** a workflow whose every status is terminal (succeeded / failed / skipped / cancelled)
    - **When** `computeActiveEdges` is called
    - **Then** the returned set is empty
    - **And** no edges animate

- [ ] **Scenario 4**: `WorkflowEdge.tsx` accepts and renders the active state
    - **Given** the existing `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` (Phase 1B Milestone A)
    - **When** read after the change
    - **Then** it accepts a new `data.isActive?: boolean` prop in its `EdgeProps` data
    - **And** when `isActive` is true: edge renders with `animated: true` AND `style.stroke = mantineTheme.colors.blue[6]` AND `style.strokeWidth = 2.5`
    - **And** when `isActive` is false: edge renders with the existing Phase 1B styling (per-edge-type stroke + label)

- [ ] **Scenario 5**: Canvas wires `computeActiveEdges` into edge data
    - **Given** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
    - **When** read after the change
    - **Then** it computes `const activeEdges = computeActiveEdges(config, statuses)` inside its render path
    - **And** each xyflow edge's `data` prop is augmented: `{ ...existingData, isActive: activeEdges.has(edge.id) }`
    - **And** the `statuses` value comes from `useNodeRunStatus` consumed through the `RunStateContext` (US-138)

- [ ] **Scenario 6**: Unit tests for the helper
    - **Given** `apps/frontend/src/features/workflow-builder/run/active-edges.test.ts`
    - **When** tests run
    - **Then** at least 5 cases pass: linear chain mid-execution, parallel branches both running, all-terminal returns empty, cache-hit node has no active outgoing edge (skipped is terminal), unknown target node id treated as pending

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/active-edges.ts` — pure helper
- `apps/frontend/src/features/workflow-builder/run/active-edges.test.ts` — unit tests
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` — render active-edge styling
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — wire `computeActiveEdges` into edge data

## Technical notes

- xyflow's `animated: true` toggle renders the built-in marching-ants animation; no custom CSS needed.
- The blue colour (`theme.colors.blue[6]`) matches the "running" status badge colour from US-138 — visual consistency.
- This story closes Milestone C — after it lands, status badges + active-edge animation are wired but cannot be triggered (no Try button yet). Milestone E (US-146 → US-149) adds the trigger.
- Verification surface for Alex: if you manually set `activeRunId` to a known Temporal run via React DevTools, you'll see the live execution surface animate. End-to-end click-and-play only after Milestone E.
- After landing: no Vite restart (frontend-only).
