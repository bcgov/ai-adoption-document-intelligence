# US-023: Task Queue Isolation & Concurrency Controls

**As a** developer,
**I want to** configure a dedicated benchmark task queue with concurrency controls,
**So that** benchmark runs are isolated from production workloads and resource usage is bounded.

## Acceptance Criteria
- [ ] **Scenario 1**: Dedicated benchmark-processing task queue
    - **Given** the Temporal worker configuration
    - **When** the benchmark worker starts
    - **Then** it polls the `benchmark-processing` task queue, separate from the production `ocr-processing` queue

- [ ] **Scenario 2**: Per-run concurrency limit
    - **Given** a benchmark run with `runtimeSettings.maxParallelDocuments` set to 5
    - **When** the benchmark workflow fans out across 50 samples
    - **Then** at most 5 samples are processed concurrently within that single run

- [ ] **Scenario 3**: Global concurrency limit
    - **Given** a global benchmark concurrency limit is configured (e.g., 20 concurrent documents)
    - **When** multiple benchmark runs execute simultaneously
    - **Then** the total number of concurrently processing benchmark documents across all runs does not exceed the global limit

- [ ] **Scenario 4**: Activity timeouts are configurable
    - **Given** benchmark activities have timeout configurations
    - **When** an activity exceeds its timeout
    - **Then** the activity is terminated and the workflow handles the timeout according to retry policy

- [ ] **Scenario 5**: Activity retry policies are configurable
    - **Given** benchmark activities have retry configurations
    - **When** an activity fails with a retryable error
    - **Then** the activity is retried according to the configured policy (max retries, backoff)

- [ ] **Scenario 6**: Optional routing to production queue
    - **Given** a benchmark definition with `runtimeSettings.useProductionQueue: true` (explicit opt-in)
    - **When** the benchmark workflow starts child workflows
    - **Then** child workflows are routed to the production task queue instead of `benchmark-processing`

- [ ] **Scenario 7**: Default routing uses benchmark queue
    - **Given** a benchmark definition without explicit production queue opt-in
    - **When** the benchmark workflow starts child workflows
    - **Then** all child workflows execute on the `benchmark-processing` queue by default

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Configuration in Temporal worker setup (worker options, task queue names)
- Per-run concurrency can be implemented using Temporal semaphores or batched fan-out
- Global concurrency can use Temporal's task queue rate limiting or application-level semaphores
- Production queue routing requires deliberate opt-in to prevent accidental impact on production
- See Requirements Section 4.1 (Task Queue Isolation), Section 4.3 (Concurrency Controls)
- Worker configuration may require updates to `apps/temporal/src/worker.ts` or equivalent
- Tests: concurrency behavior tested via integration tests
