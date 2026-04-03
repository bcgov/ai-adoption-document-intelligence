# US-013: Automation or activity to run candidate and read baseline comparison

**As a** loop orchestrator,
**I want to** automation (or Temporal activities) that produce the candidate config via the workflow modification utility, start a benchmark run for the candidate (same definition, workflow override), wait for run completion, and read the baseline comparison result for that run,
**So that** the loop can decide whether to replace the workflow based on pass/fail.

## Acceptance Criteria
- [ ] **Scenario 1**: Produce candidate and start run
    - **Given** the current workflow config and the AI recommendation (US-009, US-010, US-011)
    - **When** the automation runs
    - **Then** it produces the candidate graph, persists the new workflow version, and starts a benchmark run with the workflow override (US-012)

- [ ] **Scenario 2**: Wait for run completion
    - **Given** the started run
    - **When** the automation waits
    - **Then** it waits for the run to reach a terminal status (completed or failed) (e.g. by polling or Temporal workflow wait)

- [ ] **Scenario 3**: Read baseline comparison result
    - **Given** the run has completed
    - **When** the automation reads the result
    - **Then** it obtains the baseline comparison for that run (e.g. from BenchmarkRun.baselineComparison): overallPassed, regressedMetrics, and can use this to decide replacement

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 4; requirements Section 6. Depends on US-010, US-011, US-012 and existing benchmarking APIs (start run, get run by id).
