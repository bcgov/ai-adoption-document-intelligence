# Benchmarking System — Requirements Specification

> **Status**: DRAFT — Under iterative refinement
> **Feature**: 003-benchmarking-system
> **Last Updated**: 2026-02-13

---

## 1. Goals & Scope

### 1.1 Problem Statement

The platform currently supports arbitrary document intelligence workflows via the DAG workflow engine (graph definitions with 7 node types, 12+ registered activities). There is no built-in mechanism to systematically evaluate workflow quality, compare workflow versions, or detect regressions when graph definitions, activity implementations, or runtime configurations change.

### 1.2 Objectives

- Provide an in-product way to define evaluation datasets with ground truth, run benchmark experiments across workflow/model/engine versions, compute metrics, and detect regressions.
- Support arbitrary document intelligence workflows — OCR is only one possible activity node. The benchmarking system must be workflow-agnostic: it evaluates the outputs of any `GraphWorkflowConfig` execution.
- Support both **schema-aware** evaluation (structured field/table comparison when ground truth schema is known) and **black-box** evaluation (opaque output comparison via custom scoring functions).

### 1.3 Phase Rollout

| Phase | Scope | UI Strategy |
|-------|-------|-------------|
| **Phase 1** | Core data model, dataset management (DVC-backed), benchmark execution via Temporal, evaluation framework, MLflow integration for run tracking | Use MLflow UI for viewing runs, metrics, and artifacts |
| **Phase 2** | Richer React benchmarking UI in the frontend that deep-links into MLflow artifacts, side-by-side comparison, regression reports, baseline management UI | Build custom React views in `apps/frontend` |

### 1.4 Non-Goals (Explicit Exclusions)

- No model training or fine-tuning orchestration (existing `TrainingJob`/`TrainedModel` covers Azure DI training separately).
- No drag-and-drop dataset editor — datasets are managed via DVC + API.
- No multi-tenant isolation (current platform is single-tenant).
- No cloud-specific vendor lock-in — all storage backends should remain pluggable (consistent with existing blob storage abstraction).

---

## 2. Core Concepts (Data Model)

### 2.1 Dataset

A versioned bundle of inputs + ground truth + metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Human-readable dataset name |
| `description` | string | Optional description |
| `metadata` | JSONB | Arbitrary metadata: domain, doc type, language, source, size, tags |
| `dvcRemote` | string | DVC remote identifier for large file storage |
| `repositoryPath` | string | Path within repo where DVC metadata lives |
| `createdBy` | string | User who created the dataset |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

### 2.2 Dataset Version

An immutable pointer to a specific snapshot of the dataset.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `datasetId` | UUID | FK → Dataset |
| `version` | string | Semantic or incremental version label |
| `gitRevision` | string | Git commit SHA / tag that pins DVC metadata |
| `manifestPath` | string | Path to the dataset manifest file within the repo |
| `documentCount` | int | Number of documents/samples in this version |
| `groundTruthSchema` | JSONB | Schema describing the ground truth format |
| `status` | enum | `draft`, `published`, `archived` |
| `publishedAt` | DateTime? | When the version was published |
| `createdAt` | DateTime | Creation timestamp |

### 2.3 Split

Defines a subset of a dataset version for evaluation purposes.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `datasetVersionId` | UUID | FK → DatasetVersion |
| `name` | string | Split name (e.g., `test`, `val`, `golden-regression`) |
| `type` | enum | `train`, `val`, `test`, `golden` |
| `sampleIds` | JSONB | Array of sample identifiers included in this split |
| `stratificationRules` | JSONB? | Rules used to create stratified splits |
| `frozen` | boolean | If true, split contents cannot be modified |
| `createdAt` | DateTime | Creation timestamp |

### 2.4 Benchmark Project

Logical grouping for benchmark experiments. Maps to an MLflow Experiment.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Project name |
| `description` | string? | Optional description |
| `mlflowExperimentId` | string | Corresponding MLflow Experiment ID |
| `createdBy` | string | Creator |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

### 2.5 Benchmark Definition

