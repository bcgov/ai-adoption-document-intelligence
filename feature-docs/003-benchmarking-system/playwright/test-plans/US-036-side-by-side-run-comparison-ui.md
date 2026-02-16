# Test Plan: US-036 - Side-by-Side Run Comparison UI

**Source**: `user-stories/US-036-side-by-side-run-comparison-ui.md`
**Requirement Section**: Section 10.3 (Phase 2 -- Run Comparison)
**Priority**: Low (Phase 2)

## User Story
**As a** user,
**I want to** compare two or more benchmark runs side by side,
**So that** I can see metric differences, improvements, and regressions across runs.

## Acceptance Criteria
- Select runs for comparison
- Side-by-side metrics table
- Highlight improvements vs regressions
- Compare parameters and tags
- Compare more than two runs
- Export comparison data

## Test Scenarios

### Scenario 1: Select Runs for Comparison
- **Type**: Happy Path
- **Priority**: High

**Given**: Run list contains multiple completed runs
**When**: User selects 2 runs via checkboxes and clicks "Compare" button
**Then**:
- Navigation to `/benchmarking/projects/{id}/compare?runs=runId1,runId2` occurs
- Comparison view loads
- Both runs' data is displayed
- Comparison controls are visible

**Affected Pages**: Project detail page (run list), Run comparison page
**Data Requirements**: 2+ completed runs
**Prerequisites**: User logged in

### Scenario 2: Side-by-Side Metrics Table
- **Type**: Happy Path
- **Priority**: High

**Given**: Two runs are selected for comparison
**When**: Comparison view renders
**Then**:
- Table displays columns: Metric Name, Run A Value, Run B Value, Delta (absolute), Percentage Change
- All metrics from both runs are shown
- Metrics are aligned by name
- Values are formatted consistently
- Table is sortable by any column

**Affected Pages**: Run comparison page
**Data Requirements**: 2 runs with overlapping metrics
**Prerequisites**: User logged in

### Scenario 3: Highlight Improvements vs Regressions
- **Type**: Happy Path
- **Priority**: High

**Given**: Metrics comparison table is displayed
**When**: Deltas are computed and rendered
**Then**:
- Improvements (positive changes for "higher is better" metrics) are highlighted in green
- Regressions (negative changes) are highlighted in red
- Neutral changes (within small threshold) are not highlighted
- Arrows indicate direction: ↑ for improvement, ↓ for regression
- Color coding is consistent and accessible

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with differing metrics
**Prerequisites**: User logged in

### Scenario 4: Metric Direction Configuration
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Different metrics have different improvement directions (e.g., error_rate lower is better)
**When**: Comparison highlights are applied
**Then**:
- System correctly identifies direction per metric type
- Error metrics: lower is highlighted as green (improvement)
- Accuracy metrics: higher is highlighted as green
- User can see correct improvement/regression indicators

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with diverse metric types
**Prerequisites**: User logged in, metric direction metadata configured

### Scenario 5: Compare Parameters and Tags
- **Type**: Happy Path
- **Priority**: High

**Given**: Two runs with different parameters or tags
**When**: Comparison view renders parameters/tags section
**Then**:
- Parameters diff shows:
  - Parameters present in both runs
  - Parameters only in Run A (marked distinctly)
  - Parameters only in Run B (marked distinctly)
  - Changed parameters highlighted
- Same structure for tags
- User can identify configuration differences easily

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with different configs
**Prerequisites**: User logged in

### Scenario 6: Compare More Than Two Runs
- **Type**: Happy Path
- **Priority**: High

**Given**: User selects 3 or 4 runs
**When**: Comparison view renders
**Then**:
- Metrics table includes a column for each selected run
- Deltas are computed relative to the first run (baseline)
- Table adjusts layout to accommodate multiple columns
- Horizontal scrolling if necessary
- Comparison remains readable

**Affected Pages**: Run comparison page
**Data Requirements**: 3-4 completed runs
**Prerequisites**: User logged in

### Scenario 7: Baseline Run in Comparison
- **Type**: Happy Path
- **Priority**: Medium

