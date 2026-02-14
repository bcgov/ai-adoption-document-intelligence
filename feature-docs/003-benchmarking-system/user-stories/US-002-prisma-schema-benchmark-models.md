# US-002: Prisma Schema -- Benchmark Data Models

**As a** developer,
**I want to** have all benchmark-related data models defined in the Prisma schema,
**So that** the database supports the full benchmarking data model with proper relationships and constraints.

## Acceptance Criteria
- [ ] **Scenario 1**: Dataset model is defined
    - **Given** the data model specification in Section 2.1
    - **When** the Prisma schema is reviewed
    - **Then** a `Dataset` model exists with fields: `id` (UUID, PK), `name` (String), `description` (String, optional), `metadata` (Json), `repositoryUrl` (String), `dvcRemote` (String), `createdBy` (String), `createdAt` (DateTime), `updatedAt` (DateTime), and a relation to `DatasetVersion`

- [ ] **Scenario 2**: DatasetVersion model is defined
    - **Given** the data model specification in Section 2.2
    - **When** the Prisma schema is reviewed
    - **Then** a `DatasetVersion` model exists with fields: `id` (UUID, PK), `datasetId` (UUID, FK to Dataset), `version` (String), `gitRevision` (String), `manifestPath` (String), `documentCount` (Int), `groundTruthSchema` (Json, optional), `status` (DatasetVersionStatus enum), `publishedAt` (DateTime, optional), `createdAt` (DateTime), and relations to `Dataset`, `Split`, `BenchmarkDefinition`

- [ ] **Scenario 3**: Split model is defined
    - **Given** the data model specification in Section 2.3
    - **When** the Prisma schema is reviewed
    - **Then** a `Split` model exists with fields: `id` (UUID, PK), `datasetVersionId` (UUID, FK), `name` (String), `type` (SplitType enum), `sampleIds` (Json), `stratificationRules` (Json, optional), `frozen` (Boolean, default false), `createdAt` (DateTime), and a relation to `DatasetVersion`

- [ ] **Scenario 4**: BenchmarkProject model is defined
    - **Given** the data model specification in Section 2.4
    - **When** the Prisma schema is reviewed
    - **Then** a `BenchmarkProject` model exists with fields: `id` (UUID, PK), `name` (String), `description` (String, optional), `mlflowExperimentId` (String), `createdBy` (String), `createdAt` (DateTime), `updatedAt` (DateTime), and relations to `BenchmarkDefinition` and `BenchmarkRun`

- [ ] **Scenario 5**: BenchmarkDefinition model is defined
    - **Given** the data model specification in Section 2.5
    - **When** the Prisma schema is reviewed
    - **Then** a `BenchmarkDefinition` model exists with fields: `id` (UUID, PK), `projectId` (UUID, FK), `name` (String), `datasetVersionId` (UUID, FK), `splitId` (UUID, FK), `workflowId` (UUID, FK to existing Workflow), `workflowConfigHash` (String), `evaluatorType` (String), `evaluatorConfig` (Json), `runtimeSettings` (Json), `artifactPolicy` (Json), `immutable` (Boolean, default false), `revision` (Int, default 1), `createdAt` (DateTime), `updatedAt` (DateTime), and appropriate relations

- [ ] **Scenario 6**: BenchmarkRun model is defined
    - **Given** the data model specification in Section 2.6
    - **When** the Prisma schema is reviewed
    - **Then** a `BenchmarkRun` model exists with fields: `id` (UUID, PK), `definitionId` (UUID, FK), `status` (BenchmarkRunStatus enum), `mlflowRunId` (String), `temporalWorkflowId` (String), `workerImageDigest` (String, optional), `workerGitSha` (String), `startedAt` (DateTime, optional), `completedAt` (DateTime, optional), `metrics` (Json), `params` (Json), `tags` (Json), `error` (String, optional), `isBaseline` (Boolean, default false), `createdAt` (DateTime), and relations to `BenchmarkDefinition`, `BenchmarkProject`, `BenchmarkArtifact`

- [ ] **Scenario 7**: BenchmarkArtifact model is defined
    - **Given** the data model specification in Section 2.7
    - **When** the Prisma schema is reviewed
    - **Then** a `BenchmarkArtifact` model exists with fields: `id` (UUID, PK), `runId` (UUID, FK), `type` (BenchmarkArtifactType enum), `path` (String), `sampleId` (String, optional), `nodeId` (String, optional), `sizeBytes` (BigInt), `mimeType` (String), `createdAt` (DateTime), and a relation to `BenchmarkRun`

- [ ] **Scenario 8**: BenchmarkAuditLog model is defined
    - **Given** the audit logging requirements in Section 8.4
    - **When** the Prisma schema is reviewed
    - **Then** a `BenchmarkAuditLog` model exists with fields: `id` (UUID, PK), `timestamp` (DateTime), `userId` (String), `action` (AuditAction enum), `entityType` (String), `entityId` (String), `metadata` (Json, optional), and appropriate indexes

- [ ] **Scenario 9**: All enums are defined
    - **Given** the enumeration requirements throughout Section 2
    - **When** the Prisma schema is reviewed
    - **Then** the following enums exist: `DatasetVersionStatus` (draft, published, archived), `SplitType` (train, val, test, golden), `BenchmarkRunStatus` (pending, running, completed, failed, cancelled), `BenchmarkArtifactType` (per_doc_output, intermediate_node_output, diff_report, evaluation_report, error_log), `AuditAction` (dataset_created, version_published, run_started, run_completed, baseline_promoted, artifact_deleted)

- [ ] **Scenario 10**: Foreign key indexes are created
    - **Given** the relational structure of benchmark models
    - **When** the Prisma schema is reviewed
    - **Then** indexes exist on all foreign key columns for query performance (datasetId, datasetVersionId, projectId, definitionId, runId, workflowId, splitId)

- [ ] **Scenario 11**: Migration runs successfully
    - **Given** the new models are added to the Prisma schema
    - **When** `npx prisma migrate dev` is executed
    - **Then** the migration creates all tables, enums, indexes, and foreign key constraints without errors

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/shared/prisma/schema.prisma`
- Run `npm run db:generate` from `apps/backend-services` after schema changes (writes models to both `apps/temporal/src` and `apps/backend-services/src`)
- No changes to existing models -- benchmark models reference the existing `Workflow` model via FK
- See Requirements Section 2 (Core Concepts) and Section 13.3 (Prisma Schema Extension)
- BenchmarkRun has a `projectId` FK for convenience querying even though it can be derived via BenchmarkDefinition.projectId