Specifies exactly what to benchmark: which dataset, workflow, evaluator, and runtime settings.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `projectId` | UUID | FK → BenchmarkProject |
| `name` | string | Definition name |
| `datasetVersionId` | UUID | FK → DatasetVersion |
| `splitId` | UUID | FK → Split |
| `workflowId` | UUID | FK → Workflow (existing model) |
| `workflowConfigHash` | string | SHA-256 hash of the workflow config at definition time |
| `evaluatorType` | string | Evaluator identifier (from evaluator registry) |
| `evaluatorConfig` | JSONB | Evaluator-specific configuration |
| `runtimeSettings` | JSONB | Concurrency limits, timeouts, resource class, etc. |
| `artifactPolicy` | JSONB | What artifacts to store (full, failures-only, sampled, redacted) |
| `immutable` | boolean | Becomes true once a run has been executed against this definition |
| `revision` | int | Incremented when a new revision is created from an immutable definition |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

### 2.6 Benchmark Run

One execution instance of a Benchmark Definition. Maps to an MLflow Run.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `definitionId` | UUID | FK → BenchmarkDefinition |
| `status` | enum | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `mlflowRunId` | string | Corresponding MLflow Run ID |
| `temporalWorkflowId` | string | Temporal workflow execution ID |
| `workerImageDigest` | string? | Docker/OCI image digest of the Temporal worker |
| `workerGitSha` | string | Git SHA of the worker codebase |
| `startedAt` | DateTime? | When execution started |
| `completedAt` | DateTime? | When execution completed |
| `metrics` | JSONB | Aggregated metrics computed by evaluator |
| `params` | JSONB | Run parameters logged to MLflow |
| `tags` | JSONB | Run tags logged to MLflow |
| `error` | string? | Error message if failed |
| `isBaseline` | boolean | Whether this run is marked as the baseline for comparisons |
| `createdAt` | DateTime | Creation timestamp |

### 2.7 Benchmark Artifact

Output files produced during execution or evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `runId` | UUID | FK → BenchmarkRun |
| `type` | enum | `per_doc_output`, `intermediate_node_output`, `diff_report`, `evaluation_report`, `error_log` |
| `path` | string | Storage path (blob storage or MLflow artifact store) |
| `sampleId` | string? | Specific sample this artifact pertains to |
| `nodeId` | string? | Graph node that produced this artifact |
| `sizeBytes` | bigint | File size |
| `mimeType` | string | Content type |
| `createdAt` | DateTime | Creation timestamp |

---

## 3. Dataset Management (DVC-Backed)

### 3.1 Storage Architecture

- **DVC metadata** stored in the same Git repository (co-located with project code for now).
- **Large data files** (actual documents, images, ground truth files) stored in a configurable DVC remote (S3, MinIO, NFS, or local filesystem).
- Follows the existing blob storage abstraction pattern from `apps/temporal/src/blob-storage/`.

### 3.2 Dataset Materialization

- Workers (Temporal activities) must be able to fetch a pinned dataset snapshot for a given Git revision.
- Materialization methods: `dvc pull` for tracked files or `dvc get` for registry-style downloads.
- Materialized datasets are cached on the worker filesystem to avoid redundant fetches across runs.

### 3.3 Dataset Manifest Format

- Standardize a canonical input representation: list of files with paths and metadata.
- Standardize ground truth representation: support multiple ground truth schemas per workflow family (since different workflows may produce different output structures).
- Manifest is a JSON file checked into the repo alongside DVC files.

### 3.4 Normalization Pipeline

- Ingest from multiple sources: production database dumps, synthetic data, external exports.
- Transform into canonical input format.
- Validate against manifest schema.
- Commit and publish as a new dataset version.

### 3.5 Data Quality Checks

- Schema validation against declared ground truth schema.
- Missing ground truth detection.
- Duplicate detection (by content hash or metadata).
- Corruption checks (file integrity, format validation).
- Optional sampling previews (show N random samples before publishing).

### 3.6 Split Management

- Create/edit splits with named subsets of samples.
- Stratification by metadata fields (e.g., equal distribution across document types).
- Freeze golden regression sets (immutable after freeze).
- Split definitions recorded as versioned artifacts.

---

## 4. Benchmark Execution (Temporal)

### 4.1 Run Orchestration

A new Temporal workflow type (`benchmarkRunWorkflow`) that:

