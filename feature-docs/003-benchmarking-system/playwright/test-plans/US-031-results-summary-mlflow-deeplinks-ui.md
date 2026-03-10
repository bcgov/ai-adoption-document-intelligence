# Test Plan: US-031 - Results Summary & MLflow Deep-Links UI

**Source**: `user-stories/US-031-results-summary-mlflow-deeplinks-ui.md`
**Requirement Section**: Section 10.1 (Phase 1 -- Results UI), Section 6.5 (Linkage)
**Priority**: High

## User Story
**As a** user,
**I want to** view benchmark run results with aggregated metrics and deep-link to MLflow for detailed inspection,
**So that** I can assess benchmark quality and drill down into detailed metrics and artifacts.

## Acceptance Criteria
- Run detail page shows aggregated metrics
- Run parameters and tags displayed
- Deep-link to MLflow UI
- Artifact list with type filtering
- Drill-down summary
- Top-N worst-performing samples list
- Run duration and timing

## Test Scenarios

### Scenario 1: Aggregated Metrics Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run with aggregated metrics
**When**: User views the run detail page
**Then**:
- Metrics table is displayed showing: metric name, value, statistical details (mean, std, percentiles if available)
- All metrics from `BenchmarkRun.metrics` are shown
- Metrics include: mean F1, precision, recall, per-field scores
- Values are formatted appropriately (percentages, decimals)
- Table is sortable by metric name or value

**Affected Pages**: Run detail page
**Data Requirements**: Completed run with rich metrics
**Prerequisites**: User logged in, run completed

### Scenario 2: Run Parameters Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run with parameters logged to MLflow
**When**: User views the run detail page
**Then**:
- Parameters section shows:
  - `dataset_version_id`
  - `dataset_git_revision`
  - `workflow_config_hash`
  - `evaluator_type`
  - `evaluator_config_hash`
- Parameters are displayed as key-value pairs
- Values are formatted and readable
- Section is clearly labeled "Run Parameters"

**Affected Pages**: Run detail page
**Data Requirements**: Run with complete parameters
**Prerequisites**: User logged in

### Scenario 3: Run Tags Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run with tags logged to MLflow
**When**: User views the run detail page
**Then**:
- Tags section shows:
  - `worker_image_digest`
  - `worker_git_sha`
  - `benchmark_run_id`
  - `benchmark_definition_id`
  - `benchmark_project_id`
- Tags are displayed as key-value pairs or badges
- Git SHA is truncated with hover for full value
- Section is clearly labeled "Run Tags"

**Affected Pages**: Run detail page
**Data Requirements**: Run with complete tags
**Prerequisites**: User logged in

### Scenario 4: Deep-Link to MLflow UI
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run has `mlflowRunId` and `mlflowExperimentId`
**When**: User clicks "View in MLflow" link/button
**Then**:
- Link opens in new tab
- URL format: `http://localhost:5000/#/experiments/{mlflowExperimentId}/runs/{mlflowRunId}`
- MLflow UI loads showing the specific run
- Link is prominently displayed and clearly labeled

**Affected Pages**: Run detail page
**Data Requirements**: Run with MLflow IDs
**Prerequisites**: User logged in, MLflow UI accessible

### Scenario 5: Artifact List Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run has artifacts of different types
**When**: User views the artifacts section on run detail page
**Then**:
- Artifact table shows columns: type, sample ID, node ID, size, mime type, actions
- All artifacts from the run are listed
- File sizes are human-readable (KB, MB, GB)
- Action buttons: View, Download, Open in MLflow

**Affected Pages**: Run detail page
**Data Requirements**: Run with 5+ artifacts of different types
**Prerequisites**: User logged in

### Scenario 6: Artifact Type Filtering
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Run has artifacts of multiple types (per_doc_output, diff_report, evaluation_report, error_log)
**When**: User selects a type filter from the dropdown
**Then**:
- Artifact list updates to show only selected type
- Filter options include: All, per_doc_output, intermediate_node_output, diff_report, evaluation_report, error_log
- Artifact count updates to reflect filtered results
- Filter persists during page interactions

**Affected Pages**: Run detail page
**Data Requirements**: Run with diverse artifact types
**Prerequisites**: User logged in

### Scenario 7: Drill-Down Summary Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run
**When**: User views the drill-down section on run detail page
**Then**:
- Drill-down data from `GET /api/benchmark/projects/{id}/runs/{runId}/drill-down` is displayed
- Sections include:
  - Top-N worst-performing samples
  - Per-field error breakdown
  - Error cluster tags
- All sections are clearly labeled and organized

**Affected Pages**: Run detail page
**Data Requirements**: Run with drill-down data
**Prerequisites**: User logged in

### Scenario 8: Top-N Worst Samples List
- **Type**: Happy Path
- **Priority**: High

