# US-012: Classifier DI mock-mode test doubles and coverage closure

**As a** maintainer of backend DI mock mode,
**I want to** classifier code paths and tests aligned when `DOCUMENT_INTELLIGENCE_MODE=mock`,
**So that** regressions (missing `isMockMode()`, broken mocks, doc drift) are caught automatically.

## Acceptance Criteria
- [x] **Scenario 1**: ClassifierService mock-mode branches are tested
    - **Given** unit tests for `ClassifierService`
    - **When** `AzureService.isMockMode()` returns true
    - **Then** classifier training rejects with the documented unavailable behavior and classify submission paths return deterministic mock operation-location behavior matching implementation.

- [x] **Scenario 2**: ClassifierPollerService short-circuits in mock mode
    - **Given** unit tests for `ClassifierPollerService`
    - **When** `AzureService.isMockMode()` returns true and `pollActiveClassifiers` runs
    - **Then** no training-classifier DB enumeration / outbound polling path executes (early return verified).

- [x] **Scenario 3**: Azure service test doubles match production surface
    - **Given** classifier-focused specs inject a mock `AzureService`
    - **When** production code calls `isMockMode()` (and other methods used by those code paths)
    - **Then** test doubles implement those methods so tests exercise real call shapes without runtime errors.

- [x] **Scenario 4**: Documentation matches classifier-related mock behavior
    - **Given** `docs-md/LOAD_TESTING.md` and `tools/load-testing/README.md`
    - **When** I compare statements about backend classifier behavior under mock mode
    - **Then** they match implemented contracts (polling/submission/training) and tested routes.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-8a (Mock-Mode Test Gap Closure) and supports acceptance criterion #8 in `../REQUIREMENTS.md`.
- Depends on US-007 contract and US-008 baseline mock implementation; extends coverage specifically for classifier module gaps.
