# US-008: Backend DI deterministic mock implementation and tests

**As a** developer executing backend DI-dependent scenarios,
**I want to** run deterministic typed mock responses with test coverage,
**So that** load and integration tests are reliable without live Azure dependencies.

## Acceptance Criteria
- [x] **Scenario 1**: Mock mode returns deterministic responses
    - **Given** backend DI mode is set to mock
    - **When** covered DI-dependent operations run
    - **Then** responses are deterministic for repeatable test behavior.

- [x] **Scenario 2**: Mock responses are type-safe
    - **Given** endpoint/service contracts define expected shapes
    - **When** mock responses are generated
    - **Then** they conform to typed contracts (no untyped bypasses).

- [x] **Scenario 3**: Live mode behavior remains unchanged
    - **Given** backend DI mode is set to live
    - **When** DI-dependent operations run
    - **Then** existing live Azure client behavior is preserved.

- [x] **Scenario 4**: Unit tests cover both mock and live branches
    - **Given** automated backend test suites
    - **When** tests execute
    - **Then** they verify mock-mode branch behavior and live-mode branch selection logic.

- [x] **Scenario 5**: Mock mode docs align with implementation
    - **Given** developer-facing documentation
    - **When** implementation is complete
    - **Then** docs accurately describe mode selection, route coverage, and expected outputs.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Backend test updates are mandatory when backend behavior changes.
- Keep mocks generic; avoid domain-specific hardcoding.
