# Test Plan: US-034 - Baseline Management

**Source**: `user-stories/US-034-baseline-management.md`
**Requirement Section**: Section 7.5 (Regression Baselines), Section 8.3 (Retention Policies)
**Priority**: Medium (Phase 1.5)

## User Story
**As a** user,
**I want to** promote a benchmark run to baseline and compare new runs against it,
**So that** I can detect regressions when metrics fall below established thresholds.

## Acceptance Criteria
- Promote run to baseline
- Set comparison thresholds per metric
- Compare new runs against baseline
- Alert on regression beyond thresholds
- Baseline exempt from retention
- Baseline management UI
- Only one baseline per definition

## Test Scenarios

### Scenario 1: Promote Run to Baseline
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run with metrics
**When**: User clicks "Promote to Baseline" button on run detail page
**Then**:
- Confirmation dialog appears
- POST to `/api/benchmark/projects/{id}/runs/{runId}/baseline` is sent
- Run's `isBaseline` flag is set to true
- Baseline badge appears on the run
- Success notification: "Run promoted to baseline"
- Audit log entry is created

**Affected Pages**: Run detail page
**Data Requirements**: Completed run with metrics
**Prerequisites**: User logged in, run completed

### Scenario 2: Set Thresholds During Promotion
- **Type**: Happy Path
- **Priority**: High

**Given**: User is promoting a run to baseline
**When**: Threshold configuration dialog is displayed
**Then**:
- Form shows all metrics from the run
- For each metric, user can set:
  - Threshold type: relative (percentage) or absolute
  - Threshold value (e.g., "must not drop below 95% of baseline")
- Default thresholds are pre-filled (e.g., 95% for all)
- User can customize per-metric thresholds
- Submit and Cancel buttons

**Affected Pages**: Run detail page (promotion dialog)
**Data Requirements**: Run with multiple metrics
**Prerequisites**: User logged in

### Scenario 3: Baseline Badge Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Run is marked as baseline
**When**: Run list or run detail is displayed
**Then**:
- Prominent "BASELINE" badge is shown
- Badge color: gold/yellow or distinct from other badges
- Badge is visible in run list and detail view
- Tooltip explains: "This run is the baseline for comparison"

**Affected Pages**: Project detail page (run list), Run detail page
**Data Requirements**: Baseline run
**Prerequisites**: User logged in

### Scenario 4: Compare New Run Against Baseline
- **Type**: Happy Path
- **Priority**: High

**Given**: Baseline run exists for a definition and new run completes for the same definition
**When**: User views the new run's detail page
**Then**:
- Comparison section displays:
  - Baseline metrics vs current metrics
  - Delta (absolute and percentage change)
  - Pass/fail status per metric based on thresholds
- Color coding: green for improvements, red for regressions, gray for within threshold
- Overall pass/fail status for the run

**Affected Pages**: Run detail page
**Data Requirements**: Baseline run + new run for same definition
**Prerequisites**: User logged in

### Scenario 5: Regression Alert Display
- **Type**: Error Case
- **Priority**: High

**Given**: New run's metric falls below baseline threshold
**When**: Comparison results are calculated
**Then**:
- Run is flagged with "REGRESSION" tag/badge
- Regressed metrics are highlighted in red
- Alert notification: "Metrics regressed beyond thresholds"
- List of regressed metrics with deltas
- User is prompted to investigate

**Affected Pages**: Run detail page, Run list
**Data Requirements**: Run with regressed metrics
**Prerequisites**: User logged in, baseline with thresholds set

### Scenario 6: Passing Comparison Display
- **Type**: Happy Path
- **Priority**: Medium

**Given**: New run's metrics meet or exceed baseline thresholds
**When**: Comparison results are displayed
**Then**:
- Overall status: "PASSED" with green checkmark
- All metrics show within-threshold or improved
- No regression alerts
- User can see the run is acceptable

**Affected Pages**: Run detail page
**Data Requirements**: Run passing all thresholds
**Prerequisites**: User logged in

### Scenario 7: Demote Previous Baseline
- **Type**: Happy Path
- **Priority**: High

**Given**: Definition already has a baseline run
**When**: User promotes a new run to baseline
**Then**:
- Confirmation dialog warns: "Existing baseline will be demoted. Continue?"
- After confirmation, previous baseline's `isBaseline` flag is cleared
- New run becomes the sole baseline
- Old baseline retains all data but loses baseline badge
- Audit log records baseline change

