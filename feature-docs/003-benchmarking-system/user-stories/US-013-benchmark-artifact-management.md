# US-013: Benchmark Artifact Management

**As a** user,
**I want to** browse and manage artifacts produced by benchmark runs,
**So that** I can inspect workflow outputs, evaluation reports, and diff reports for debugging and analysis.

## Acceptance Criteria
- [ ] **Scenario 1**: List artifacts for a run
    - **Given** a BenchmarkRun with associated artifacts
    - **When** `GET /api/benchmark/projects/:id/runs/:runId/artifacts` is called
    - **Then** a list of BenchmarkArtifact records is returned with type, path, sampleId, nodeId, sizeBytes, mimeType, and createdAt

- [ ] **Scenario 2**: Filter artifacts by type
    - **Given** a run with artifacts of different types
    - **When** `GET /api/benchmark/projects/:id/runs/:runId/artifacts?type=diff_report` is called
    - **Then** only artifacts matching the specified type are returned

- [ ] **Scenario 3**: Artifact upload policy -- full
    - **Given** a BenchmarkDefinition with `artifactPolicy` set to `full`
    - **When** the benchmark run completes
    - **Then** all outputs for all samples are stored as BenchmarkArtifact records in MinIO

- [ ] **Scenario 4**: Artifact upload policy -- failures_only
    - **Given** a BenchmarkDefinition with `artifactPolicy` set to `failures_only`
    - **When** the benchmark run completes
    - **Then** only outputs for samples where `EvaluationResult.pass === false` are stored as artifacts

- [ ] **Scenario 5**: Artifact upload policy -- sampled
    - **Given** a BenchmarkDefinition with `artifactPolicy` set to `sampled` with a sampling percentage
    - **When** the benchmark run completes
    - **Then** only a configured percentage of sample outputs are stored as artifacts (randomly sampled)

- [ ] **Scenario 6**: Store artifact in MinIO
    - **Given** an artifact needs to be persisted
    - **When** the artifact is saved
    - **Then** the file content is written to MinIO via MinioBlobStorageService in the `benchmark-outputs` bucket, and a BenchmarkArtifact record is created in Postgres with the MinIO key as `path`

- [ ] **Scenario 7**: Artifact record includes sample and node context
    - **Given** an artifact produced by a specific graph node for a specific sample
    - **When** the BenchmarkArtifact record is created
    - **Then** the `sampleId` and `nodeId` fields are populated to enable per-sample and per-node artifact lookup

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extends: `apps/backend-services/src/benchmark/benchmark.service.ts`, `apps/backend-services/src/benchmark/benchmark.controller.ts`
- Artifact storage uses MinioBlobStorageService (US-003) for writing to MinIO
- Artifact types enum: `per_doc_output`, `intermediate_node_output`, `diff_report`, `evaluation_report`, `error_log`
- Artifact policy is enforced during the benchmark workflow execution (Temporal activities)
- See Requirements Section 2.7 (BenchmarkArtifact model), Section 6.4 (Artifact Storage), Section 11.2
- Tests: extend `apps/backend-services/src/benchmark/benchmark.service.spec.ts`
