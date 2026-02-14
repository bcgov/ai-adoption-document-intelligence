# US-011: Benchmark Definition Service & Controller

**As a** user,
**I want to** create and manage benchmark definitions that specify what to benchmark,
**So that** I can configure reproducible benchmark experiments with pinned dataset versions, workflows, and evaluators.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a benchmark definition
    - **Given** a valid definition creation request with name, datasetVersionId, splitId, workflowId, evaluatorType, evaluatorConfig, runtimeSettings, and artifactPolicy
    - **When** `POST /api/benchmark/projects/:id/definitions` is called
    - **Then** the service validates all referenced entities exist (datasetVersion, split, workflow), captures the current `workflowConfigHash` from the workflow config, creates a BenchmarkDefinition record with `immutable=false` and `revision=1`, and returns the created definition

- [ ] **Scenario 2**: Validate referenced entities on creation
    - **Given** a definition creation request referencing a non-existent datasetVersionId
    - **When** `POST /api/benchmark/projects/:id/definitions` is called
    - **Then** a 400 response is returned indicating the referenced dataset version does not exist

- [ ] **Scenario 3**: Capture workflow config hash at creation time
    - **Given** a workflow exists with a specific configuration
    - **When** a benchmark definition is created referencing that workflow
    - **Then** the `workflowConfigHash` field stores the SHA-256 hash of the workflow config at the time of definition creation

- [ ] **Scenario 4**: List definitions for a project
    - **Given** a project with multiple benchmark definitions
    - **When** `GET /api/benchmark/projects/:id/definitions` is called
    - **Then** a list of definitions is returned with name, datasetVersion info, workflow info, evaluatorType, immutable status, revision number, and timestamps

- [ ] **Scenario 5**: Get definition details
    - **Given** a benchmark definition exists
    - **When** `GET /api/benchmark/projects/:id/definitions/:defId` is called
    - **Then** full definition details are returned including all configuration fields, referenced entity details, and run history

- [ ] **Scenario 6**: Immutability enforcement after first run
    - **Given** a benchmark definition has at least one BenchmarkRun
    - **When** an edit is attempted on the definition
    - **Then** a new definition record is created with `revision` incremented by 1 and a new `id`, while the original remains unchanged with `immutable=true`

- [ ] **Scenario 7**: Editing a mutable definition updates in place
    - **Given** a benchmark definition with no runs (immutable=false)
    - **When** an edit is attempted on the definition
    - **Then** the existing record is updated in place without creating a new revision

- [ ] **Scenario 8**: Definition not found returns 404
    - **Given** no definition exists with the provided ID for the given project
    - **When** `GET /api/benchmark/projects/:id/definitions/:defId` is called
    - **Then** a 404 response is returned

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extends: `apps/backend-services/src/benchmark/benchmark.service.ts`, `apps/backend-services/src/benchmark/benchmark.controller.ts`
- WorkflowConfigHash is computed using the same SHA-256 approach as existing `config-hash.ts` in `apps/temporal/src`
- BenchmarkDefinition references the existing `Workflow` model via FK
- Evaluator type must match a registered evaluator in EvaluatorRegistryService (validated on creation)
- See Requirements Section 2.5 (BenchmarkDefinition model), Section 7.4 (Configuration Immutability), Section 11.2
- Tests: extend `apps/backend-services/src/benchmark/benchmark.service.spec.ts`
