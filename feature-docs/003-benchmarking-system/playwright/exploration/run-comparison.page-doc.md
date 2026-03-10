# Page: Run Comparison
**URL Pattern**: `/benchmarking/projects/{projectId}/compare?runs=runId1,runId2,...`
**Purpose**: Side-by-side comparison of two or more benchmark runs showing metrics, parameters, and tags differences

## Key Elements

### Header Section
- **Page Title**: `[data-testid="comparison-title"]` - "Run Comparison" heading
- **Run Count**: Text showing "Comparing X runs"
- **Export CSV Button**: `[data-testid="export-csv-btn"]` - Downloads comparison data as CSV
- **Export JSON Button**: `[data-testid="export-json-btn"]` - Downloads comparison data as JSON
- **Back to Project Button**: `[data-testid="back-to-project-btn"]` - Returns to project detail page

### Run Information Section
- **Card Container**: `[data-testid="run-info-card"]`
- **Information Table**: `[data-testid="run-info-table"]`
  - Shows: Status (with colored badges), Definition name, Started At timestamp
  - Columns: Property | Run 1 | Run 2 | ... (one column per run)
  - **Run Column Headers**: Clickable links to run detail page (opens in new tab)
  - **Baseline Badge**: Cyan "Baseline" badge shown on baseline run columns

### Metrics Comparison Section
- **Card Container**: `[data-testid="metrics-comparison-card"]`
- **Metrics Table**: `[data-testid="metrics-comparison-table"]`
  - Columns: Metric Name | Baseline | Run 2 | Delta | Delta %
  - **Delta Highlighting**: Green for positive changes, red for negative changes
  - Baseline is always the first run in the comparison
  - All metrics from all runs are merged and displayed
  - Missing metrics show "-" placeholder

### Parameters Comparison Section
- **Card Container**: `[data-testid="parameters-comparison-card"]`
- **Parameters Table**: `[data-testid="parameters-comparison-table"]`
  - Columns: Parameter | Run 1 | Run 2 | ...
  - **"Changed" Badge**: Orange badge shown next to parameter names that differ across runs
  - Values displayed as JSON strings in code blocks

### Tags Comparison Section
- **Card Container**: `[data-testid="tags-comparison-card"]`
- **Tags Table**: `[data-testid="tags-comparison-table"]`
  - Columns: Tag | Run 1 | Run 2 | ...
  - **"Changed" Badge**: Orange badge shown next to tag names that differ across runs
  - Values displayed as JSON strings in code blocks

## State Behaviors

### Loading State
- **Initial Load**: Centered loader with "Loader size=lg" while fetching run data
- All run queries must complete before rendering comparison
- No skeleton or partial rendering

### Empty States
1. **No Runs Selected**:
   - Message: "No runs selected for comparison"
   - Shows "Back to Project" button
   - Centered layout
2. **No Runs Found**:
   - Message: "No runs found"
   - Shows "Back to Project" button
   - Centered layout

### Visual Indicators
- **Status Badges**: Color-coded (green=completed, yellow=running, red=failed, blue=pending, gray=cancelled)
- **Delta Highlighting**:
  - Green text for positive deltas (improvements)
  - Red text for negative deltas (regressions)
  - No color for zero delta
- **Changed Badges**: Orange badge for parameters/tags that differ across runs

## Export Functionality

### CSV Export
- Filename: `benchmark-comparison-{timestamp}.csv`
- Structure: Metric name, run values, delta, delta %
- Downloads automatically via blob URL

### JSON Export
- Filename: `benchmark-comparison-{timestamp}.json`
- Structure: Full comparison data object with runs, metrics, params, tags
- Pretty-printed with 2-space indentation
- Downloads automatically via blob URL

## Navigation Flows
- **From**: Project detail page → Click "Compare" button (when implemented) or direct URL navigation
- **To**: Project detail page → Click "Back to Project" button
- **URL Sharing**: URL is shareable with run IDs in query params

## Data Requirements
- Minimum 2 runs for meaningful comparison
- Runs can be in any status (completed, running, failed, etc.)
- Metrics/params/tags are merged across all runs
- Baseline is always the first run in the URL query string

## Missing Features (Per Test Plan US-036)

### Not Yet Implemented:
1. **Metric Filtering**: No search/filter for metrics
2. **Show Only Changed Metrics Toggle**: No option to hide identical metrics
3. **Chart View**: No visual comparison charts
4. **Metric Direction Configuration**: No configuration for "higher is better" vs "lower is better" - assumes all positive deltas are improvements
5. **More Than 2 Runs**: UI supports it (dynamic columns) but only tested with 2 runs

### Implemented:
✅ Run selection UI (checkboxes + "Compare" button on project detail page)
✅ Validation (2-5 run limit with disabled button state)
✅ Navigate to run detail from comparison (clickable run headers)
✅ Baseline indicator badges on baseline run columns
✅ Side-by-side metrics table with delta and percentage
✅ Compare parameters and tags
✅ Export CSV and JSON
✅ Highlight improvements vs regressions (green/red)
✅ URL-based run selection
✅ Handle missing metrics (shows "-")
✅ Loading states

## Issues/Discrepancies
- **Run column headers truncated**: Shows "Run seed-run..." instead of full run ID or name
- **No validation**: URL accepts any number of run IDs, no 2-5 limit enforced
- **No error handling**: Invalid run IDs may cause empty comparison or errors
- **Metric direction**: All positive deltas are green - no per-metric direction config
