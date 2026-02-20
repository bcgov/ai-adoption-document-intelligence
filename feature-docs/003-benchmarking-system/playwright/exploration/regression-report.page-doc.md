# Page: Regression Report
**URL Pattern**: /benchmarking/projects/:id/runs/:runId/regression
**Purpose**: Display detailed regression analysis comparing a run's metrics against baseline thresholds

## Key Elements

### Page Header
- **Page Title**: `heading[level=2]` - "Regression Report"
- **Definition Name**: `paragraph` - Shows the definition name (e.g., "Baseline OCR Model")

### Action Buttons
- **Export JSON Button**: `[data-testid="export-json-btn"]` - Downloads regression report as JSON file
- **Export HTML Button**: `[data-testid="export-html-btn"]` - Downloads regression report as HTML file
- **Back to Run Button**: `[data-testid="back-to-run-btn"]` - Navigates back to run detail page

### Regression Alert
- **Alert Container**: `[data-testid="regression-alert"]` - Shows overall pass/fail status
  - **Green Alert** (All Passed): Shows "✓ All Metrics Passed" title with success message
  - **Red Alert** (Regression Detected): Shows "⚠ Regression Detected" with count of regressed metrics
- **Regressed Metric Badges**: `[data-testid="regressed-metric-badge"]` - Red badges showing names of regressed metrics (only visible when regressions exist)

### Run Information Card
- **Run Information Table**: `[data-testid="run-info-table"]`
  - **Run ID Row**: Displays current run ID in `<code>` element
  - **Baseline Run ID Row**: Displays baseline run ID in `<code>` element
  - **Completed At Row**: Shows completion timestamp
  - **MLflow Run Row**: Contains link to MLflow UI
- **MLflow Link**: `[data-testid="mlflow-link"]` - Button/link opening MLflow run in new tab (only shown if MLflow experiment exists)

### Metric-by-Metric Analysis Card
- **Metric Comparison Table**: `[data-testid="metric-comparison-table"]`
  - **Table Headers**: Metric, Current, Baseline, Delta, Delta %, Threshold, Severity, Status
  - **Metric Rows**: `[data-testid="metric-row"]` - One row per metric with:
    - Metric name (bold text)
    - Current value (in `<code>`)
    - Baseline value (in `<code>`)
    - Delta (in `<code>`, colored: green for positive, red for negative)
    - Delta % (in `<code>`, colored: green for positive, red for negative)
    - Threshold info (type and value)
    - Severity badge (Critical/Warning - only shown for failed metrics)
    - Status badge (PASS in green or FAIL in red)

### Historical Trend Section
- **Historical Trend Card**: `[data-testid="historical-trend-section"]`
  - **Title**: "Historical Trend"
  - **Placeholder Alert**: Blue alert explaining that Recharts library is needed for trend visualization
  - **Note**: This section is currently a placeholder and does not show actual trend charts

## State Behaviors

### Loading State
- Shows centered loader spinner while fetching run data
- Loading message: "Loading…"

### No Run Found
- Shows centered message: "Run not found"
- Displayed when run ID doesn't exist

### No Baseline Comparison
- Shows centered message: "No baseline comparison data available for this run"
- Includes "Back to Run Details" button to navigate away
- Displayed when run has no baseline comparison data (no baseline set)

### Regression Detected (Red Alert)
- Red alert with warning icon
- Shows count of regressed metrics (e.g., "3 metrics have regressed")
- Displays badges for each regressed metric
- Metric rows show FAIL status with red badges
- Severity badges (Critical/Warning) based on regression magnitude:
  - **Critical** (red): >10% regression or >2x threshold
  - **Warning** (orange): Between threshold and 10% regression

### All Metrics Passed (Green Alert)
- Green alert with checkmark icon
- Message: "All metrics meet or exceed the baseline thresholds"
- All metric rows show PASS status with green badges
- No severity badges shown

### Export Functionality
- **Export JSON**: Downloads a JSON file named `regression-report-{runId}-{timestamp}.json` containing:
  - Run metadata (ID, definition name, status, timestamps)
  - Full baseline comparison data
  - Generated timestamp
- **Export HTML**: Downloads a self-contained HTML file named `regression-report-{runId}-{timestamp}.html` containing:
  - Styled report with all run information
  - Metric comparison table
  - Summary section
  - Generated timestamp

## Navigation Flows
- **From**: Run detail page → Click "Regression Report" link/button
- **To Run Detail**: Click "Back to Run" button → `/benchmarking/projects/:id/runs/:runId`
- **To MLflow**: Click "View in MLflow" → Opens MLflow UI in new tab

## Data Requirements
- Completed run with baseline comparison data
- Baseline run must be configured for the definition
- Run must have metrics that were compared against baseline thresholds

## Edge Cases
- **No baseline set**: Shows message prompting user to set a baseline
- **No regressions**: Shows green alert with success message, all metrics show PASS
- **MLflow not configured**: MLflow link row is hidden
- **Historical trend**: Currently shows placeholder requiring Recharts installation
