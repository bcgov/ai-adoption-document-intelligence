# US-036: Side-by-Side Run Comparison UI

**As a** user,
**I want to** compare two or more benchmark runs side by side,
**So that** I can see metric differences, improvements, and regressions across runs.

## Acceptance Criteria
- [ ] **Scenario 1**: Select runs for comparison
    - **Given** the run list page
    - **When** the user selects two or more runs via checkboxes and clicks "Compare"
    - **Then** a comparison view is displayed with the selected runs

- [ ] **Scenario 2**: Side-by-side metrics table
    - **Given** two runs are selected for comparison
    - **When** the comparison view renders
    - **Then** a table displays metrics with columns: metric name, Run A value, Run B value, delta (absolute difference), and percentage change

- [ ] **Scenario 3**: Highlight improvements vs regressions
    - **Given** the metrics comparison table
    - **When** deltas are computed
    - **Then** improvements (higher is better metrics that increased) are highlighted in green, regressions (metrics that decreased) are highlighted in red, and unchanged metrics are neutral

- [ ] **Scenario 4**: Compare parameters and tags
    - **Given** two runs with different parameters or tags
    - **When** the comparison view renders
    - **Then** a parameters/tags diff section shows which values changed between runs

- [ ] **Scenario 5**: Compare more than two runs
    - **Given** three or more runs are selected
    - **When** the comparison view renders
    - **Then** the metrics table includes a column for each selected run with deltas computed relative to the first (baseline) run

- [ ] **Scenario 6**: Export comparison data
    - **Given** the comparison view is displayed
    - **When** the user clicks "Export"
    - **Then** the comparison data is downloadable as CSV or JSON

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/pages/benchmarking/RunComparisonPage.tsx`
- Comparison data is computed client-side from fetched run details
- See Requirements Section 10.3 (Phase 2 -- Run Comparison)
- Route: `/benchmarking/projects/:id/compare?runs=runId1,runId2`
