# Page: Run Detail
**URL Pattern**: `/benchmarking/projects/:projectId/runs/:runId`
**Purpose**: View detailed information about a specific benchmark run, including metrics, artifacts, and drill-down analysis

## Key Elements

### Header Section
- **Run Definition Name**: `[data-testid="run-definition-name"]` - Title showing definition name
- **Baseline Badge**: `[data-testid="baseline-badge"]` - Prominent yellow badge with trophy icon showing "BASELINE" (conditional: only for baseline runs)
- **Run ID Text**: `[data-testid="run-id-text"]` - Displays the unique run identifier
- **Cancel Button**: `[data-testid="cancel-run-btn"]` - Cancels running/pending run (conditional)
- **Promote Baseline Button**: `[data-testid="promote-baseline-btn"]` - Opens threshold configuration dialog (conditional: only for non-baseline runs)
  - Always visible for non-baseline runs but disabled for non-completed runs
  - Tooltip appears on disabled button explaining: "Only completed runs can be promoted to baseline. Current status: {status}"
  - `[data-testid="promote-baseline-tooltip"]` - Tooltip wrapper
- **Edit Thresholds Button**: `[data-testid="edit-thresholds-btn"]` - Opens threshold editing dialog (conditional: only for baseline runs with existing thresholds)
- **Re-run Button**: `[data-testid="rerun-btn"]` - Creates new run with same definition (conditional on completed/failed)
- **View Regression Report Button**: `[data-testid="view-regression-report-btn"]` - Opens detailed regression analysis (conditional)

### Alerts & Notifications
- **Error Alert**: `[data-testid="run-error-alert"]` - Shows run error message if failed (conditional)
- **Baseline Comparison Alert**: `[data-testid="baseline-comparison-alert"]` - Shows pass/fail status with regressed metrics (conditional)

### Run Information Card
- **Section Heading**: `[data-testid="run-info-heading"]` - "Run Information" title
- **Info Table**: `[data-testid="run-info-table"]` - Table showing run metadata

#### Run Information Fields
- Status (badge with color coding)
- Started At (timestamp)
- Completed At (timestamp)
- Duration (formatted time)
- MLflow Run (link or code)
- Temporal Workflow (external link)
- Worker Git SHA (code)
- Worker Image Digest (code, optional)
- Is Baseline (Yes/No badge)

### Baseline Comparison Card (Conditional: completed + baseline)
- **Section Heading**: `[data-testid="baseline-comparison-heading"]` - "Baseline Comparison" title
- **Comparison Table**: `[data-testid="baseline-comparison-table"]` - Detailed metric comparisons

#### Comparison Table Columns
- Metric name
- Current value (4 decimal places)
- Baseline value (4 decimal places)
- Delta (colored: green positive, red negative)
- Delta % (colored: green positive, red negative)
- Status (PASS/FAIL badge)

### Aggregated Metrics Card (Conditional: completed + metrics)
- **Section Heading**: `[data-testid="aggregated-metrics-heading"]` - "Aggregated Metrics" title
- **Metrics Table**: `[data-testid="aggregated-metrics-table"]` - Key-value pairs of all metrics

### Run Parameters & Tags Card (Conditional: completed + params/tags)
- **Section Heading**: `[data-testid="params-tags-heading"]` - "Run Parameters & Tags" title
- **Parameters Table**: `[data-testid="params-table"]` - Key-value pairs of parameters (if any)
- **Tags Table**: `[data-testid="tags-table"]` - Key-value pairs of tags (if any)

### Artifacts Card (Conditional: completed + artifacts)
- **Section Heading**: `[data-testid="artifacts-heading"]` - Shows total count and filter status
- **Type Filter**: `[data-testid="artifact-type-filter"]` - Dropdown to filter by artifact type
- **Artifacts Table**: `[data-testid="artifacts-table"]` - List of all artifacts
- **Artifact Row**: `[data-testid="artifact-row-{artifactId}"]` - Clickable row for each artifact

#### Artifacts Table Columns
- Type (badge)
- Sample ID (code or "-")
- Node ID (code or "-")
- Size (formatted bytes: B/KB/MB)
- MIME Type (code)

