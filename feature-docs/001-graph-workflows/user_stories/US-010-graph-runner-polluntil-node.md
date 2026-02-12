# US-010: Implement PollUntil Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute pollUntil nodes that repeatedly invoke an activity until a condition is met or a timeout occurs,
**So that** workflow graphs can poll external services (e.g., Azure OCR status) with configurable intervals and limits.

## Acceptance Criteria
- [ ] **Scenario 1**: Polling stops when condition is met
    - **Given** a pollUntil node polling `azureOcr.poll` with condition `ctx.ocrResponse.status != "running"`
    - **When** the activity returns a response where status is "succeeded"
    - **Then** the polling loop stops and the result is written to the output ctx key

- [ ] **Scenario 2**: Polling respects the interval
    - **Given** a pollUntil node with `interval: "10s"`
    - **When** each poll iteration completes without the condition being met
    - **Then** the runner waits 10 seconds (via Temporal `sleep`) before the next poll

- [ ] **Scenario 3**: Initial delay is applied
    - **Given** a pollUntil node with `initialDelay: "5s"`
    - **When** the node begins execution
    - **Then** the runner waits 5 seconds before the first poll attempt

- [ ] **Scenario 4**: maxAttempts exceeded triggers POLL_TIMEOUT
    - **Given** a pollUntil node with `maxAttempts: 20` and the condition never becomes true
    - **When** 20 poll attempts have been made
    - **Then** the node fails with a non-retryable `ApplicationFailure` of type `POLL_TIMEOUT`

- [ ] **Scenario 5**: Overall timeout triggers POLL_TIMEOUT
    - **Given** a pollUntil node with `timeout: "10m"` and the condition never becomes true
    - **When** 10 minutes have elapsed
    - **Then** the node fails with `POLL_TIMEOUT` regardless of remaining attempts

- [ ] **Scenario 6**: Input and output port bindings are honored
    - **Given** a pollUntil node with input ports mapping from ctx and output ports writing to ctx
    - **When** the polling activity is invoked
    - **Then** input values are resolved from ctx and final output values are written back to ctx

- [ ] **Scenario 7**: Long-running polls may use child workflows
    - **Given** a pollUntil node expected to run for an extended period
    - **When** the runner determines the poll could generate significant history events
    - **Then** the runner may launch the poll loop as a child workflow to keep the parent history bounded

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Uses the expression evaluator from US-003 for condition checking
- Per Section 4.2.6, the runner compiles this into an activity call + durable sleep loop
- The polling uses Temporal `sleep` for deterministic timing
- The worked example in Section 4.4 shows `pollOcrResults` as a pollUntil node
- Tests must cover: pollUntil success, pollUntil timeout (Section 15.2)
