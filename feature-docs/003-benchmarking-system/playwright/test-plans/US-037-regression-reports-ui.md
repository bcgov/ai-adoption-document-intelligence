# Test Plan: US-037 - Regression Reports UI

**Source**: `user-stories/US-037-regression-reports-ui.md`
**Requirement Section**: Section 10.3 (Phase 2 -- Regression Reports)
**Priority**: Low (Phase 2)

## User Story
**As a** user,
**I want to** view regression reports that highlight metrics that dropped below configured thresholds,
**So that** I can quickly identify and investigate quality regressions.

## Acceptance Criteria
- Highlight regressed metrics
- Compare against baseline run
- Exportable regression report
- Historical trend view
- Regression summary in run list

## Test Scenarios

### Scenario 1: View Regression Report
- **Type**: Happy Path
- **Priority**: High

**Given**: Run has metrics that regressed below baseline thresholds
**When**: User navigates to the regression report page for the run
**Then**:
- Report displays clearly identified regressed metrics
- Each regressed metric shows: name, baseline value, current value, threshold, delta
- Severity indicators: warning (minor regression), critical (major regression)
- Report is well-organized and scannable

**Affected Pages**: Regression report page
**Data Requirements**: Run with regressions + baseline
**Prerequisites**: User logged in, baseline configured

### Scenario 2: Regression Severity Levels
- **Type**: Happy Path
- **Priority**: High

**Given**: Regression report contains metrics with varying degrees of regression
**When**: Report is rendered
**Then**:
- Critical regressions (e.g., >10% drop) are highlighted in red
- Warning regressions (e.g., 5-10% drop) are highlighted in orange/yellow
- Severity badges or icons indicate level
- User can prioritize investigation based on severity

**Affected Pages**: Regression report page
**Data Requirements**: Run with varied regression magnitudes
**Prerequisites**: User logged in

### Scenario 3: Baseline Comparison Table
- **Type**: Happy Path
- **Priority**: High

**Given**: Baseline run exists for the definition
**When**: Regression report is displayed
**Then**:
- Table shows columns: Metric, Baseline Value, Current Value, Threshold, Delta, % Change, Status (Pass/Fail)
- All metrics are included (not just regressed ones)
- Pass/fail status based on threshold configuration
- Color coding for easy scanning

**Affected Pages**: Regression report page
**Data Requirements**: Run + baseline with thresholds
**Prerequisites**: User logged in

### Scenario 4: Filter to Regressions Only
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Regression report shows all metrics
**When**: User toggles "Show only regressions" filter
**Then**:
- Table filters to show only failed metrics
- Passing metrics are hidden
- Filter state is indicated clearly
- User can toggle back to see all metrics

**Affected Pages**: Regression report page
**Data Requirements**: Run with mix of pass/fail metrics
**Prerequisites**: User logged in

### Scenario 5: Export Regression Report as PDF
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Regression report is displayed
**When**: User clicks "Export" and selects PDF format
**Then**:
- PDF is generated and downloaded
- PDF contains: project/run metadata, regression summary, full metric table, charts
- PDF is formatted for printing/sharing
- File is named appropriately (e.g., "regression-report-run-123.pdf")

**Affected Pages**: Regression report page
**Data Requirements**: Regression report data
**Prerequisites**: User logged in

### Scenario 6: Export Regression Report as HTML
- **Type**: Happy Path
- **Priority**: Low

**Given**: Regression report is displayed
**When**: User clicks "Export" and selects HTML format
**Then**:
- HTML file is downloaded
- HTML is self-contained (includes styles, data)
- Can be opened in any browser
- Suitable for email sharing or archival

**Affected Pages**: Regression report page
**Data Requirements**: Regression report data
**Prerequisites**: User logged in

### Scenario 7: Export Regression Report as JSON
- **Type**: Happy Path
- **Priority**: Low

**Given**: Regression report is displayed
**When**: User clicks "Export" and selects JSON format
**Then**:
- JSON file is downloaded
- JSON contains: run metadata, baseline metadata, all metrics with comparisons, regression flags
- Suitable for programmatic analysis or CI integration
- JSON is valid and well-structured

**Affected Pages**: Regression report page
**Data Requirements**: Regression report data
**Prerequisites**: User logged in

### Scenario 8: Historical Trend Chart
- **Type**: Happy Path
- **Priority**: High

**Given**: Multiple runs exist for the same definition
**When**: User views the historical trend section of the regression report
**Then**:
- Line chart shows metric values across recent runs (last 10-20)
- X-axis: run date/number, Y-axis: metric value
- Threshold line is overlaid
- Current run is highlighted
- User can select which metrics to visualize
- Chart is interactive (hover for values, zoom)

