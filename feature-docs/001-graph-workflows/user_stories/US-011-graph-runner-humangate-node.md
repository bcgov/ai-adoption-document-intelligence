# US-011: Implement HumanGate Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute humanGate nodes that pause workflow execution and wait for a human signal,
**So that** workflow graphs can include approval gates, manual review steps, and other human-in-the-loop interactions.

## Acceptance Criteria
- [ ] **Scenario 1**: Workflow pauses and waits for signal
    - **Given** a humanGate node with `signal.name: "humanApproval"`
    - **When** the node executes
    - **Then** the workflow registers a signal handler for `"humanApproval"` and blocks using Temporal `condition()` until the signal is received or timeout expires

- [ ] **Scenario 2**: Signal received with approval continues workflow
    - **Given** a humanGate node is waiting for a signal
    - **When** the `humanApproval` signal is received with `{ approved: true }`
    - **Then** the workflow continues to the next node

- [ ] **Scenario 3**: Signal received with rejection fails workflow
    - **Given** a humanGate node is waiting for a signal
    - **When** the signal is received with `{ approved: false }`
    - **Then** the workflow fails with a non-retryable `ApplicationFailure` of type `HUMAN_GATE_REJECTED`

- [ ] **Scenario 4**: Timeout with onTimeout "fail"
    - **Given** a humanGate node with `timeout: "24h"` and `onTimeout: "fail"`
    - **When** no signal is received within 24 hours
    - **Then** the workflow fails with `HUMAN_GATE_TIMEOUT`

- [ ] **Scenario 5**: Timeout with onTimeout "continue"
    - **Given** a humanGate node with `onTimeout: "continue"`
    - **When** no signal is received within the timeout
    - **Then** the workflow continues to the next node as if the gate was approved

- [ ] **Scenario 6**: Timeout with onTimeout "fallback"
    - **Given** a humanGate node with `onTimeout: "fallback"` and `fallbackEdgeId: "edge-to-fallback"`
    - **When** no signal is received within the timeout
    - **Then** the workflow follows the specified fallback edge

- [ ] **Scenario 7**: Signal payload is accessible
    - **Given** a humanGate node with `payloadSchema` specifying expected fields
    - **When** the signal is received with a payload (reviewer, comments, etc.)
    - **Then** the payload data is accessible in the workflow context for downstream nodes

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Per Section 4.2.7, maps to Temporal `condition()` + timer pattern
- The signal name is dynamic (comes from the node definition), so signal handlers are registered at runtime
- The worked example in Section 4.4 shows `humanReview` as a humanGate node
- Tests must cover: humanGate approval, humanGate rejection, humanGate timeout (Section 15.2)
