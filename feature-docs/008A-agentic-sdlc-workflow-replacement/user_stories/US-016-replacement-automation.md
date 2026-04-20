# US-016: Replacement automation (read comparison → update active workflow if no degradation)

**As a** system,
**I want** a defined process or automation that reads the baseline comparison result for the candidate run from the benchmarking system and, if no degradation, updates the current workflow to the candidate workflow (sets the candidate as the new current version),
**So that** approved candidate workflows become production without manual deployment.

## Acceptance Criteria
- [ ] **Scenario 1**: Read baseline comparison
    - **Given** a completed benchmark run id (the candidate run)
    - **When** the automation runs
    - **Then** it reads the baseline comparison for that run from the benchmarking system (e.g. BenchmarkRun.baselineComparison: overallPassed, regressedMetrics)

- [ ] **Scenario 2**: Replace only when no degradation
    - **Given** the comparison result
    - **When** overallPassed is true (no regressed metrics)
    - **Then** the automation updates the active workflow pointer (US-015) to the candidate workflow id so the candidate becomes the new current version

- [ ] **Scenario 3**: No replacement when degradation or missing comparison
    - **Given** the comparison result shows regression (overallPassed false) or the comparison has not been run
    - **When** the automation runs
    - **Then** no replacement occurs; the active workflow pointer is unchanged

- [ ] **Scenario 4**: Persist update
    - **Given** replacement is performed
    - **When** the automation completes
    - **Then** the new active workflow pointer is persisted (e.g. in config store or database); the previous workflow record remains unchanged (no in-place overwrite)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature 008A Step 1. Depends on US-015 and on having the candidate run id and candidate workflow id from the loop. Feature 008 provides the comparison result.
