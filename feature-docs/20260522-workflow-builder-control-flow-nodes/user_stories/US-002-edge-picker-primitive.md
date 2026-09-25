# US-002: EdgePicker primitive

**As a** workflow author,
**I want to** pick an outgoing edge from a specific node via a dropdown,
**So that** I can route switch cases, default branches, and fallback paths to existing edges without typing edge ids.

## Acceptance Criteria

- [x] **Scenario 1**: Lists edges that originate from `fromNodeId`
    - **Given** a `GraphWorkflowConfig` with edges where some have `source === "n1"` and others don't, and the picker is rendered with `fromNodeId="n1"`
    - **When** the option list opens
    - **Then** only edges with `source === "n1"` appear

- [x] **Scenario 2**: Option labels show the target node's label plus the edge id
    - **Given** an edge `{ id: "e1", source: "n1", target: "n2" }` and `config.nodes["n2"].label === "Validate"`
    - **When** the picker renders that option
    - **Then** the option's primary text is `"Validate"` and secondary text shows `"e1"`

- [x] **Scenario 3**: Emits `onChange` with the chosen id and supports clearing
    - **Given** the picker is rendered with `value="e1"`
    - **When** the user picks a different edge, then clears the field
    - **Then** `onChange` fires first with the new edge id, then with `null`

- [x] **Scenario 4**: Warns inline when the bound edge no longer exists or its source changed
    - **Given** `value="e1"` and either no edge with id `e1` exists, or the edge exists but `edge.source !== fromNodeId`
    - **When** the picker renders
    - **Then** an inline warning is displayed indicating the bound edge is stale

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx`.
- Use Mantine `Select`.
- Purely presentational; parent owns mutation.
- Re-exported from `graph-widgets/index.ts`.
- Accompanied by a React-Testing-Library test file exercising all 4 scenarios.
