# US-003: Root scripts and k6 runtime portability

**As a** developer,
**I want to** run load-test commands from repo root with native or Docker k6,
**So that** setup friction is low across different local environments.

## Acceptance Criteria
- [x] **Scenario 1**: Root scripts expose load-test entry points
    - **Given** I am at repository root
    - **When** I list npm scripts
    - **Then** I can invoke seed, smoke, dataset, and document-stress commands without changing directories.

- [x] **Scenario 2**: Native k6 is preferred when available
    - **Given** `k6` is installed locally
    - **When** I execute a k6 script via npm
    - **Then** the native binary path is used.

- [x] **Scenario 3**: Docker fallback works when k6 is missing
    - **Given** `k6` is not installed locally
    - **When** I run the same npm command
    - **Then** the toolkit uses Docker to execute the same scenario.

- [x] **Scenario 4**: Host connectivity guidance is documented
    - **Given** Docker networking varies by host platform
    - **When** I read toolkit docs
    - **Then** I can follow host-gateway/`host.docker.internal` guidance to reach local backend endpoints.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Scripts should remain env-var driven.
- Docker fallback should not require modifying source files.