1. Materializes the pinned dataset version on the worker.
2. Fans out per document using the existing `map` node pattern.
3. For each document, executes the referenced `GraphWorkflowConfig` (invokes the existing `graphWorkflow` as a child workflow).
4. Collects all outputs.
5. Runs the configured evaluator against (predictions, ground truth).
6. Logs params, metrics, and artifacts to MLflow.
7. Updates the `BenchmarkRun` record in Postgres with final status and metrics.

### 4.2 Concurrency Controls

- **Per-run concurrency**: configurable max parallel documents within a single benchmark run.
- **Global concurrency**: configurable limit on total concurrent benchmark documents across all runs.
- **Queue priorities**: benchmark runs can be prioritized (e.g., nightly regression runs get higher priority).
- **Timeouts & retries**: per-document and per-run timeouts, with configurable retry policies.
- **Resource class selection**: ability to route benchmark runs to specific task queues (e.g., CPU vs GPU workers).

### 4.3 Determinism Safety

- Add replay-test coverage in CI for workflow changes to reduce non-determinism risk in Temporal workflows.
- Benchmark workflow itself should be deterministic — side effects only in activities.

### 4.4 Re-run Capability

- Re-run a prior benchmark using the exact same dataset version + workflow config hash + runtime settings.
- Creates a new `BenchmarkRun` record linked to the same `BenchmarkDefinition`.

---

## 5. Evaluation System

### 5.1 Pluggable Evaluator Interface

```typescript
interface BenchmarkEvaluator {
  type: string;
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}

interface EvaluationInput {
  sampleId: string;
  input: unknown;            // Original document/input data
  prediction: unknown;       // Workflow output
  groundTruth: unknown;      // Expected output
  metadata: Record<string, unknown>; // Sample metadata
}

interface EvaluationResult {
  sampleId: string;
  metrics: Record<string, number>;        // Per-sample metrics
  diagnostics: Record<string, unknown>;   // Per-sample diagnostics
  artifacts?: EvaluationArtifact[];       // Optional output files (diffs, visualizations)
  pass: boolean;                          // Pass/fail based on evaluator thresholds
}
```

### 5.2 Schema-Aware Evaluators

- Field-level comparison: precision, recall, F1 per field.
- Table-level comparison: row matching, cell accuracy.
- Configurable matching rules: exact match, fuzzy match, numeric tolerance, date format normalization.
- Typed metrics per field type (string similarity for text, absolute/relative error for numbers, etc.).

### 5.3 Black-Box Evaluators

- Custom scoring functions that treat outputs as opaque (JSON, text, binary).
- Emit arbitrary named metrics.
- Useful for comparing workflow outputs where ground truth schema is not formalized.

### 5.4 Aggregation

- Compute dataset-level metrics from per-sample results.
- Support confidence intervals or distribution statistics (mean, median, std, percentiles).
- Slicing by metadata dimensions: document type, page count, language, source, etc.
- Aggregated metrics stored in `BenchmarkRun.metrics` and logged to MLflow.

### 5.5 Failure Analysis

- Top-N worst-performing samples (by any metric, configurable).
- Per-field error breakdown (when schema-aware evaluator is used).
- Error clustering tags (group failures by error type/pattern).

---

## 6. Experiment Tracking (MLflow)

### 6.1 MLflow Integration

- Every `BenchmarkRun` is logged to MLflow as an MLflow Run within the corresponding MLflow Experiment (mapped from `BenchmarkProject`).
- Log: params, metrics, artifacts, and run tags.
- Runs are searchable and comparable via the MLflow UI (Phase 1).

### 6.2 Required Run Metadata

Every MLflow run must include at minimum:

| Category | Key | Source |
|----------|-----|--------|
| **Param** | `dataset_version_id` | BenchmarkDefinition.datasetVersionId |
| **Param** | `dataset_git_revision` | DatasetVersion.gitRevision |
| **Param** | `workflow_config_hash` | BenchmarkDefinition.workflowConfigHash |
| **Param** | `evaluator_type` | BenchmarkDefinition.evaluatorType |
| **Param** | `evaluator_config_hash` | Hash of evaluator config |
| **Tag** | `worker_image_digest` | BenchmarkRun.workerImageDigest |
| **Tag** | `worker_git_sha` | BenchmarkRun.workerGitSha |
| **Tag** | `benchmark_run_id` | BenchmarkRun.id |
| **Tag** | `benchmark_definition_id` | BenchmarkDefinition.id |
| **Tag** | `benchmark_project_id` | BenchmarkProject.id |

