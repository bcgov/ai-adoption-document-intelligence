# US-009: Runbook, bottleneck template, and HA assessment documentation

**As a** developer or platform engineer,
**I want to** follow a complete load-testing runbook with assessment templates and guardrails,
**So that** results are consistent, safe, and traceable.

## Acceptance Criteria
- [x] **Scenario 1**: Runbook includes end-to-end execution flow
    - **Given** a first-time operator
    - **When** they read load-testing docs
    - **Then** they can follow ordered steps for seed, run, and evidence collection.

- [x] **Scenario 2**: Bottleneck findings template is present
    - **Given** performance results from a test run
    - **When** findings are documented
    - **Then** template fields include rank/severity, area, symptom, evidence, and mitigation notes.

- [x] **Scenario 3**: HA checklist is file-referenced and snapshot-only
    - **Given** current OpenShift/Crunchy manifests
    - **When** HA assessment is recorded
    - **Then** findings are mapped to concrete files and clearly marked as assessment-only.

- [x] **Scenario 4**: Cleanup and lifecycle instructions are explicit
    - **Given** generated load-test data
    - **When** run completion is documented
    - **Then** explicit cleanup commands and deterministic prefix strategy are included.

- [x] **Scenario 5**: Large-run guardrails are explicit
    - **Given** plans for high-volume runs (for example ~1M rows)
    - **When** docs are reviewed before execution
    - **Then** docs prohibit shared/prod DB usage and require disposable environment + pre-run checklist.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature is metric-capture oriented; no mandatory SLO pass/fail gate is required in this scope.
