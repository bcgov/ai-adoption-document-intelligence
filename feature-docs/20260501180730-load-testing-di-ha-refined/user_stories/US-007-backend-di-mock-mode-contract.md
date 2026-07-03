# US-007: Backend DI mock mode contract and scope

**As a** developer using load-test tooling broadly,
**I want to** have a clearly defined backend DI mock mode contract,
**So that** DI-dependent routes can be tested without ambiguous behavior.

## Acceptance Criteria
- [x] **Scenario 1**: Backend mode switch is defined
    - **Given** backend configuration for DI behavior
    - **When** environment is configured for load/integration runs
    - **Then** a documented mode switch supports `live` and `mock`.

- [x] **Scenario 2**: Route/service coverage is explicitly enumerated
    - **Given** DI-dependent backend modules
    - **When** mock mode documentation is reviewed
    - **Then** covered endpoints/services and exclusions are listed.

- [x] **Scenario 3**: Non-goals are documented
    - **Given** this feature’s scope boundaries
    - **When** backend mock mode docs are read
    - **Then** unsupported paths and future extensions are clearly identified.

- [x] **Scenario 4**: Contract shapes are specified
    - **Given** mock responses must be deterministic and typed
    - **When** response contracts are defined
    - **Then** they match existing endpoint DTO/service expectations.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This story is contract/spec-first; implementation and tests follow in US-008.
