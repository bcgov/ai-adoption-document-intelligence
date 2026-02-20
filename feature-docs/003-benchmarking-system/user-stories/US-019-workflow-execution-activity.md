# US-019: Workflow Execution Activity

**As a** developer,
**I want to** have a Temporal activity that executes a GraphWorkflowConfig against a single document/sample,
**So that** benchmark workflows can process each dataset sample through the actual workflow engine.

## Acceptance Criteria
- [ ] **Scenario 1**: Execute GraphWorkflowConfig as child workflow
    - **Given** a sample with input files and a GraphWorkflowConfig
    - **When** the `benchmark.executeWorkflow` activity is executed
    - **Then** the existing `graphWorkflow` is invoked as a child workflow on the `benchmark-processing` task queue with the sample's input files as workflow context

- [ ] **Scenario 2**: Collect and return workflow outputs
    - **Given** the child workflow completes successfully
    - **When** the activity finishes
    - **Then** the workflow output (GraphWorkflowResult) is captured and returned, including the final context and completed node list

- [ ] **Scenario 3**: Route to benchmark-processing queue
    - **Given** task queue isolation is configured
    - **When** the child workflow is started
    - **Then** it executes on the `benchmark-processing` task queue, not the production queue

- [ ] **Scenario 4**: Handle workflow execution failure
    - **Given** the child workflow fails during execution
    - **When** the activity detects the failure
    - **Then** the error is captured with details (error message, failed node ID if available) and returned as a failure result without crashing the parent benchmark workflow

- [ ] **Scenario 5**: Handle workflow execution timeout
    - **Given** the child workflow exceeds its configured timeout
    - **When** the timeout is reached
    - **Then** the child workflow is cancelled and a timeout error is returned

- [ ] **Scenario 6**: Persist workflow outputs to storage
    - **Given** the child workflow produces output files
    - **When** the activity completes
    - **Then** output files are written to a per-sample output directory, and the output file paths are returned for use by the evaluation activity

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/benchmark-execute.ts`
- Activity type: `benchmark.executeWorkflow`
- Invokes `graphWorkflow` as a child workflow -- this ensures benchmarks test the actual execution path (Section 13.1)
- The child workflow receives the same `GraphWorkflowInput` structure used in production
- Workflow config is loaded from the BenchmarkDefinition's referenced workflow (pinned by workflowConfigHash)
- See Requirements Section 4.2 (Run Orchestration), Section 13.1 (How Benchmarking Fits the DAG Workflow Engine), Section 11.4
- Tests: `apps/temporal/src/activities/benchmark-execute.test.ts`