**Affected Pages**: Run detail page
**Data Requirements**: Two runs for same definition
**Prerequisites**: User logged in

### Scenario 8: View Baseline from Definition Detail
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Definition has a baseline run set
**When**: User views the definition detail page
**Then**:
- Baseline section shows:
  - Link to the baseline run
  - Key baseline metrics summary
  - Threshold configuration summary
- User can click to view full baseline run details
- "Change Baseline" action is available

**Affected Pages**: Definition detail page
**Data Requirements**: Definition with baseline
**Prerequisites**: User logged in

### Scenario 9: Baseline Exempt from Retention
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Retention policies are configured to delete old runs
**When**: Retention cleanup job runs
**Then**:
- Baseline runs are skipped/exempt from deletion
- Non-baseline old runs are deleted as per policy
- Baseline artifacts are preserved
- UI indicates baseline runs are protected

**Affected Pages**: Admin/retention settings (if UI exists)
**Data Requirements**: Old baseline run + retention policy
**Prerequisites**: Admin access, retention configured

### Scenario 10: Cannot Promote Failed Run
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Run with status "failed"
**When**: User views the run detail page
**Then**:
- "Promote to Baseline" button is disabled
- Tooltip explains: "Only completed runs can be promoted to baseline"
- User cannot promote failed runs

**Affected Pages**: Run detail page
**Data Requirements**: Failed run
**Prerequisites**: User logged in

### Scenario 11: Threshold Validation
- **Type**: Error Case
- **Priority**: High

**Given**: User is setting baseline thresholds
**When**: User enters invalid threshold (e.g., negative, over 100% for relative)
**Then**:
- Validation error appears: "Threshold must be between 0 and 100"
- Form does not submit
- User can correct the value
- Valid ranges are indicated in help text

**Affected Pages**: Baseline promotion dialog
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 12: Edit Baseline Thresholds
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Baseline run exists with configured thresholds
**When**: User clicks "Edit Thresholds" action
**Then**:
- Threshold configuration dialog opens with current values
- User can modify thresholds
- Saving updates the threshold configuration
- Future comparisons use new thresholds
- Audit log records the change

**Affected Pages**: Run detail page, Definition detail page
**Data Requirements**: Baseline run
**Prerequisites**: User logged in

### Scenario 13: Comparison Without Baseline
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Definition has no baseline run set
**When**: User views a completed run's detail page
**Then**:
- Comparison section shows: "No baseline set for this definition"
- Prompt: "Promote this run to baseline to enable comparisons"
- "Promote to Baseline" button is prominently displayed
- No comparison data is shown

**Affected Pages**: Run detail page
**Data Requirements**: Run without baseline
**Prerequisites**: User logged in

### Scenario 14: Regression Indicator in Run List
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Run list contains runs with regressions
**When**: Run list is displayed
**Then**:
- Runs with regressions show warning icon/badge
- Icon indicates count of regressed metrics (e.g., "⚠️ 3")
- Color coding makes regressions immediately visible
- User can identify problematic runs at a glance

**Affected Pages**: Project detail page (run list)
**Data Requirements**: Runs with various comparison states
**Prerequisites**: User logged in

### Scenario 15: Historical Baseline Changes
- **Type**: Happy Path
- **Priority**: Low

**Given**: Baseline for a definition has been changed multiple times
**When**: User views baseline history (if supported)
**Then**:
- Timeline shows all baseline changes
- Each entry: date, promoted run, user who promoted
- User can understand baseline evolution over time
- Links to each historical baseline run

**Affected Pages**: Definition detail page (baseline history section)
**Data Requirements**: Definition with multiple baseline changes
**Prerequisites**: User logged in

### Scenario 16: API Error Handling
- **Type**: Error Case
- **Priority**: Medium

**Given**: User attempts to promote a run to baseline
**When**: API returns error (500, conflict)
**Then**:
- Error notification displays with message
- Run is not promoted
- User can retry the action
- Dialog remains open with user's threshold settings

**Affected Pages**: Run detail page (promotion dialog)
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (promote, compare, demote, thresholds)
- ✅ Edge cases covered (no baseline, failed runs, retention exemption)
- ✅ Error handling covered (validation, API errors)
- ✅ Regression detection covered (alerts, indicators, comparisons)
- ⚠️ Missing: Performance with many runs comparing against baseline
- ⚠️ Missing: Complex threshold scenarios (multi-metric dependencies)
