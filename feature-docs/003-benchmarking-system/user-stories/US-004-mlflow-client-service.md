# US-004: MLflow Client Service

**As a** developer,
**I want to** have a service that wraps the MLflow REST API,
**So that** the benchmarking system can create experiments, log runs with params/metrics/artifacts, and query experiment data programmatically.

## Acceptance Criteria
- [ ] **Scenario 1**: Create MLflow experiment
    - **Given** a benchmark project is being created
    - **When** `createExperiment(name)` is called
    - **Then** an MLflow experiment is created via the REST API and the experiment ID is returned

- [ ] **Scenario 2**: Create MLflow run
    - **Given** an MLflow experiment exists
    - **When** `createRun(experimentId, runName)` is called
    - **Then** a new MLflow run is created within the experiment and the run ID is returned

- [ ] **Scenario 3**: Log parameters to a run
    - **Given** an active MLflow run exists
    - **When** `logParams(runId, params)` is called with the required parameters from Section 6.3 (`dataset_version_id`, `dataset_git_revision`, `workflow_config_hash`, `evaluator_type`, `evaluator_config_hash`)
    - **Then** all parameters are logged to the MLflow run

- [ ] **Scenario 4**: Log metrics to a run
    - **Given** an active MLflow run exists
    - **When** `logMetrics(runId, metrics)` is called with a record of metric name-value pairs
    - **Then** all metrics are logged to the MLflow run with proper numeric values

- [ ] **Scenario 5**: Set tags on a run
    - **Given** an active MLflow run exists
    - **When** `setTags(runId, tags)` is called with the required tags from Section 6.3 (`worker_image_digest`, `worker_git_sha`, `benchmark_run_id`, `benchmark_definition_id`, `benchmark_project_id`)
    - **Then** all tags are set on the MLflow run

- [ ] **Scenario 6**: Log artifacts to a run
    - **Given** an active MLflow run exists and artifact files are available
    - **When** `logArtifact(runId, artifactPath, content)` is called
    - **Then** the artifact is uploaded to the MLflow artifact store (MinIO) associated with the run

- [ ] **Scenario 7**: Update run status
    - **Given** an active MLflow run exists
    - **When** `updateRunStatus(runId, status)` is called with FINISHED, FAILED, or KILLED
    - **Then** the MLflow run status is updated accordingly

- [ ] **Scenario 8**: Query runs for an experiment
    - **Given** an MLflow experiment with multiple runs
    - **When** `queryRuns(experimentId, filter?)` is called
    - **Then** a list of runs with their params, metrics, and tags is returned

- [ ] **Scenario 9**: Configuration via environment variables
    - **Given** the MLflow server URL may vary between environments
    - **When** the service is initialized
    - **Then** the MLflow tracking URI is configurable via `MLFLOW_TRACKING_URI` environment variable

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/benchmark/mlflow-client.service.ts`
- Uses HTTP client (e.g., `axios` or `fetch`) to call the MLflow REST API (2.0)
- MLflow REST API endpoints: `/api/2.0/mlflow/experiments/create`, `/api/2.0/mlflow/runs/create`, `/api/2.0/mlflow/runs/log-parameter`, `/api/2.0/mlflow/runs/log-metric`, `/api/2.0/mlflow/runs/set-tag`, `/api/2.0/mlflow/runs/update`
- Artifact logging may use the MLflow artifact API or direct MinIO upload depending on MLflow configuration
- See Requirements Section 6 (Experiment Tracking) and Section 6.3 (Required Run Metadata)
- Tests: `apps/backend-services/src/benchmark/mlflow-client.service.spec.ts`