**Given**: Drill-down summary contains worst-performing samples
**When**: Worst samples section is rendered
**Then**:
- Table shows: sample ID, metric scores (F1, precision, recall), error diagnostics
- Samples are ordered by performance (worst first)
- Configurable N value (e.g., top 10 or 20)
- Each sample row links to detailed sample view (optional)
- Metrics are color-coded (red for poor performance)

**Affected Pages**: Run detail page
**Data Requirements**: Run with per-sample results
**Prerequisites**: User logged in

### Scenario 9: Per-Field Error Breakdown
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Drill-down summary contains per-field error analysis (for schema-aware evaluation)
**When**: Per-field section is rendered
**Then**:
- Table shows: field name, total samples, correct, incorrect, precision, recall, F1
- Fields with high error rates are highlighted
- User can sort by error rate
- Visualization (bar chart) shows error distribution (optional)

**Affected Pages**: Run detail page
**Data Requirements**: Schema-aware evaluation results
**Prerequisites**: User logged in

### Scenario 10: Error Cluster Tags
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Drill-down summary contains error clustering analysis
**When**: Error clusters section is rendered
**Then**:
- Tags/badges show common error patterns
- Each tag shows count of affected samples
- Tags are clickable to filter samples by error type (optional)
- Examples: "missing_field", "format_mismatch", "ocr_quality_low"

**Affected Pages**: Run detail page
**Data Requirements**: Run with error clustering data
**Prerequisites**: User logged in

### Scenario 11: Run Duration Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed run with `startedAt` and `completedAt` timestamps
**When**: Run detail page is rendered
**Then**:
- Total duration is prominently displayed
- Format: human-readable (e.g., "2m 34s", "1h 15m 42s")
- Start time and end time are also shown
- Duration is calculated accurately

**Affected Pages**: Run detail page
**Data Requirements**: Completed run with timestamps
**Prerequisites**: User logged in

### Scenario 12: Failed Run Error Display
- **Type**: Error Case
- **Priority**: High

**Given**: Benchmark run with status `failed` and error message
**When**: User views the run detail page
**Then**:
- Error section is prominently displayed
- Full error message is shown (with expand/collapse for long errors)
- Error type/category is indicated
- Stack trace is available (if logged)
- No metrics or drill-down data is shown (or marked as incomplete)

**Affected Pages**: Run detail page
**Data Requirements**: Failed run with error message
**Prerequisites**: User logged in

### Scenario 13: Incomplete Run Handling
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Run is in `running` or `pending` status
**When**: User views the run detail page
**Then**:
- Metrics section shows "In progress..." or empty state
- Artifacts section shows partial results (if any)
- Drill-down section is hidden or shows "Not available until run completes"
- Page indicates run is not complete

**Affected Pages**: Run detail page
**Data Requirements**: Running/pending run
**Prerequisites**: User logged in

### Scenario 14: Download Artifact
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing the artifact list
**When**: User clicks "Download" on an artifact
**Then**:
- File download initiates
- File is saved with correct name and extension
- Download progress is shown (for large files)
- No errors occur during download

**Affected Pages**: Run detail page
**Data Requirements**: Run with downloadable artifacts
**Prerequisites**: User logged in, artifact storage accessible

### Scenario 15: Empty Artifact List
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Run completed with artifact policy "failures_only" and no failures
**When**: User views the artifacts section
**Then**:
- Empty state message: "No artifacts stored for this run"
- Artifact policy is indicated: "Policy: failures_only"
- User understands why no artifacts are present

**Affected Pages**: Run detail page
**Data Requirements**: Run with no artifacts
**Prerequisites**: User logged in

### Scenario 16: Large Metrics Set Handling
- **Type**: Edge Case
- **Priority**: Low

**Given**: Run has 50+ different metrics (e.g., per-field metrics for many fields)
**When**: Metrics section is rendered
**Then**:
- Metrics are organized into categories or collapsible sections
- User can search/filter metrics
- Page remains performant
- Not all metrics are expanded by default

**Affected Pages**: Run detail page
**Data Requirements**: Run with extensive metrics
**Prerequisites**: User logged in

### Scenario 17: MLflow Link When MLflow Down
- **Type**: Error Case
- **Priority**: Medium

**Given**: MLflow service is unavailable
**When**: User clicks "View in MLflow" link
**Then**:
- New tab opens but shows MLflow connection error
- User sees clear error: "MLflow UI is currently unavailable"
- User can close tab and continue using the app
- In-app data remains accessible

**Affected Pages**: Run detail page, MLflow UI
**Data Requirements**: MLflow service stopped
**Prerequisites**: User logged in, MLflow inaccessible

## Coverage Analysis
- ✅ Happy path covered (metrics, parameters, tags, artifacts, drill-down)
- ✅ Edge cases covered (incomplete runs, empty artifacts, large datasets)
- ✅ Error handling covered (failed runs, MLflow unavailable)
- ✅ Deep-linking covered (MLflow UI, Temporal UI)
- ⚠️ Missing: Performance with very large artifact lists (1000+)
- ⚠️ Missing: Concurrent access to same run by multiple users
