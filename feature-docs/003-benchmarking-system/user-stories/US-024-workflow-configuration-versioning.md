# US-024: Workflow & Configuration Versioning

**As a** user,
**I want to** have benchmark definitions and runs capture exact version information,
**So that** every benchmark result is fully reproducible with pinned workflow, dataset, and runtime versions.

## Acceptance Criteria
- [ ] **Scenario 1**: Workflow config hash captured at definition creation
    - **Given** a workflow exists with a specific configuration
    - **When** a BenchmarkDefinition is created referencing that workflow
    - **Then** the `workflowConfigHash` field stores the SHA-256 hash of the workflow's `GraphWorkflowConfig` at the time of creation

- [ ] **Scenario 2**: Immutability set after first run
    - **Given** a BenchmarkDefinition with `immutable=false`
    - **When** the first BenchmarkRun is started against this definition
    - **Then** the definition's `immutable` field is set to `true` and cannot be reverted

- [ ] **Scenario 3**: Editing immutable definition creates new revision
    - **Given** a BenchmarkDefinition with `immutable=true`
    - **When** a user attempts to edit the definition
    - **Then** a new BenchmarkDefinition record is created with `revision` incremented by 1, a new UUID, and the updated configuration, while the original record remains unchanged

- [ ] **Scenario 4**: Worker image digest recorded per run
    - **Given** a benchmark run is executing on a Temporal worker
    - **When** the BenchmarkRun record is created
    - **Then** the `workerImageDigest` field is populated with the Docker/OCI image digest of the worker (if available)

- [ ] **Scenario 5**: Worker Git SHA recorded per run
    - **Given** a benchmark run is executing
    - **When** the BenchmarkRun record is created
    - **Then** the `workerGitSha` field is populated with the Git SHA of the worker codebase

- [ ] **Scenario 6**: Published dataset version required for non-draft runs
    - **Given** a BenchmarkDefinition references a DatasetVersion with status `draft`
    - **When** a benchmark run is started
    - **Then** the run proceeds but the results are flagged with a `draft_dataset` tag in the run metadata to indicate the dataset was not published

- [ ] **Scenario 7**: Published dataset version is the default expectation
    - **Given** a BenchmarkDefinition references a DatasetVersion with status `published`
    - **When** a benchmark run is started
    - **Then** the run proceeds normally without any draft warning flags

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Workflow config hash uses SHA-256 consistent with existing `config-hash.ts` in `apps/temporal/src`
- Worker Git SHA can be injected via environment variable at build time (e.g., `WORKER_GIT_SHA`)
- Worker image digest can be read from container metadata or injected via environment variable
- See Requirements Section 7.1 (Workflow Versioning), Section 7.2 (Engine/Runtime Versioning), Section 7.3 (Dataset Versioning), Section 7.4 (Configuration Immutability)
- Implementation touches: `apps/backend-services/src/benchmark/benchmark.service.ts`, `apps/temporal/src/benchmark-workflow.ts`
- Tests: extend existing benchmark service tests
