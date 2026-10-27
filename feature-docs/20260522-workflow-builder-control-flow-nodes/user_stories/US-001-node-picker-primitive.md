# US-001: NodePicker primitive

**As a** workflow author,
**I want to** select a node from the current graph via a typeahead picker,
**So that** I can configure references like `join.sourceMapNodeId` or `map.bodyEntryNodeId` without typing raw node ids.

## Acceptance Criteria

- [x] **Scenario 1**: Lists nodes from `config.nodes`
    - **Given** a `GraphWorkflowConfig` with multiple nodes is passed in
    - **When** the `NodePicker` renders
    - **Then** each entry in `config.nodes` appears as an option with its `label` (or id) and a small badge showing its `type`

- [x] **Scenario 2**: `filterType` prop narrows options to nodes of that type
    - **Given** the picker is rendered with `filterType="map"` and the config contains a mix of activity, map, and switch nodes
    - **When** the option list opens
    - **Then** only nodes whose `type === "map"` are listed

- [x] **Scenario 3**: Excludes the currently-selected node from its own options
    - **Given** the picker is configured with `currentNodeId="n1"`
    - **When** the option list opens
    - **Then** the node with id `n1` is not present in the options

- [x] **Scenario 4**: Emits `onChange` with the chosen id and supports clearing
    - **Given** the picker is rendered with a non-null value
    - **When** the user selects a different node, then clears the field
    - **Then** `onChange` fires first with the new id, then with `null`

- [x] **Scenario 5**: Warns inline when the bound value points to a missing node
    - **Given** the picker's `value` is `"deleted-node-id"` and `config.nodes` does not contain a node with that id
    - **When** the picker renders
    - **Then** an inline warning is displayed indicating the referenced node no longer exists

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/graph-widgets/NodePicker.tsx`.
- Use Mantine `Select` by default, switch to `Autocomplete` if `Object.keys(config.nodes).length > 20`.
- Purely presentational — never mutates the graph, only reports the user's selection via `onChange`.
- Re-exported from `graph-widgets/index.ts`.
- Accompanied by a React-Testing-Library test file exercising all 5 scenarios.
