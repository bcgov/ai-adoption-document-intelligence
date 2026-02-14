# US-034: Baseline Management

**As a** user,
**I want to** promote a benchmark run to baseline and compare new runs against it,
**So that** I can detect regressions when metrics fall below established thresholds.

## Acceptance Criteria
- [ ] **Scenario 1**: Promote run to baseline
    - **Given** a completed benchmark run
    - **When** `POST /api/benchmark/projects/:id/runs/:runId/baseline` is called
    - **Then** the run's `isBaseline` flag is set to `true`, any previously baseline run for the same definition has its `isBaseline` flag cleared, and an audit log entry is recorded with action `baseline_promoted`

- [ ] **Scenario 2**: Set comparison thresholds per metric
    - **Given** a baseline run is being promoted
    - **When** the promotion request includes threshold configuration
    - **Then** per-metric regression thresholds are stored (e.g., F1 must not drop below 0.95 of baseline, precision must stay above 0.90)

- [ ] **Scenario 3**: Compare new runs against baseline
    - **Given** a baseline run exists for a definition
    - **When** a new run completes for the same definition
    - **Then** the new run's metrics are compared against the baseline metrics, and the comparison result (pass/fail per metric) is included in the run details

- [ ] **Scenario 4**: Alert on regression beyond thresholds
    - **Given** configured thresholds exist for a baseline
    - **When** a new run's metric falls below the threshold relative to the baseline
    - **Then** the run is flagged with a `regression` tag and the specific regressed metrics are highlighted

- [ ] **Scenario 5**: Baseline exempt from retention
    - **Given** a run is marked as baseline
    - **When** retention policies are applied
    - **Then** the baseline run and its artifacts are exempt from automatic deletion

- [ ] **Scenario 6**: Baseline management UI
    - **Given** the user is viewing a run detail page
    - **When** the run is completed
    - **Then** a "Promote to Baseline" button is available, and if a baseline exists, the comparison results (pass/fail, deltas) are displayed

- [ ] **Scenario 7**: Only one baseline per definition
    - **Given** a definition already has a baseline run
    - **When** a new run is promoted to baseline
    - **Then** the previous baseline is demoted and the new run becomes the sole baseline

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Endpoint: `POST /api/benchmark/projects/:id/runs/:runId/baseline`
- Threshold configuration can be stored as part of the baseline promotion request or on the BenchmarkDefinition
- Comparison is metric-by-metric using configurable threshold types (absolute, relative/percentage)
- See Requirements Section 7.5 (Regression Baselines), Section 8.3 (Retention Policies)
- Backend files: extend `apps/backend-services/src/benchmark/benchmark.service.ts`
- Frontend: extend `apps/frontend/src/pages/benchmarking/RunDetailPage.tsx`
- Tests: extend `apps/backend-services/src/benchmark/benchmark.service.spec.ts`
