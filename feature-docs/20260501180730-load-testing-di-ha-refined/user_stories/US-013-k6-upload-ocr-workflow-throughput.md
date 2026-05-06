# US-013: k6 upload and OCR/workflow throughput scenarios

**As a** platform or backend engineer,
**I want to** load-test APIs that enqueue or advance OCR/graph workflows,
**So that** end-to-end workflow throughput is visible beyond HTTP read/list benchmarks.

## Acceptance Criteria
- [x] **Scenario 1**: Scenario script exists under toolkit conventions
    - **Given** `tools/load-testing/k6/` and existing npm/OpenShift wiring patterns
    - **When** the scenario is added
    - **Then** it follows FR-13 cross-cutting rules (env vars, summaries, disposable-env docs).

- [x] **Scenario 2**: Mock and wiring prerequisites documented
    - **Given** workflows touch Document Intelligence or Temporal OCR activities
    - **When** operators read scenario docs
    - **Then** required `MOCK_AZURE_OCR`, `DOCUMENT_INTELLIGENCE_MODE`, API key, and Temporal connectivity assumptions are listed.

- [x] **Scenario 3**: Observable backlog signals documented
    - **Given** a sustained load run
    - **When** operators assess the system
    - **Then** docs name how to correlate HTTP metrics with Temporal/workflow backlog (UI, logs, or metrics) without requiring production Azure.

- [x] **Scenario 4**: Generic workload constraint
    - **Given** FR-13 prohibits document-specific hardcoding
    - **When** the scenario builds requests
    - **Then** payloads are generic or generated (no proprietary templates).

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-13 item 1 (upload → OCR / workflow throughput). Depends on baseline toolkit (US-001–US-005) and stub wiring (US-006–US-008).
- Exact REST routes must match current Nest controllers; enumerate in the scenario README when implemented.