### Drill-Down Summary Card (Conditional: completed + drillDown)
- **Section Heading**: `[data-testid="drill-down-heading"]` - "Drill-Down Summary" title
- **View All Samples Button**: `[data-testid="view-all-samples-btn"]` - Navigates to full drill-down page
- **Worst Samples Table**: `[data-testid="worst-samples-table"]` - Top worst-performing samples (conditional)
- **Field Error Breakdown Table**: `[data-testid="field-error-breakdown-table"]` - Per-field error rates (conditional)
- **Error Clusters Table**: `[data-testid="error-clusters-table"]` - Error cluster tags with counts (conditional)

#### Worst Samples Columns
- Sample ID (code)
- Metric name
- Metric value (4 decimal places)
- Metadata (JSON or "-")

#### Field Error Breakdown Columns
- Field Name (code)
- Error Count (number)
- Error Rate (percentage, 2 decimal places)

#### Error Clusters Display
- Tag name (row label)
- Count (badge)

## State Behaviors

### Loading States
- **Initial Load**: Center-aligned spinner (h=400) while fetching run data
- **Run Not Found**: Shows "Run not found" message for invalid run ID
- **Button Loading**: Action buttons show loading state during operations (cancel, promote, re-run)

### Conditional Rendering
- **Action Buttons**: Visibility based on run status
  - Cancel: Only for running/pending runs
  - Promote to Baseline: Only for completed non-baseline runs
  - Edit Thresholds: Only for baseline runs with existing thresholds
  - Re-run: Only for completed/failed runs
  - View Regression Report: Only when baselineComparison exists

- **Cards**: Show only when relevant data exists
  - Error Alert: Only when run.error is present
  - Baseline Comparison Alert & Card: Only when run.baselineComparison exists
  - Aggregated Metrics: Only for completed runs with metrics
  - Parameters & Tags: Only for completed runs with params or tags
  - Artifacts: Only for completed runs with artifacts
  - Drill-Down Summary: Only for completed runs with drill-down data

### Polling Behavior
- **Auto-refresh**: Page polls API for non-terminal states (pending, running)
- **Real-time Updates**: Duration and status update automatically while running

### Interactive States
- **Artifact Rows**: Clickable, opens ArtifactViewer modal
- **External Links**: MLflow and Temporal links open in new tab
- **Artifact Filter**: Dropdown filters artifact list, updates count in heading

## Navigation Flows

### Incoming
- **From Project Detail**: Click run row → Navigate to this page
- **From Drill-Down Page**: Back navigation

### Outgoing
- **To Regression Report**: Click "View Regression Report" → `/benchmarking/projects/:projectId/runs/:runId/regression`
- **To Drill-Down Page**: Click "View All Samples" → `/benchmarking/projects/:projectId/runs/:runId/drill-down`
- **To Re-run**: Click "Re-run" → Creates new run, navigates to new run detail page
- **External Links**:
  - MLflow: `http://localhost:5000/#/experiments/{experimentId}/runs/{mlflowRunId}`
  - Temporal: `http://localhost:8088/namespaces/default/workflows/{workflowId}`

### Modal Navigation
- Click artifact row → Opens ArtifactViewer modal (no URL change)

## API Integration
- **GET /api/benchmark/projects/:projectId/runs/:runId** - Fetch run details (polling enabled)
- **GET /api/benchmark/projects/:projectId** - Fetch project info
- **GET /api/benchmark/projects/:projectId/runs/:runId/drill-down** - Fetch drill-down summary
- **GET /api/benchmark/projects/:projectId/runs/:runId/artifacts** - List artifacts (with optional type filter)
- **POST /api/benchmark/projects/:projectId/runs/:runId/cancel** - Cancel run
- **POST /api/benchmark/projects/:projectId/runs/:runId/baseline** - Promote to baseline
- **POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs** - Create new run (re-run)

## Notes
- Page uses polling for real-time updates during active runs
- Baseline comparison only shows for runs that were compared against a baseline
- Artifacts are loaded separately with optional type filtering
- Drill-down summary shows preview data with link to full analysis page
- All numeric values use consistent formatting (4 decimals for metrics, 2 for percentages)
- Status badge colors: pending=blue, running=yellow, completed=green, failed=red, cancelled=gray
- External links open in new tabs with noopener noreferrer security
