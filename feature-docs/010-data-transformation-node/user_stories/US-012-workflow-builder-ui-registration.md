# US-012: Add Transform Node to Workflow Builder UI

**As an** admin,
**I want to** see the Data Transformation node listed in the workflow builder's node type palette and rendered distinctively in the graph visualization,
**So that** I can add and visually identify transform nodes in my workflow graphs.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Transform node appears in the node type dropdown
    - **Given** the admin is editing a workflow and adding a new node
    - **When** they open the node type selector in `GraphConfigFormEditor`
    - **Then** `"transform"` appears in the list with the label `"Data Transformation"`

- [ ] **Scenario 2**: defaultNodeForType returns a valid TransformNode structure
    - **Given** the node type `"transform"` is selected for a new node
    - **When** `defaultNodeForType("transform", id)` is called
    - **Then** it returns a `TransformNode` with `inputFormat: "json"`, `outputFormat: "json"`, and `fieldMapping: "{}"` as defaults

- [ ] **Scenario 3**: Transform node has defined dimensions in GraphVisualization
    - **Given** a workflow config containing a transform node
    - **When** the graph visualization renders
    - **Then** `NODE_DIMENSIONS` includes an entry for `"transform"` with appropriate width and height values

- [ ] **Scenario 4**: Transform node has a distinct colour in GraphVisualization
    - **Given** a workflow config containing a transform node
    - **When** the graph visualization renders
    - **Then** `NODE_COLORS` includes an entry for `"transform"` with a colour distinct from all other node types

- [ ] **Scenario 5**: Transform node has an icon in GraphVisualization
    - **Given** a workflow config containing a transform node
    - **When** the graph visualization renders
    - **Then** `NODE_ICONS` includes an entry for `"transform"` with a relevant Tabler icon

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- Files to update: `apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx` (NODE_TYPES, defaultNodeForType) and `apps/frontend/src/components/workflow/GraphVisualization.tsx` (NODE_DIMENSIONS, NODE_COLORS, NODE_ICONS).
- The frontend `GraphNode` type (updated in US-001) must include `TransformNode` for this story to compile.
- A suitable icon might be `IconTransform` or `IconArrowsExchange` from `@tabler/icons-react`.
- This story is a prerequisite for US-013 (configuration form) and US-015 (summary view).
