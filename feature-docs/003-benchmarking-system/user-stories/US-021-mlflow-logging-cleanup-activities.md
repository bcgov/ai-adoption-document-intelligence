# US-021: MLflow Logging & Cleanup Activities

**As a** developer,
**I want to** have Temporal activities for logging benchmark results to MLflow and cleaning up temporary files,
**So that** all run metadata, metrics, and artifacts are tracked in MLflow and worker disk space is reclaimed.

## Acceptance Criteria
- [ ] **Scenario 1**: Log run parameters to MLflow
    - **Given** an active MLflow run exists for the benchmark
    - **When** the `benchmark.logToMlflow` activity is executed
    - **Then** all required parameters from Section 6.3 are logged: `dataset_version_id`, `dataset_git_revision`, `workflow_config_hash`, `evaluator_type`, `evaluator_config_hash`

- [ ] **Scenario 2**: Log aggregated metrics to MLflow
    - **Given** aggregated metrics have been computed
    - **When** the `benchmark.logToMlflow` activity is executed
    - **Then** all aggregated metrics (mean F1, precision, recall, per-field scores, etc.) are logged as MLflow metrics with proper numeric values

- [ ] **Scenario 3**: Set run tags on MLflow
    - **Given** an active MLflow run
    - **When** the `benchmark.logToMlflow` activity is executed
    - **Then** all required tags from Section 6.3 are set: `worker_image_digest`, `worker_git_sha`, `benchmark_run_id`, `benchmark_definition_id`, `benchmark_project_id`

- [ ] **Scenario 4**: Log artifacts to MLflow
    - **Given** evaluation artifacts need to be stored (per artifact policy)
    - **When** the `benchmark.logToMlflow` activity is executed
    - **Then** artifacts are uploaded to the MLflow artifact store (MinIO) associated with the run

- [ ] **Scenario 5**: Update MLflow run status
    - **Given** the benchmark workflow has completed (successfully or with failure)
    - **When** the `benchmark.logToMlflow` activity finishes
    - **Then** the MLflow run status is updated to FINISHED (on success) or FAILED (on failure)

- [ ] **Scenario 6**: Clean up materialized dataset files
    - **Given** a benchmark run has completed and materialized dataset files exist on the worker
    - **When** the `benchmark.cleanup` activity is executed
    - **Then** temporary materialized dataset files are removed from the worker filesystem (but cached datasets are preserved if caching is enabled)

- [ ] **Scenario 7**: Clean up per-run output files
    - **Given** temporary output files were generated during workflow execution
    - **When** the `benchmark.cleanup` activity is executed
    - **Then** all temporary per-run output files are removed from the worker filesystem

- [ ] **Scenario 8**: Cleanup is idempotent
    - **Given** cleanup has already been performed
    - **When** the `benchmark.cleanup` activity is re-executed (e.g., due to retry)
    - **Then** the activity completes successfully without error even if files are already deleted

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/benchmark-logging.ts`
- Activity types: `benchmark.logToMlflow` and `benchmark.cleanup`
- MLflow logging uses HTTP calls to the MLflow REST API (same approach as MlflowClientService but from the Temporal worker context)
- MLflow tracking URI configured via `MLFLOW_TRACKING_URI` environment variable on the worker
- Cleanup must distinguish between cached datasets (preserved) and per-run temporaries (deleted)
- See Requirements Section 6.3 (Required Run Metadata), Section 11.4 (Temporal Activities)
- Tests: `apps/temporal/src/activities/benchmark-logging.test.ts`
