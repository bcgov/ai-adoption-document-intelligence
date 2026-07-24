# US-016: k6 review and HITL API scenarios

**As a** backend engineer,
**I want to** load-test review-session or human-in-the-loop HTTP endpoints,
**So that** review flows remain responsive under concurrent operators and automation.

## Acceptance Criteria
- [x] **Scenario 1**: Route inventory is explicit
    - **Given** review/HITL controllers exist in backend-services
    - **When** the scenario is authored
    - **Then** documented paths, verbs, and required IDs/query params match Swagger and implementation.

- [x] **Scenario 2**: Auth and identity assumptions
    - **Given** review endpoints may require SSO or API-key patterns differ from benchmark reads
    - **When** operators run k6
    - **Then** docs explain how to obtain tokens or keys in disposable environments only.

- [x] **Scenario 3**: Data prerequisites and cleanup
    - **Given** review actions depend on documents or sessions
    - **When** the scenario runs
    - **Then** seed or fixture steps and teardown avoid polluting shared databases.

- [x] **Scenario 4**: k6 script and artifacts
    - **Given** FR-13 cross-cutting expectations
    - **When** the scenario completes
    - **Then** scripts live under `tools/load-testing/k6/` (or subdirectory), with summary export paths documented.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-13 item 4 (review / HITL APIs). Enumerate concrete routes at implementation time; keep workloads generic.
