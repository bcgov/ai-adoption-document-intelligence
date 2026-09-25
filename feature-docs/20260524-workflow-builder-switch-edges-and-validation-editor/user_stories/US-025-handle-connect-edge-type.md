# US-025: `handleConnect` stamps `conditional` / `error` / `normal` per source

**As a** workflow author drawing a new edge,
**I want** the editor to pick the right `GraphEdge.type` automatically based
on where I drew the edge from,
**So that** the schema stays well-typed without me opening the JSON.

## Acceptance Criteria

- [x] **Scenario 1**: Edge drawn from a switch source defaults to `conditional`
    - **Given** a graph with switch node `s1` and activity `n2`
    - **When** `handleConnect({ source: "s1", target: "n2", sourceHandle: "out", ... })` is invoked
    - **Then** the new edge added to `config.edges` has `type: "conditional"`

- [x] **Scenario 2**: Edge drawn from any node's error handle defaults to `error`
    - **Given** an activity `a1` whose `errorPolicy.onError === "fallback"`
    - **When** `handleConnect({ source: "a1", target: "n2", sourceHandle: "error", ... })` is invoked
    - **Then** the new edge has `type: "error"`

- [x] **Scenario 3**: Edge from a non-switch node's `out` handle defaults to `normal`
    - **Given** an activity `a1` without a fallback policy and any other target
    - **When** `handleConnect({ source: "a1", target: "n2", sourceHandle: "out", ... })` is invoked
    - **Then** the new edge has `type: "normal"`

- [x] **Scenario 4**: Switch source + error handle still produces `error` (not `conditional`)
    - **Given** a switch node `s1` (with whatever errorPolicy — irrelevant; switch doesn't render the error handle today, but `handleConnect` must defend in depth)
    - **When** `handleConnect({ source: "s1", target: "n2", sourceHandle: "error", ... })` is invoked
    - **Then** the resulting edge is `type: "error"` (the explicit handle id wins over the source type heuristic)

- [x] **Scenario 5**: Existing duplicate / self-loop guards remain in place
    - **Given** an attempt to connect a node to itself, or to add a duplicate `source/target` pair
    - **When** `handleConnect` runs
    - **Then** no edge is added (unchanged from current behavior)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The handle id passed via `Connection.sourceHandle` is the source-of-truth
  for `error` vs `out`. The source node type is the source-of-truth for
  `conditional` vs `normal` when the handle is `out` (or `null`).
- Resolve `source` → node via `config.nodes[connection.source]`. If
  `node?.type === "switch"` → `conditional`; else → `normal`. Then override
  to `error` if `sourceHandle === "error"`.
- The `id` and structure of the new `GraphEdge` are otherwise unchanged.
- TDD via `WorkflowEditorCanvas.test.tsx`: invoke `handleConnect` via the
  xyflow `onConnect` callback in a render harness, or expose the function
  for direct test.

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — `handleConnect` updated.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`
  — new scenarios.
