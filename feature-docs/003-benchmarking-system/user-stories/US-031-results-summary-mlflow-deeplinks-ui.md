# US-031: Results Summary & MLflow Deep-Links UI

**As a** user,
**I want to** view benchmark run results with aggregated metrics and deep-link to MLflow for detailed inspection,
**So that** I can assess benchmark quality and drill down into detailed metrics and artifacts.

## Acceptance Criteria
- [ ] **Scenario 1**: Run detail page shows aggregated metrics
    - **Given** a completed benchmark run with metrics
    - **When** the user views the run detail page
    - **Then** a metrics table is displayed showing all aggregated metrics (mean F1, precision, recall, per-field scores, etc.) with metric name, value, and statistical details

- [ ] **Scenario 2**: Run parameters and tags displayed
    - **Given** a completed benchmark run
    - **When** the user views the run detail page
    - **Then** the run parameters (dataset version, workflow config hash, evaluator type) and tags (worker git SHA, worker image digest) are displayed in organized sections

- [ ] **Scenario 3**: Deep-link to MLflow UI
    - **Given** a benchmark run with an `mlflowRunId`
    - **When** the user clicks the "View in MLflow" link
    - **Then** the MLflow UI opens (port 5000) at the specific run page for detailed metric/artifact inspection

- [ ] **Scenario 4**: Artifact list with type filtering
    - **Given** a benchmark run with artifacts of different types
    - **When** the user views the artifacts section on the run detail page
    - **Then** artifacts are listed with type, sample ID, node ID, size, and mime type, with a filter dropdown to show specific artifact types

- [ ] **Scenario 5**: Drill-down summary
    - **Given** a completed benchmark run
    - **When** the user views the drill-down section
    - **Then** the drill-down summary (from `GET /api/benchmark/projects/:id/runs/:runId/drill-down`) is displayed showing top-N worst-performing samples, per-field error breakdown, and error cluster tags

- [ ] **Scenario 6**: Top-N worst-performing samples list
    - **Given** the drill-down summary data
    - **When** the worst samples section is rendered
    - **Then** a table shows the N worst-performing samples with sample ID, metric scores, and error diagnostics

- [ ] **Scenario 7**: Run duration and timing
    - **Given** a completed benchmark run with startedAt and completedAt
    - **When** the run detail page is rendered
    - **Then** the total duration is displayed in human-readable format (e.g., "2m 34s")

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extends: `apps/frontend/src/pages/benchmarking/RunDetailPage.tsx`
- MLflow UI link format: `http://localhost:5000/#/experiments/{mlflowExperimentId}/runs/{mlflowRunId}`
- Drill-down data fetched from: `GET /api/benchmark/projects/:id/runs/:runId/drill-down`
- Artifact list from: `GET /api/benchmark/projects/:id/runs/:runId/artifacts`
- See Requirements Section 10.1 (Phase 1 -- Results UI), Section 6.5 (Linkage)
