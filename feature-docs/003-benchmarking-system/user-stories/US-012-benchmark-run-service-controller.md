# US-012: Benchmark Run Service & Controller

**As a** user,
**I want to** start, cancel, re-run, and query benchmark runs,
**So that** I can execute benchmark experiments and track their progress and results.

## Acceptance Criteria
- [ ] **Scenario 1**: Start a benchmark run
    - **Given** a benchmark definition exists
    - **When** `POST /api/benchmark/projects/:id/definitions/:defId/runs` is called
    - **Then** a BenchmarkRun record is created with status `pending`, the `benchmarkRunWorkflow` Temporal workflow is started on the `benchmark-processing` queue via BenchmarkTemporalService, the `temporalWorkflowId` and `mlflowRunId` are stored on the run record, the definition is marked `immutable=true`, and the run record is returned

- [ ] **Scenario 2**: Cancel a running benchmark
    - **Given** a BenchmarkRun exists with status `running`
    - **When** `POST /api/benchmark/projects/:id/runs/:runId/cancel` is called
    - **Then** the Temporal workflow is signalled for cancellation, the run status is updated to `cancelled`, and the cancellation is confirmed in the response

- [ ] **Scenario 3**: Cancel a non-running benchmark returns error
    - **Given** a BenchmarkRun exists with status `completed`
    - **When** `POST /api/benchmark/projects/:id/runs/:runId/cancel` is called
    - **Then** a 400 response is returned indicating the run cannot be cancelled in its current state

- [ ] **Scenario 4**: Get run details with metrics
    - **Given** a completed BenchmarkRun exists
    - **When** `GET /api/benchmark/projects/:id/runs/:runId` is called
    - **Then** full run details are returned including status, mlflowRunId, temporalWorkflowId, workerGitSha, startedAt, completedAt, aggregated metrics, params, tags, and error (if any)

- [ ] **Scenario 5**: List runs for a project
    - **Given** a project with multiple benchmark runs
    - **When** `GET /api/benchmark/projects/:id/runs` is called
    - **Then** a list of runs is returned with status, definition name, start time, duration, headline metrics (if completed), and links

- [ ] **Scenario 6**: Re-run a benchmark
    - **Given** a completed BenchmarkRun exists
    - **When** a re-run is triggered from the same definition
    - **Then** a new BenchmarkRun record is created linked to the same BenchmarkDefinition, with identical runtime settings, and a new Temporal workflow is started

- [ ] **Scenario 7**: Get drill-down summary
    - **Given** a completed BenchmarkRun exists with per-sample results
    - **When** `GET /api/benchmark/projects/:id/runs/:runId/drill-down` is called
    - **Then** a detailed summary is returned including aggregated metrics, top-N worst-performing samples, per-field error breakdown (if schema-aware evaluator), and error clustering tags

- [ ] **Scenario 8**: Run not found returns 404
    - **Given** no run exists with the provided runId
    - **When** `GET /api/benchmark/projects/:id/runs/:runId` is called
    - **Then** a 404 response is returned

- [ ] **Scenario 9**: Audit log entries are created
    - **Given** a benchmark run is started or completed
    - **When** the run transitions to `running` or `completed`/`failed` status
    - **Then** BenchmarkAuditLog entries are recorded with actions `run_started` and `run_completed` respectively

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extends: `apps/backend-services/src/benchmark/benchmark.service.ts`, `apps/backend-services/src/benchmark/benchmark.controller.ts`
- Depends on BenchmarkTemporalService for starting/cancelling Temporal workflows
- Depends on MlflowClientService for creating MLflow runs
- Run status updates can come from Temporal workflow callbacks or polling
- See Requirements Section 2.6 (BenchmarkRun model), Section 4.2 (Run Orchestration), Section 4.5 (Re-run), Section 11.2
- Tests: extend `apps/backend-services/src/benchmark/benchmark.service.spec.ts`