### 6.3 Artifact Storage

- Configure MLflow artifact store backend (local filesystem, S3, MinIO).
- Artifact upload policy per run (controlled by `BenchmarkDefinition.artifactPolicy`):
  - `full`: Upload all outputs for all samples.
  - `failures_only`: Upload outputs only for failing samples.
  - `sampled`: Upload a configurable percentage of outputs.
  - `redacted`: Apply redaction before upload.

### 6.4 Linkage

- Store `mlflowRunId` in Postgres `BenchmarkRun` record.
- Store `temporalWorkflowId` in Postgres `BenchmarkRun` record.
- Frontend can deep-link to MLflow UI for detailed inspection (Phase 1).
- Frontend provides native drill-down (Phase 2).

---

## 7. Versioning & Reproducibility

### 7.1 Workflow Versioning

- Leverages existing `Workflow.version` and `configHash` (`config-hash.ts` in `apps/temporal/src`).
- `BenchmarkDefinition.workflowConfigHash` pins the exact workflow config at definition time.
- If the workflow is updated after a definition is created, the definition retains the original hash (immutable once executed).

### 7.2 Engine/Runtime Versioning

- Record worker image digest / OCI hash per run.
- Record worker Git SHA per run.
- Optionally record dependency lockfile hashes.
- Config snapshot stored in MLflow params.

### 7.3 Dataset Versioning

- `DatasetVersion.gitRevision` pins exact Git commit + DVC state.
- Never benchmark against a "moving" dataset reference by default (must use a published version).
- Draft versions can be used for ad-hoc testing but are flagged in results.

### 7.4 Configuration Immutability

- `BenchmarkDefinition.immutable` becomes `true` after the first run executes.
- Editing an immutable definition creates a new revision (increments `revision` field, new `id`).

### 7.5 Regression Baselines

- Mark a `BenchmarkRun` as `isBaseline = true`.
- Compare new runs against baseline with configurable thresholds.
- Alert/flag when metrics regress beyond thresholds.

---

## 8. Storage, Retention & Privacy

### 8.1 Storage Backends

| Data Type | Backend | Notes |
|-----------|---------|-------|
| Benchmark metadata | Postgres | Same database as existing app (extends Prisma schema) |
| Large artifacts | Blob storage | Extends existing blob storage abstraction |
| Dataset binaries | DVC remote | S3/MinIO/NFS, configurable |
| MLflow backend store | Postgres | MLflow's own metadata DB (can share or separate instance) |
| MLflow artifact store | Blob storage | Aligned with blob storage backend |

### 8.2 Retention Policies

- Per-project retention settings for each artifact class:
  - Raw outputs: configurable (e.g., 90 days).
  - Diff reports: configurable (e.g., 180 days).
  - Intermediate node traces: configurable (e.g., 30 days).
- Baseline runs are exempt from retention (never auto-deleted).

### 8.3 Redaction / PII

- Configurable redaction steps applied before artifact upload.
- Per-run toggle for storing raw documents vs. redacted copies.
- Redaction pipeline runs as a post-processing step in the benchmark workflow.

### 8.4 Audit Logging

- Log events: dataset creation, version publishing, run start/complete, baseline promotion, artifact deletion.
- Store audit events in Postgres with timestamp, user, action, and target entity.

---

## 9. Security & Access Control

### 9.1 Authentication & Authorization

- Leverages existing OIDC-based auth from `apps/backend-services/src/auth/`.
- Roles: Admin, Engineer, Analyst, Reviewer.
- Per-project permissions for benchmark projects.

### 9.2 Secrets Management

- Credentials for DVC remote access.
- Credentials for MLflow backend and artifact store.
- Managed via environment variables (consistent with existing `.env` pattern).

### 9.3 Isolation Boundaries

