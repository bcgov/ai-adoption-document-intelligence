# US-007: Implement Activity Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute activity nodes by resolving port bindings, invoking registered Temporal activities, and writing outputs back to context,
**So that** graph definitions can reference any registered activity and have it executed with correct data flow.

## Acceptance Criteria
- [ ] **Scenario 1**: Input port bindings resolve from context
    - **Given** an activity node with `inputs: [{ port: "documentId", ctxKey: "documentId" }]`
    - **When** the node executes
    - **Then** the value of `ctx.documentId` is read and passed to the activity as the `documentId` parameter

- [ ] **Scenario 2**: Static parameters are merged with runtime inputs
    - **Given** an activity node with both `inputs` and `parameters: { status: "ongoing_ocr" }`
    - **When** the node executes
    - **Then** the activity receives both the resolved input port values and the static parameter values

- [ ] **Scenario 3**: Output port bindings write to context
    - **Given** an activity node with `outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }]`
    - **When** the activity returns a result with an `ocrResult` field
    - **Then** the value is written to `ctx.ocrResult`

- [ ] **Scenario 4**: Activity type resolved from registry
    - **Given** an activity node with `activityType: "azureOcr.submit"`
    - **When** the runner processes the node
    - **Then** the activity function registered under `"azureOcr.submit"` is invoked via Temporal's `proxyActivities`

- [ ] **Scenario 5**: Retry and timeout configuration applied
    - **Given** an activity node with `retry: { maximumAttempts: 3 }` and `timeout: { startToClose: "2m" }`
    - **When** the activity is scheduled
    - **Then** Temporal applies the specified retry policy and timeout configuration

- [ ] **Scenario 6**: Unknown activity type fails with ACTIVITY_NOT_FOUND
    - **Given** an activity node with an `activityType` not in the registry
    - **When** the runner attempts to execute it
    - **Then** the workflow fails with a non-retryable `ApplicationFailure` of type `ACTIVITY_NOT_FOUND`

- [ ] **Scenario 7**: Dot notation in port bindings
    - **Given** an input port binding with `ctxKey: "currentSegment.blobKey"`
    - **When** the runner resolves the binding
    - **Then** it reads `ctx.currentSegment` and accesses `.blobKey` on the result

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Port binding resolution follows Section 7.2: read inputs, execute, write outputs
- Dot notation for nested access follows Section 7.2 conventions
- Default timeout and retry come from the activity registry entry if not specified on the node
- Tests must verify context flows correctly through a chain of activity nodes (Section 15.2 linear execution test)
