# US-015: Temporal worker queue saturation harness

**As a** platform engineer,
**I want to** generate sustained workflow/task load against Temporal worker queues,
**So that** queue depth, worker concurrency, and poll latency—not only Nest HTTP—can be assessed.

## Acceptance Criteria
- [x] **Scenario 1**: Load driver documented and reproducible
    - **Given** APIs or a approved harness that start workflows or activities at a controlled rate
    - **When** an operator follows the doc
    - **Then** they can reproduce a saturation-style run in a disposable namespace.

- [x] **Scenario 2**: Target metrics and stop conditions
    - **Given** FR-13 requirement for safety stops
    - **When** the runbook is read
    - **Then** it lists signals (e.g. schedule-to-start latency, pending tasks, worker CPU) and when to stop the load.

- [x] **Scenario 3**: Worker and Nest configuration knobs
    - **Given** worker replica count, task queue name, and concurrency settings
    - **When** scenarios are executed
    - **Then** docs reference which settings affect results and where they live in manifests.

- [x] **Scenario 4**: Mock modes compatibility
    - **Given** OCR activities may use `MOCK_AZURE_OCR`
    - **When** saturation runs omit live Azure
    - **Then** documentation states required env for worker/backend so failures are not mistaken for capacity limits.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-13 item 3 (Temporal worker queue saturation). May combine HTTP starters with Temporal CLI/scripts where appropriate; keep secrets out of repo.