**Affected Pages**: Regression report page
**Data Requirements**: Definition with 10+ runs over time
**Prerequisites**: User logged in

### Scenario 9: Multi-Metric Trend Visualization
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Historical trend chart is displayed
**When**: User selects multiple metrics to overlay
**Then**:
- Multiple lines are displayed on the same chart
- Each metric has a distinct color
- Legend identifies each metric
- Y-axis scales appropriately (or uses dual-axis if needed)
- User can toggle metrics on/off in the legend

**Affected Pages**: Regression report page (trend chart)
**Data Requirements**: Runs with multiple metrics over time
**Prerequisites**: User logged in

### Scenario 10: Regression Summary in Run List
- **Type**: Happy Path
- **Priority**: High

**Given**: Run list contains runs with various regression states
**When**: Run list is rendered
**Then**:
- Runs with regressions show warning icon ⚠️
- Icon includes count of regressed metrics (e.g., "⚠️ 3")
- Severity is indicated by color (orange for warning, red for critical)
- User can identify problematic runs at a glance
- Clicking icon navigates to regression report

**Affected Pages**: Project detail page (run list)
**Data Requirements**: Runs with regressions
**Prerequisites**: User logged in

### Scenario 11: Regression Details Drill-Down
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing a specific regressed metric
**When**: User clicks on the metric row
**Then**:
- Drill-down panel opens showing:
  - Historical values for this metric across runs
  - Affected samples (if available)
  - Suggested investigation steps
- User can navigate to affected samples for detailed inspection

**Affected Pages**: Regression report page (drill-down panel)
**Data Requirements**: Metric with historical data
**Prerequisites**: User logged in

### Scenario 12: No Regressions Detected
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Run completed with all metrics passing thresholds
**When**: User views the regression report
**Then**:
- Success message: "No regressions detected ✅"
- Summary shows: all metrics passed
- Report still shows baseline comparison table (all passing)
- User is assured the run is healthy

**Affected Pages**: Regression report page
**Data Requirements**: Run with all passing metrics
**Prerequisites**: User logged in

### Scenario 13: Baseline Not Set Handling
- **Type**: Edge Case
- **Priority**: High

**Given**: Definition has no baseline configured
**When**: User attempts to view regression report
**Then**:
- Message: "No baseline set. Regression detection requires a baseline run."
- Prompt to promote a run to baseline
- Link to baseline management
- Report is not available

**Affected Pages**: Regression report page
**Data Requirements**: Run without baseline
**Prerequisites**: User logged in

### Scenario 14: Trend Chart Date Range Selection
- **Type**: Happy Path
- **Priority**: Low

**Given**: Historical trend chart is displayed
**When**: User selects a date range (e.g., last 30 days, last 90 days, all time)
**Then**:
- Chart updates to show runs within the selected range
- X-axis adjusts to the date range
- User can zoom in/out temporally
- Selection is saved for the session

**Affected Pages**: Regression report page (trend chart)
**Data Requirements**: Runs spanning multiple months
**Prerequisites**: User logged in

### Scenario 15: Regression Annotations
- **Type**: Happy Path
- **Priority**: Low

**Given**: User identifies a known cause for a regression
**When**: User adds an annotation/comment to the regression report
**Then**:
- Annotation is saved and displayed on the report
- Annotation includes: timestamp, user, text
- Annotations are visible to all users
- Helps with regression investigation and knowledge sharing

**Affected Pages**: Regression report page
**Data Requirements**: Run with regressions
**Prerequisites**: User logged in

### Scenario 16: Shareable Report Link
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User has opened a regression report
**When**: User clicks "Share" or copies the URL
**Then**:
- URL is unique to this run's regression report
- Shared URL opens the same report for other users
- URL is bookmarkable
- Access control is respected (recipient must be logged in)

**Affected Pages**: Regression report page
**Data Requirements**: Regression report
**Prerequisites**: User logged in

### Scenario 17: Loading State for Historical Trends
- **Type**: Happy Path
- **Priority**: Low

**Given**: User navigates to regression report with trends
**When**: Historical data is being fetched
**Then**:
- Chart area shows loading skeleton/spinner
- Other sections of report load independently
- Chart populates when data is ready
- No errors if trend data is unavailable

**Affected Pages**: Regression report page
**Data Requirements**: Slow trend data fetch
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (view report, trends, export, drill-down)
- ✅ Edge cases covered (no baseline, no regressions, missing data)
- ✅ Error handling covered (baseline not set)
- ✅ Export functionality covered (PDF, HTML, JSON)
- ⚠️ Missing: Performance with very long run histories (100+ runs)
- ⚠️ Missing: Real-time updates if runs complete during report viewing
