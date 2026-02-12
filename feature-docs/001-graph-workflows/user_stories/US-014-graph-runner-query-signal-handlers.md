# US-014: Implement Query and Signal Handlers for graphWorkflow

**As a** developer,
**I want to** the graphWorkflow to expose Temporal query and signal handlers for status, progress, and cancellation,
**So that** external systems and the frontend can monitor workflow execution and control running workflows.

## Acceptance Criteria
- [ ] **Scenario 1**: getStatus query returns current execution state
    - **Given** a running graphWorkflow
    - **When** the `getStatus` query is invoked
    - **Then** it returns `GraphWorkflowStatus` with `overallStatus`, `currentNodes`, `nodeStatuses` (per-node status with timestamps), and `lastError` if applicable

- [ ] **Scenario 2**: getProgress query returns completion metrics
    - **Given** a graphWorkflow with 10 nodes, 4 completed
    - **When** the `getProgress` query is invoked
    - **Then** it returns `{ completedCount: 4, totalCount: 10, currentNodes: [...], progressPercentage: 40 }`

- [ ] **Scenario 3**: cancel signal with graceful mode
    - **Given** a running graphWorkflow
    - **When** a `cancel` signal is sent with `{ mode: "graceful" }`
    - **Then** the currently executing node(s) complete, and the workflow stops without scheduling further nodes

- [ ] **Scenario 4**: cancel signal with immediate mode
    - **Given** a running graphWorkflow
    - **When** a `cancel` signal is sent with `{ mode: "immediate" }`
    - **Then** the workflow stops immediately

- [ ] **Scenario 5**: Dynamic signal handlers from humanGate nodes
    - **Given** a graphWorkflow with a humanGate node defining `signal.name: "humanApproval"`
    - **When** the humanGate node is reached and begins waiting
    - **Then** a signal handler for `"humanApproval"` is registered on the workflow and can receive external signals

- [ ] **Scenario 6**: Node statuses track lifecycle
    - **Given** a node transitions through execution
    - **When** the node starts, completes, fails, or is skipped
    - **Then** its entry in `nodeStatuses` reflects `status: "pending" | "running" | "completed" | "failed" | "skipped"` with `startedAt` and `completedAt` timestamps

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Query and signal handlers specified in Section 5.6
- Error reporting format in Section 11.4 (GraphWorkflowStatus interface)
- The `ctx` in getStatus may be redacted for large values to keep query responses lightweight
- Signal handlers use Temporal's `setHandler` for queries and `defineSignal`/`setHandler` for signals
- Tests should verify query responses at various execution stages
