# US-006: Temporal worker MOCK_AZURE_OCR wiring

**As a** developer running non-production load tests,
**I want to** control worker-side DI stubbing through environment configuration,
**So that** OCR activity paths can avoid live Azure calls when desired.

## Acceptance Criteria
- [x] **Scenario 1**: Env sample documents mock flag
    - **Given** a developer reviews worker env examples
    - **When** they open temporal env sample docs
    - **Then** they can discover `MOCK_AZURE_OCR` purpose and expected values.

- [x] **Scenario 2**: Worker ConfigMap includes mock key
    - **Given** OpenShift base manifests
    - **When** I inspect temporal worker ConfigMap
    - **Then** `MOCK_AZURE_OCR` is present with a safe default.

- [x] **Scenario 3**: Worker deployment injects mock key
    - **Given** temporal worker deployment manifests
    - **When** container env vars are resolved
    - **Then** `MOCK_AZURE_OCR` is sourced from ConfigMap into worker runtime.

- [x] **Scenario 4**: Documentation clarifies worker-only scope
    - **Given** developer-facing load docs
    - **When** I read DI stubbing guidance
    - **Then** docs clearly state this flag controls worker OCR paths, not all backend Azure routes.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses existing submit/poll short-circuit behavior in worker activities.
