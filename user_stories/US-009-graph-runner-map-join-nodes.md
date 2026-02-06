# US-009: Implement Map (Fan-Out) and Join (Fan-In) Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute map nodes that fan-out over collections in parallel and join nodes that collect results back,
**So that** workflow graphs can process multiple items (e.g., document segments) concurrently with configurable concurrency limits.

## Acceptance Criteria
- [ ] **Scenario 1**: Map node iterates over a collection
    - **Given** a map node with `collectionCtxKey: "segments"` and `ctx.segments` containing 3 items
    - **When** the map node executes
    - **Then** the body subgraph (from `bodyEntryNodeId` to `bodyExitNodeId`) is executed once for each item

- [ ] **Scenario 2**: Each branch gets an isolated context copy
    - **Given** a map node iterating over items
    - **When** a branch is created for each item
    - **Then** each branch receives a shallow copy of the parent ctx with `itemCtxKey` set to the current item and `indexCtxKey` (if specified) set to the iteration index

- [ ] **Scenario 3**: Writes within branches do not affect parent or siblings
    - **Given** a branch writes to a ctx key during execution
    - **When** the write occurs
    - **Then** the parent ctx and other branch contexts are not modified

- [ ] **Scenario 4**: maxConcurrency limits parallel execution
    - **Given** a map node with `maxConcurrency: 3` iterating over 10 items
    - **When** the map executes
    - **Then** no more than 3 branches run simultaneously (semaphore pattern)

- [ ] **Scenario 5**: Join node collects all results (strategy: "all")
    - **Given** a join node with `strategy: "all"` and `sourceMapNodeId` referencing a map node
    - **When** all branches from the map node complete
    - **Then** the outputs from each branch's `bodyExitNodeId` are collected into an array and stored in `ctx[resultsCtxKey]`

- [ ] **Scenario 6**: Join node collects first result (strategy: "any")
    - **Given** a join node with `strategy: "any"`
    - **When** the first branch completes successfully
    - **Then** the result is stored in `ctx[resultsCtxKey]` and remaining branches are cancelled

- [ ] **Scenario 7**: Large collections use child workflow batching
    - **Given** a map node iterating over more than 50 items
    - **When** the map executes
    - **Then** items are batched into child workflows to keep the parent workflow's event history bounded

- [ ] **Scenario 8**: Empty collection produces empty results
    - **Given** a map node where `ctx[collectionCtxKey]` is an empty array
    - **When** the map and join execute
    - **Then** the join produces an empty array in `ctx[resultsCtxKey]`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Fan-out/fan-in details in Section 5.4
- Context scoping rules in Section 7.3
- The batch size threshold for child workflow batching is configurable (default: 50 items per Section 5.4)
- The SDPR example in Section 4.5 demonstrates map/join with `processSegments` and `collectResults`
- Tests must cover: map fan-out fan-in, map with maxConcurrency (Section 15.2)
