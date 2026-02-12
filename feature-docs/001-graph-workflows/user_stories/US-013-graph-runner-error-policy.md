# US-013: Implement Per-Node Error Policy Handling in Graph Runner

**As a** developer,
**I want to** the graph runner to handle per-node error policies including fail, fallback, and skip behaviors,
**So that** workflow graphs can define resilient error handling strategies including fallback edges to alternative paths (e.g., routing to human review on OCR failure).

## Acceptance Criteria
- [ ] **Scenario 1**: Default behavior (fail) propagates error to workflow
    - **Given** a node without an `errorPolicy` (or with `onError: "fail"`) that encounters an error
    - **When** the error occurs
    - **Then** the node failure propagates to the workflow, which fails

- [ ] **Scenario 2**: Fallback follows error edge
    - **Given** a node with `errorPolicy: { onError: "fallback", fallbackEdgeId: "edge-to-review" }` and a corresponding `error` type edge
    - **When** the node fails
    - **Then** the graph runner follows the fallback edge instead of failing the workflow

- [ ] **Scenario 3**: Skip continues to next node
    - **Given** a node with `errorPolicy: { onError: "skip" }` that encounters an error
    - **When** the error occurs
    - **Then** the node is marked as "skipped", output ports are not written, and execution continues to the next node(s) via normal edges

- [ ] **Scenario 4**: Retryable flag integrates with Temporal retry
    - **Given** a node with `errorPolicy: { retryable: true }` and the error is a transient failure
    - **When** the error occurs
    - **Then** Temporal's retry mechanism retries the activity according to the node's retry configuration before triggering the error policy

- [ ] **Scenario 5**: Fallback edge must be of type "error"
    - **Given** a node's `fallbackEdgeId` references an edge
    - **When** the graph is validated
    - **Then** the referenced edge must have `type: "error"`; otherwise validation fails

- [ ] **Scenario 6**: Error information recorded in node status
    - **Given** a node that fails (regardless of error policy)
    - **When** the error is processed
    - **Then** the `getStatus` query reports the error details including node ID, message, type, and retryable flag

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Error policy types and behavior defined in Section 11.1
- Fallback edge example in Section 11.2 (OCR failure routing to human review)
- Temporal error types in Section 11.3 (ApplicationFailure with type strings)
- Error reporting in queries per Section 11.4
- Tests must cover: error fallback, error skip, error fail (Section 15.2)