- Project-level isolation: users can only access benchmark projects they have permission for.
- Least privilege for viewing documents/artifacts within benchmark results.

---

## 10. UI/UX Requirements

### 10.1 Phase 1 — MLflow-Backed UI

Minimal in-app UI that leverages MLflow for heavy lifting:

- **Dataset UI**: Create/import datasets, browse versions, preview samples, define splits, validate, publish.
- **Benchmark UI**: Create benchmark definitions (select dataset version + workflow + evaluator + runtime settings + artifact policy).
- **Run UI**: Start/cancel runs, track progress (polling `BenchmarkRun.status`), link to Temporal execution in Temporal UI (existing port 8088).
- **Results UI**: List runs with headline metrics, link to MLflow UI for deep inspection of metrics, parameters, and artifacts.
- **Baseline Management**: Promote a run to baseline, show pass/fail status.

### 10.2 Phase 2 — Rich React Benchmarking UI

Build custom views within `apps/frontend`:

- **Run Comparison**: Side-by-side comparison of two or more runs.
- **Regression Reports**: Highlight metrics that regressed beyond thresholds.
- **Slicing & Filtering**: Filter results by metadata dimensions (doc type, language, page count, etc.).
- **Drill-Down Panels**: Pluggable workflow-specific panels for detailed result inspection.
- **Artifact Viewer**: In-app viewing of artifacts with deep-links to MLflow artifacts.

### 10.3 Navigation

- Add a "Benchmarking" section to the existing sidebar navigation in `apps/frontend/src/App.tsx`.
- Sub-views: Datasets, Projects, Definitions, Runs, Results.

---

## 11. APIs & Integration Points (NestJS)

### 11.1 Dataset APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/benchmark/datasets` | Create a new dataset |
| GET | `/api/benchmark/datasets` | List datasets |
| GET | `/api/benchmark/datasets/:id` | Get dataset details |
| POST | `/api/benchmark/datasets/:id/versions` | Publish a new version |
| GET | `/api/benchmark/datasets/:id/versions` | List versions |
| GET | `/api/benchmark/datasets/:id/versions/:versionId` | Get version details |
| POST | `/api/benchmark/datasets/:id/versions/:versionId/validate` | Validate version data quality |
| POST | `/api/benchmark/datasets/:id/versions/:versionId/splits` | Create a split |
| GET | `/api/benchmark/datasets/:id/versions/:versionId/splits` | List splits |
| PUT | `/api/benchmark/datasets/:id/versions/:versionId/splits/:splitId` | Update a split |

### 11.2 Benchmark APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/benchmark/projects` | Create a benchmark project |
| GET | `/api/benchmark/projects` | List projects |
| GET | `/api/benchmark/projects/:id` | Get project details |
| POST | `/api/benchmark/projects/:id/definitions` | Create a benchmark definition |
| GET | `/api/benchmark/projects/:id/definitions` | List definitions |
| GET | `/api/benchmark/projects/:id/definitions/:defId` | Get definition details |
| POST | `/api/benchmark/projects/:id/definitions/:defId/runs` | Start a benchmark run |
| GET | `/api/benchmark/projects/:id/runs` | List runs for a project |
| GET | `/api/benchmark/projects/:id/runs/:runId` | Get run details + metrics |
| POST | `/api/benchmark/projects/:id/runs/:runId/cancel` | Cancel a running benchmark |
| POST | `/api/benchmark/projects/:id/runs/:runId/baseline` | Promote run to baseline |
| GET | `/api/benchmark/projects/:id/runs/:runId/artifacts` | List run artifacts |
| GET | `/api/benchmark/projects/:id/runs/:runId/drill-down` | Get detailed drill-down summary |

### 11.3 Integration Services

| Service | Location | Responsibility |
|---------|----------|----------------|
| `MlflowClientService` | `apps/backend-services/src/benchmark/` | Wrap MLflow REST API — log params, metrics, artifacts, manage experiments |
| `DvcMaterializerService` | `apps/backend-services/src/benchmark/` | Fetch dataset for a Git revision via DVC CLI |
| `BenchmarkTemporalService` | `apps/backend-services/src/benchmark/` | Start/cancel/query benchmark Temporal workflows |
| `EvaluatorRegistryService` | `apps/backend-services/src/benchmark/` | Registry of available evaluators (mirrors activity registry pattern) |

