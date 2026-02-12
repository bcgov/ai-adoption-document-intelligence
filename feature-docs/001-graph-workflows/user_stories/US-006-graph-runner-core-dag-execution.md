# US-006: Implement Core DAG Execution Engine (Graph Runner)

**As a** developer,
**I want to** have a core graph runner that interprets DAG definitions and executes nodes in topological order with parallel branch support,
**So that** arbitrary workflow graphs can be executed by a single generic Temporal workflow function without per-workflow code.

## Acceptance Criteria
- [ ] **Scenario 1**: Graph workflow function is registered
    - **Given** the Temporal worker starts
    - **When** the worker initializes
    - **Then** a `graphWorkflow` function with type `"graphWorkflow"` is registered and available for execution

- [ ] **Scenario 2**: Context initialization from defaults and initial values
    - **Given** a graph config with `ctx` declarations (including `defaultValue` fields) and an `initialCtx` input
    - **When** the graph runner initializes
    - **Then** the runtime context is populated by merging `initialCtx` over `ctx` defaults from the graph schema

- [ ] **Scenario 3**: Stable topological sort
    - **Given** a graph with multiple valid topological orderings
    - **When** the runner computes the execution order
    - **Then** the order is deterministic using alphabetical node ID as tiebreaker, and identical across multiple runs

- [ ] **Scenario 4**: Ready set management
    - **Given** a graph with nodes whose incoming edges have varying completion states
    - **When** the main loop evaluates the ready set
    - **Then** only nodes whose all incoming `normal` edge source nodes have completed are in the ready set

- [ ] **Scenario 5**: Parallel nodes scheduled in deterministic order
    - **Given** multiple nodes are in the ready set simultaneously
    - **When** they are scheduled for execution
    - **Then** they are scheduled in alphabetical order by node ID

- [ ] **Scenario 6**: Linear execution completes correctly
    - **Given** a simple 3-node linear graph (A -> B -> C)
    - **When** the workflow runs
    - **Then** nodes execute in order A, B, C with context values flowing correctly between them

- [ ] **Scenario 7**: Workflow returns final result
    - **Given** all nodes in the graph have completed
    - **When** the main loop finishes
    - **Then** the workflow returns a `GraphWorkflowResult` with the final `ctx`, list of `completedNodes`, and `status: "completed"`

- [ ] **Scenario 8**: Cancellation signal handling
    - **Given** a running graph workflow
    - **When** a `cancel` signal is received with `mode: "graceful"`
    - **Then** the current node completes and the workflow stops without executing further nodes

- [ ] **Scenario 9**: Immediate cancellation
    - **Given** a running graph workflow
    - **When** a `cancel` signal is received with `mode: "immediate"`
    - **Then** the workflow stops immediately

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/temporal/src/graph-workflow.ts` (workflow function) and `apps/temporal/src/graph-runner.ts` (core engine)
- The runner must only use Temporal primitives for timing (`sleep`, `condition`) -- never `Date.now()` or `Math.random()`
- All I/O is delegated to activities; the runner itself performs no I/O
- The execution algorithm is specified in Section 5.2
- Determinism requirements are specified in Section 5.3
- Tests must cover the execution tests from Section 15.2 (linear execution, deterministic ordering, cancel graceful, cancel immediate)
- The runner delegates to node-type-specific handlers (implemented in US-007 through US-012)
