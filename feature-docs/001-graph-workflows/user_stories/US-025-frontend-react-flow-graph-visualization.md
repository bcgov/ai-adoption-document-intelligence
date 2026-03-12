# US-025: Implement React Flow GraphVisualization Component

**As a** workflow author,
**I want to** see a read-only visual representation of my workflow graph that auto-updates as I edit the JSON,
**So that** I can visually verify the structure, flow, and correctness of my workflow definition.

## Acceptance Criteria
- [ ] **Scenario 1**: Graph renders from valid config
    - **Given** a valid `GraphWorkflowConfig` object
    - **When** passed to the `GraphVisualization` component
    - **Then** React Flow renders nodes and edges matching the graph definition

- [ ] **Scenario 2**: Node types have distinct visual styles
    - **Given** nodes of different types in the graph
    - **When** rendered
    - **Then** each type has a distinct appearance: `activity` (rounded rectangle, blue), `switch` (diamond, yellow), `map` (with iteration icon, green), `join` (with merge icon, green), `childWorkflow` (with nested icon, purple), `pollUntil` (with refresh icon, orange), `humanGate` (with person icon, red)

- [ ] **Scenario 3**: Edge types have distinct visual styles
    - **Given** edges of different types
    - **When** rendered
    - **Then** `normal` edges are solid arrows, `conditional` edges are dashed with labels, `error` edges are red dashed arrows

- [ ] **Scenario 4**: Auto-layout positions nodes
    - **Given** a graph config without position metadata
    - **When** rendered
    - **Then** dagre or elkjs automatically computes node positions in a readable top-down or left-right layout

- [ ] **Scenario 5**: View is read-only with pan/zoom
    - **Given** the rendered graph
    - **When** the user interacts
    - **Then** pan and zoom are allowed but nodes are not draggable and edges cannot be modified

- [ ] **Scenario 6**: Null config shows placeholder
    - **Given** `config` is `null` (invalid JSON in editor)
    - **When** the component renders
    - **Then** a placeholder message is shown (e.g., "Fix JSON errors to see visualization")

- [ ] **Scenario 7**: Validation errors highlight nodes
    - **Given** `validationErrors` prop includes errors referencing specific nodes
    - **When** the graph renders
    - **Then** the affected nodes are visually highlighted (e.g., red border)

- [ ] **Scenario 8**: Node labels and types are displayed
    - **Given** any rendered node
    - **When** viewed
    - **Then** the node's `label` and `type` are visible on the node

- [ ] **Scenario 9**: Port names shown on edges
    - **Given** edges connecting nodes with specified ports
    - **When** rendered
    - **Then** port names are displayed on the edge labels if `sourcePort` or `targetPort` are specified

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/components/workflow/GraphVisualization.tsx`
- Replaces `WorkflowVisualization.tsx` (which is removed)
- Add `@xyflow/react` and `@dagrejs/dagre` (or `elkjs`) to frontend `package.json` per Section 8.3
- Props interface specified in Section 8.2
- The component converts `GraphWorkflowConfig` into React Flow nodes/edges, applies auto-layout, and renders
- Must use custom React Flow node types (established for future visual editing per Section 16)
- Render port handles on nodes even if not interactive yet (Section 16 preparation)
- Tests from Section 15.5: JSON edit updates visualization, node types render correctly, edge types render correctly