### 11.4 Temporal Activities (New)

| Activity Type | Description |
|---------------|-------------|
| `benchmark.materializeDataset` | Pull dataset files for a pinned Git revision |
| `benchmark.executeWorkflow` | Run GraphWorkflowConfig against a single document |
| `benchmark.evaluate` | Run evaluator on (prediction, ground truth) pair |
| `benchmark.logToMlflow` | Log run params, metrics, artifacts to MLflow |
| `benchmark.aggregate` | Compute aggregate metrics across all samples |
| `benchmark.cleanup` | Clean up temporary materialized files |

---

## 12. Operational Requirements

### 12.1 Deployment

- Self-hosted OSS stack.
- New containerized service: **MLflow server** (added to docker-compose).
- MLflow artifact store backend: initially local filesystem (aligned with existing blob storage), configurable to S3/MinIO.
- MLflow backend store: can share the existing Postgres instance or use a separate one.

### 12.2 Observability

- Logs/metrics/traces for benchmark runs (leverage existing Temporal observability).
- Per-node timing and cost accounting (record execution time per graph node per document).
- Benchmark-specific dashboard (metrics: runs/day, avg run duration, failure rate).

### 12.3 Cost Controls

- Quotas: max documents/pages per run, max concurrent runs.
- Scheduled runs: support cron-style scheduling for nightly regression benchmarks.
- Cache reuse: cache materialized datasets to avoid re-fetching from DVC remote.

### 12.4 CI/CD Integration

- Automated replay tests for Temporal benchmark workflows.
- Optional scheduled benchmark suites triggered from CI for regression detection.
- CLI/API for triggering benchmark runs from CI pipelines.

---

## 13. Architectural Alignment with Existing System

### 13.1 How Benchmarking Fits the DAG Workflow Engine

The benchmarking system reuses the existing graph workflow engine rather than replacing it:

- A **Benchmark Run** executes the same `graphWorkflow` Temporal workflow function that production documents use.
- The benchmark orchestrator wraps this: it fans out across all dataset samples, each invoking `graphWorkflow` as a child workflow.
- This ensures benchmarks test the **actual execution path** — no separate "benchmark mode" engine.

### 13.2 Evaluator Registry Pattern

Mirrors the existing Activity Registry pattern (`apps/temporal/src/activity-registry.ts`):

- Evaluators are registered by type string.
- Each evaluator has a `type`, `evaluate()` function, and default config.
- New evaluators can be added without code changes to the orchestrator.

### 13.3 Prisma Schema Extension

New models are added to `apps/shared/prisma/schema.prisma` alongside existing models. No changes to existing models — the benchmark system references `Workflow` via foreign key but does not modify it.

### 13.4 Module Structure

New NestJS module: `apps/backend-services/src/benchmark/` containing:
- `benchmark.module.ts`
- `benchmark.controller.ts`
- `benchmark.service.ts`
- `dataset.service.ts`
- `mlflow-client.service.ts`
- `evaluator-registry.service.ts`
- `dvc-materializer.service.ts`

New Temporal workflow and activities in `apps/temporal/src/`:
- `benchmark-workflow.ts`
- `activities/benchmark-*.ts`

---

## 14. Open Questions & Decisions Needed

> These will be resolved through the iterative refinement process.

1. **DVC repository structure**: Should DVC metadata live in this repo or a separate dataset repo?
2. **MLflow deployment model**: Shared Postgres instance or separate database for MLflow?
3. **Evaluator extensibility**: Should evaluators be JavaScript/TypeScript functions only, or support external scripts (Python, etc.)?
4. **Ground truth format**: What canonical format(s) should ground truth support? JSON-only, or also CSV/JSONL/Parquet?
5. **Scheduled runs**: Should cron scheduling be managed by Temporal schedules, a separate scheduler, or CI-only?
6. **Artifact redaction**: What redaction capabilities are needed? Regex-based PII scrubbing, field-level omission, or full document anonymization?
7. **Phase 1 vs Phase 2 boundary**: What specific UI features are required for Phase 1 MVP vs deferred to Phase 2?
