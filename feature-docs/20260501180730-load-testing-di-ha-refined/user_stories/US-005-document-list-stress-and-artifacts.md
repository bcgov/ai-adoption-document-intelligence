# US-005: Document-list stress scenario and artifacts

**As a** developer investigating bottlenecks,
**I want to** run a dedicated document-list stress scenario and capture summaries,
**So that** hotspot behavior can be measured and compared across runs.

## Acceptance Criteria
- [x] **Scenario 1**: Stress scenario targets document list endpoint
    - **Given** a seeded dataset and valid group id
    - **When** I run the document stress scenario
    - **Then** it repeatedly calls `GET /api/documents?group_id=...` with authenticated requests.

- [x] **Scenario 2**: Stress knobs are externally configurable
    - **Given** I need different intensity profiles
    - **When** I set `LOAD_TEST_VUS` or `LOAD_TEST_DURATION`
    - **Then** scenario execution reflects those values.

- [x] **Scenario 3**: Summary artifacts are exported to stable location
    - **Given** scenario execution completes
    - **When** I inspect output artifacts
    - **Then** JSON summary files are written under `tools/load-testing/results/`.

- [x] **Scenario 4**: Failure signaling is preserved
    - **Given** thresholds or request checks fail
    - **When** the scenario exits
    - **Then** command exit status is non-zero so CI/local automation can detect failure.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This scenario intentionally stresses a known hotspot and may produce high latency.
