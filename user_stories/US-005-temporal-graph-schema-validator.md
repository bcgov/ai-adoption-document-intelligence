# US-005: Implement Temporal Worker Graph Schema Validator

**As a** developer,
**I want to** have a graph schema validator within the Temporal worker,
**So that** graph configurations are validated at execution time as a defensive check before the graph runner begins processing nodes.

## Acceptance Criteria
- [ ] **Scenario 1**: Validation runs at workflow start
    - **Given** a `graphWorkflow` is started with a graph definition
    - **When** the graph runner begins execution (step 1 of the execution algorithm)
    - **Then** the graph config is validated before any nodes are executed

- [ ] **Scenario 2**: Invalid configs fail with GRAPH_VALIDATION_ERROR
    - **Given** a graph config that fails validation (e.g., cycle detected, unknown activity type)
    - **When** validation fails
    - **Then** the workflow fails with a non-retryable `ApplicationFailure` of type `GRAPH_VALIDATION_ERROR`

- [ ] **Scenario 3**: Valid configs proceed to execution
    - **Given** a graph config that passes all validation checks
    - **When** validation succeeds
    - **Then** the graph runner proceeds to initialize context and begin node execution

- [ ] **Scenario 4**: Activity types validated against runtime registry
    - **Given** a graph config with activity nodes
    - **When** the worker-side validator runs
    - **Then** it checks activity types against the actual runtime activity registry (not just a constant), ensuring the worker can execute all referenced activities

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/graph-schema-validator.ts`
- This validator may share core logic with the backend validator (US-004) but runs in the Temporal worker context
- The worker-side validator has access to the actual activity registry, making it a stronger check than the backend constant-based validation
- Per Section 5.2 step 1, this is the first step of the execution algorithm
- Must not use non-deterministic operations (no I/O, no Date.now) since it runs inside the workflow function
- Tests should verify that invalid configs produce the correct `ApplicationFailure` type