**Given**: One of the selected runs is the baseline
**When**: Comparison view renders
**Then**:
- Baseline run is clearly marked (badge, column header)
- Deltas are computed from baseline (if it's the first run)
- Threshold lines/indicators show acceptable ranges
- User can see how other runs compare to baseline

**Affected Pages**: Run comparison page
**Data Requirements**: Baseline run + other runs
**Prerequisites**: User logged in

### Scenario 8: Export Comparison Data as CSV
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Comparison view is displayed
**When**: User clicks "Export" button and selects CSV format
**Then**:
- CSV file is downloaded
- CSV contains: metric names, all run values, deltas, percentage changes
- File is named appropriately (e.g., "run-comparison-2026-02-15.csv")
- Data is formatted for spreadsheet import

**Affected Pages**: Run comparison page
**Data Requirements**: Comparison data
**Prerequisites**: User logged in

### Scenario 9: Export Comparison Data as JSON
- **Type**: Happy Path
- **Priority**: Low

**Given**: Comparison view is displayed
**When**: User clicks "Export" and selects JSON format
**Then**:
- JSON file is downloaded
- JSON structure includes: runs metadata, metrics, deltas, parameters, tags
- File is suitable for programmatic analysis
- JSON is valid and well-formatted

**Affected Pages**: Run comparison page
**Data Requirements**: Comparison data
**Prerequisites**: User logged in

### Scenario 10: Filter Metrics in Comparison
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Comparison table has 50+ metrics
**When**: User uses metric filter/search
**Then**:
- Only matching metrics are displayed
- Filter is case-insensitive
- Filter applies across all columns
- Clear filter button resets view

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with many metrics
**Prerequisites**: User logged in

### Scenario 11: Show Only Changed Metrics
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Comparison table is displayed
**When**: User toggles "Show only changed metrics" option
**Then**:
- Metrics with identical values across runs are hidden
- Only metrics with differences are shown
- Toggle state is saved during session
- User can easily focus on differences

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with some identical metrics
**Prerequisites**: User logged in

### Scenario 12: Visual Comparison Charts
- **Type**: Happy Path
- **Priority**: Low

**Given**: Comparison data is loaded
**When**: User switches to "Chart View" tab
**Then**:
- Bar charts show metric values side by side
- Each run is a different colored bar
- Charts are grouped by metric
- User can see visual patterns easily
- Charts are responsive and interactive

**Affected Pages**: Run comparison page (chart view)
**Data Requirements**: Comparison data
**Prerequisites**: User logged in

### Scenario 13: Handle Missing Metrics
- **Type**: Edge Case
- **Priority**: High

**Given**: Run A has metric X, Run B does not have metric X
**When**: Comparison table is rendered
**Then**:
- Missing metric is shown as "—" or "N/A"
- Delta is not calculated (or shown as "—")
- Percentage change is not calculated
- User understands metric is not present in one run

**Affected Pages**: Run comparison page
**Data Requirements**: Runs with different metric sets
**Prerequisites**: User logged in

### Scenario 14: Navigate from Comparison to Run Detail
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing comparison of multiple runs
**When**: User clicks on a run name/header in the comparison table
**Then**:
- New tab opens with the run's detail page
- Comparison view remains open
- User can investigate specific run without losing comparison context

**Affected Pages**: Run comparison page, Run detail page
**Data Requirements**: Comparison data
**Prerequisites**: User logged in

### Scenario 15: Comparison URL Sharing
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User has opened a comparison view
**When**: User copies and shares the URL
**Then**:
- URL contains run IDs as query parameters
- Another user can open the same comparison view via the URL
- Comparison loads with the same runs
- URL is shareable and bookmarkable

**Affected Pages**: Run comparison page
**Data Requirements**: Valid run IDs
**Prerequisites**: User logged in (for recipient)

### Scenario 16: Error Handling - Invalid Run Selection
- **Type**: Error Case
- **Priority**: Medium

**Given**: User attempts to compare only 1 run or more than 5 runs
**When**: "Compare" button is clicked
**Then**:
- Error message: "Please select 2-5 runs to compare"
- Compare button is disabled if selection is invalid
- User is guided to select appropriate number of runs

**Affected Pages**: Project detail page (run list)
**Data Requirements**: Run list
**Prerequisites**: User logged in

### Scenario 17: Loading State for Comparison
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User navigates to comparison page
**When**: Run data is being fetched
**Then**:
- Loading spinner/skeleton is displayed
- Placeholder for table structure is shown
- Loading completes and data populates
- No flash of unstyled content

**Affected Pages**: Run comparison page
**Data Requirements**: Comparison with slow data fetch
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (select, compare 2+, export, visualize)
- ✅ Edge cases covered (missing metrics, invalid selections)
- ✅ Error handling covered (API errors, invalid inputs)
- ✅ Export functionality covered (CSV, JSON)
- ⚠️ Missing: Performance with very large metric sets
- ⚠️ Missing: Comparison of runs across different definitions
