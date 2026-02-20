# US-022: Benchmark Run Workflow Orchestrator

**As a** developer,
**I want to** have a Temporal workflow that orchestrates the full benchmark run lifecycle,
**So that** dataset materialization, per-document execution, evaluation, aggregation, and MLflow logging happen in a coordinated, fault-tolerant manner.

## Acceptance Criteria
- [ ] **Scenario 1**: Materialize dataset as first step
    - **Given** a benchmark run is started
    - **When** the `benchmarkRunWorkflow` begins execution
    - **Then** the `benchmark.materializeDataset` activity is invoked first with the dataset version's gitRevision and repository URL

- [ ] **Scenario 2**: Fan-out per document
    - **Given** the dataset is materialized and the manifest is loaded
    - **When** the workflow proceeds to execution
    - **Then** the workflow fans out across all samples in the split, invoking `benchmark.executeWorkflow` for each sample with configurable concurrency limits

- [ ] **Scenario 3**: Evaluate each sample after execution
    - **Given** a sample's workflow execution has completed
    - **When** the per-sample evaluation step runs
    - **Then** `benchmark.evaluate` is invoked with the prediction paths, ground truth paths, sample metadata, and evaluator config

- [ ] **Scenario 4**: Aggregate metrics after all evaluations
    - **Given** all samples have been evaluated
    - **When** the workflow proceeds to aggregation
    - **Then** `benchmark.aggregate` is invoked with all per-sample EvaluationResult objects, producing dataset-level metrics

- [ ] **Scenario 5**: Log results to MLflow
    - **Given** aggregation has completed
    - **When** the workflow proceeds to logging
    - **Then** `benchmark.logToMlflow` is invoked to log params, metrics, tags, and artifacts to MLflow

- [ ] **Scenario 6**: Update BenchmarkRun status in Postgres
    - **Given** the workflow completes (successfully or with failure)
    - **When** the final step executes
    - **Then** the BenchmarkRun record in Postgres is updated with final status (`completed` or `failed`), aggregated metrics, completedAt timestamp, and error message (if failed)

- [ ] **Scenario 7**: Cleanup temporary files
    - **Given** the workflow has completed all processing
    - **When** the cleanup step runs
    - **Then** `benchmark.cleanup` is invoked to remove temporary files from the worker

- [ ] **Scenario 8**: Support cancellation at any point
    - **Given** the workflow is running
    - **When** a cancellation signal is received
    - **Then** the workflow cancels any in-progress child workflows and activities, runs cleanup, updates the BenchmarkRun status to `cancelled`, and terminates gracefully

- [ ] **Scenario 9**: Workflow is deterministic
    - **Given** the benchmark workflow code
    - **When** it is replayed by Temporal
    - **Then** the workflow produces the same sequence of activity invocations without non-determinism errors (all side effects are in activities)

- [ ] **Scenario 10**: Partial failures do not block completion
    - **Given** some samples fail during workflow execution
    - **When** the fan-out continues
    - **Then** failed samples are recorded with error status, successful samples are still evaluated, and the final metrics reflect the partial success

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/benchmark-workflow.ts`
- Workflow type: `benchmarkRunWorkflow`
- Follows the orchestration steps from Section 4.2: materialize -> fan-out -> evaluate -> aggregate -> log -> update -> cleanup
- Uses `workflow.executeChild` to invoke `graphWorkflow` as child workflows
- Per-run concurrency controlled via `runtimeSettings.maxParallelDocuments`
- The workflow receives inputs including: definitionId, datasetVersionId, gitRevision, splitId, workflowId, workflowConfigHash, evaluatorType, evaluatorConfig, runtimeSettings, artifactPolicy
- See Requirements Section 4.2 (Run Orchestration), Section 4.4 (Determinism Safety), Section 13.1
- Tests: `apps/temporal/src/benchmark-workflow.test.ts`
