# US-037: Regression Reports UI

**As a** user,
**I want to** view regression reports that highlight metrics that dropped below configured thresholds,
**So that** I can quickly identify and investigate quality regressions.

## Acceptance Criteria
- [ ] **Scenario 1**: Highlight regressed metrics
    - **Given** a run compared against a baseline with configured thresholds
    - **When** the regression report is viewed
    - **Then** metrics that regressed beyond their thresholds are highlighted with severity (warning, critical) based on the magnitude of regression

- [ ] **Scenario 2**: Compare against baseline run
    - **Given** a baseline run exists for a definition
    - **When** the regression report for a new run is generated
    - **Then** the report shows baseline values, current values, thresholds, and pass/fail status per metric

- [ ] **Scenario 3**: Exportable regression report
    - **Given** the regression report is displayed
    - **When** the user clicks "Export"
    - **Then** the report is downloadable as a structured document (PDF, HTML, or JSON) containing all regression details

- [ ] **Scenario 4**: Historical trend view
    - **Given** multiple runs exist for the same definition
    - **When** the regression report is viewed
    - **Then** a historical trend chart shows metric values across recent runs to visualize the regression trajectory

- [ ] **Scenario 5**: Regression summary in run list
    - **Given** the run list page
    - **When** runs are displayed
    - **Then** runs with regressions show a warning icon with the count of regressed metrics

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/pages/benchmarking/RegressionReportPage.tsx`
- Requires baseline management (US-034) to be implemented
- Regression data computed by comparing run metrics against baseline metrics and thresholds
- See Requirements Section 10.3 (Phase 2 -- Regression Reports)
- Chart library for trend visualization (e.g., Recharts, Chart.js)
