# US-004: Smoke and dataset baseline k6 scenarios

**As a** developer evaluating API behavior,
**I want to** run smoke and paginated dataset scenarios with consistent auth/config,
**So that** I can establish repeatable baseline performance snapshots.

## Acceptance Criteria
- [x] **Scenario 1**: Smoke scenario validates authenticated reachability
    - **Given** a running backend and valid API key
    - **When** I run the smoke scenario
    - **Then** it performs a small authenticated request set and reports request metrics.

- [x] **Scenario 2**: Dataset scenario targets paginated benchmark route
    - **Given** benchmark dataset endpoints are available
    - **When** I run the dataset scenario
    - **Then** it calls paginated dataset listing endpoints under load.

- [x] **Scenario 3**: Scenario config is environment-driven
    - **Given** I set `BASE_URL`, `LOAD_TEST_API_KEY`, and `LOAD_TEST_GROUP_ID`
    - **When** the scenarios execute
    - **Then** they use those values instead of hardcoded endpoints or secrets.

- [x] **Scenario 4**: Authentication path is explicit
    - **Given** API key authentication is required
    - **When** requests are sent
    - **Then** each request includes `x-api-key` in headers.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This story does not include document-list stress behavior; that is US-005.
