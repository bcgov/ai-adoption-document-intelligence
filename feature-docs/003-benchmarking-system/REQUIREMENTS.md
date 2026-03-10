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
| **Phase 1** | Core data model, dataset management (DVC-backed), benchmark execution via Temporal, evaluation framework (black-box + simple schema-aware), MLflow integration for run tracking, basic frontend UI (dataset list, definition CRUD, run list, start/cancel, deep-links to MLflow) | Use MLflow UI for detailed run/metrics/artifact inspection |
| **Phase 1.5** | Dataset validation & quality checks (beyond minimal completeness), split management UI, baseline management (promote run + compare thresholds), scheduled/nightly runs | Incremental frontend additions |
| **Phase 2** | Rich React benchmarking UI: side-by-side run comparison, regression reports, slicing/filtering, drill-down panels, in-app artifact viewer with deep-links into MLflow artifacts | Full custom React views in `apps/frontend` |

### 1.4 Non-Goals (Explicit Exclusions)

- No model training or fine-tuning orchestration (existing `TrainingJob`/`TrainedModel` covers Azure DI training separately).
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
| `repositoryUrl` | string | URL of the dedicated dataset Git repository |
| `dvcRemote` | string | DVC remote identifier (e.g., MinIO bucket name) |
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
| `gitRevision` | string | Git commit SHA / tag that pins DVC metadata in the dataset repo |
| `manifestPath` | string | Path to the dataset manifest file within the dataset repo |
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
| `artifactPolicy` | JSONB | What artifacts to store (full, failures-only, sampled) |
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
| `path` | string | Storage path (MinIO key or MLflow artifact path) |
| `sampleId` | string? | Specific sample this artifact pertains to |
| `nodeId` | string? | Graph node that produced this artifact |
| `sizeBytes` | bigint | File size |
| `mimeType` | string | Content type |
| `createdAt` | DateTime | Creation timestamp |

---

## 3. Dataset Management (DVC-Backed)

### 3.1 Storage Architecture

- **DVC metadata** stored in a **dedicated dataset Git repository**, separate from the main application repository. This avoids bloating the application repo with dataset metadata commits and allows independent dataset versioning.
- **Large data files** (documents, images, ground truth files) stored in **MinIO** (S3-compatible object storage), configured as the DVC remote.
- **MinIO** is the unified object storage backend for both DVC remotes and benchmark artifacts. It provides S3-compatible semantics, is self-hostable, and scales beyond local filesystem.
- MinIO is added to the docker-compose infrastructure alongside PostgreSQL and Temporal.

### 3.2 Dataset Upload & DVC Automation

Users create and manage datasets through the **frontend UI**. The backend automates all DVC operations transparently:

1. User uploads files (documents + ground truth) via the frontend.
2. Backend receives files, writes them to the dataset repository working directory.
3. Backend runs `dvc add` on the uploaded files to track them.
4. Backend commits DVC metadata (`.dvc` files + manifest) to Git.
5. Backend runs `dvc push` to push large files to the MinIO remote.
6. Backend creates/updates the `DatasetVersion` record in Postgres with the Git commit SHA.

This flow is exposed through the Dataset APIs and orchestrated by the `DvcService` in the backend. Users never interact with DVC or Git directly.

### 3.3 Dataset Materialization

- Temporal workers (benchmark activities) fetch a pinned dataset snapshot for a given Git revision from the dataset repo.
- Materialization methods: `dvc pull` in a checked-out revision of the dataset repo, or `dvc get` for registry-style downloads.
- Materialized datasets are cached on the worker filesystem to avoid redundant fetches across runs.

### 3.3a Repository URL Portability & Testing

To support portable configuration across development environments and automated testing:

**Tilde Expansion**:
- Repository URLs support tilde (`~`) expansion to the user's home directory
- Formats: `~/path/to/repo` or `file://~/path/to/repo`
- Example: `~/Github/datasets-repo` expands to `/home/username/Github/datasets-repo`
- Remote URLs (`https://`, `git@`) are not affected by tilde expansion
- Environment variable `DEFAULT_DATASET_REPOSITORY_PATH` can provide a default location with tilde support

**Test Utilities**:
- Helper functions for creating temporary, isolated dataset repositories in automated tests
- `createTempDatasetRepo()` creates a fully initialized Git repository in `/tmp` with auto-cleanup
- Enables portable e2e tests without hardcoded usernames or paths
- Located in `apps/backend-services/src/testUtils/datasetTestHelpers.ts`

**Benefits**:
- Developers don't need to hardcode usernames in dataset URLs
- Tests run reliably across different machines and CI environments
- Production deployments can use environment-specific paths
- Supports local file:// URLs, remote HTTPS URLs, and SSH URLs uniformly

### 3.4 Dataset Manifest Format

The storage primitive is **arbitrary files + manifest**. The manifest is a JSON file in the dataset repo that describes all samples:

```json
{
  "schemaVersion": "1.0",
  "samples": [
    {
      "id": "sample-001",
      "inputs": [
        { "path": "inputs/form_image_0.jpg", "mimeType": "image/jpeg" }
      ],
      "groundTruth": [
        { "path": "ground-truth/form_data_0.json", "format": "json" }
      ],
      "metadata": {
        "docType": "income-declaration",
        "pageCount": 1,
        "language": "en",
        "source": "synthetic"
      }
    }
  ]
}
```

**Ground truth format conventions** (built on top of the arbitrary-files primitive):
- **JSON**: For small/structured ground truth (e.g., key-value extractions like the example data — flat objects with checkbox booleans, text fields, income values, signatures, dates).
- **JSONL**: For large datasets with per-sample records.
- **CSV/Parquet**: For tabular ground truth.
- **Any file**: Ground truth can reference images, PDFs, or other binary files when needed.

The evaluator receives file references and is responsible for parsing the format appropriate to its evaluation mode.

### 3.5 Example Ground Truth (from existing example data)

The [example data](feature-docs/003-benchmarking-system/example%20data/) demonstrates a typical key-value extraction ground truth format:

- **Inputs**: Form images (`form_image_0.jpg`, `form_image_1.jpg`).
- **Ground truth**: JSON files (`form_data_0.json`, `form_data_1.json`) containing flat key-value pairs extracted from the forms:
  - Checkbox fields: `"checkbox_need_assistance_no": true`
  - Text fields: `"explain_changes": "..."`
  - Numeric fields: `"income1": "999.91"`
  - Identity fields: `"name": "Edward Shaw"`, `"sin": "104125381"`
  - Date fields: `"date": "2013-09-21"`
  - Signature fields: `"signature": "Edward Shaw"`

This format is workflow-output-agnostic — the evaluator compares workflow outputs against these ground truth files using the configured matching rules.

### 3.6 Normalization Pipeline

- Ingest from multiple sources: production database dumps, synthetic data, external exports.
- Transform into canonical input format (files + manifest entries).
- Validate against manifest schema.
- Commit and publish as a new dataset version via the automated DVC flow (Section 3.2).

### 3.7 Data Quality Checks (Phase 1.5)

- Schema validation against declared ground truth schema.
- Missing ground truth detection (inputs without matching ground truth files).
- Duplicate detection (by content hash or metadata).
- Corruption checks (file integrity, format validation).
- Optional sampling previews (show N random samples before publishing).

### 3.8 Split Management (Phase 1.5)

- Create/edit splits with named subsets of samples.
- Stratification by metadata fields (e.g., equal distribution across document types).
- Freeze golden regression sets (immutable after freeze).
- Split definitions recorded as versioned artifacts.
- Phase 1: splits can be defined as config in the dataset repo; Phase 1.5 adds UI management.

---

## 4. Benchmark Execution (Temporal)

### 4.1 Task Queue Isolation

Benchmark runs execute on a **dedicated task queue** (`benchmark-processing`), separate from the production `ocr-processing` queue. This prevents benchmark traffic from starving production workloads.

- Same worker code is reused, but separate worker deployments (or separate pollers) are configured with their own concurrency limits and scaling rules.
- An explicit, privileged option can route benchmark runs to the production queue for "production-like load testing" scenarios — this requires deliberate opt-in.

### 4.2 Run Orchestration

A new Temporal workflow type (`benchmarkRunWorkflow`) that:

1. Materializes the pinned dataset version on the worker (pulls from dataset repo + MinIO via DVC).
2. Fans out per document using the existing `map` node pattern.
3. For each document, executes the referenced `GraphWorkflowConfig` (invokes the existing `graphWorkflow` as a child workflow on the `benchmark-processing` queue).
4. Collects all outputs.
5. Runs the configured evaluator against (predictions, ground truth) per sample.
6. Aggregates metrics across all samples.
7. Logs params, metrics, and artifacts to MLflow.
8. Updates the `BenchmarkRun` record in Postgres with final status and metrics.

### 4.3 Concurrency Controls

- **Per-run concurrency**: configurable max parallel documents within a single benchmark run.
- **Global concurrency**: configurable limit on total concurrent benchmark documents across all runs.
- **Queue priorities**: benchmark runs can be prioritized (e.g., nightly regression runs get higher priority).
- **Timeouts & retries**: per-document and per-run timeouts, with configurable retry policies.
- **Resource class selection**: ability to route benchmark runs to specific task queues (e.g., CPU vs GPU workers).

### 4.4 Determinism Safety

- Add replay-test coverage in CI for workflow changes to reduce non-determinism risk in Temporal workflows.
- Benchmark workflow itself should be deterministic — side effects only in activities.

### 4.5 Re-run Capability

- Re-run a prior benchmark using the exact same dataset version + workflow config hash + runtime settings.
- Creates a new `BenchmarkRun` record linked to the same `BenchmarkDefinition`.

---

## 5. Evaluation System

### 5.1 Pluggable Evaluator Interface

TypeScript evaluators are the default implementation. The interface is designed so that external evaluators (e.g., Python via subprocess/sidecar) can be added later without refactoring core concepts.

```typescript
interface BenchmarkEvaluator {
  type: string;
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}

interface EvaluationInput {
  sampleId: string;
  inputPaths: string[];                    // Paths to input files (materialized)
  predictionPaths: string[];               // Paths to workflow output files
  groundTruthPaths: string[];              // Paths to ground truth files
  metadata: Record<string, unknown>;       // Sample metadata from manifest
  evaluatorConfig: Record<string, unknown>; // Evaluator-specific config
}

interface EvaluationResult {
  sampleId: string;
  metrics: Record<string, number>;         // Per-sample metrics
  diagnostics: Record<string, unknown>;    // Per-sample diagnostics
  artifacts?: EvaluationArtifact[];        // Optional output files (diffs, visualizations)
  pass: boolean;                           // Pass/fail based on evaluator thresholds
}
```

**Extensibility for external evaluators**: The `EvaluationInput` uses file paths rather than in-memory objects, making it straightforward to serialize inputs to a subprocess boundary (e.g., invoke a Python script that reads the same files and returns `EvaluationResult` as JSON). This is not implemented in Phase 1 but the interface accommodates it.

### 5.2 Schema-Aware Evaluators

For workflows that produce structured output matching a known ground truth schema (e.g., key-value extraction as in the example data):

- **Field-level comparison**: precision, recall, F1 per field.
- **Table-level comparison**: row matching, cell accuracy.
- **Configurable matching rules**: exact match, fuzzy match (Levenshtein/Jaro-Winkler), numeric tolerance, date format normalization.
- **Typed metrics per field type**: string similarity for text, absolute/relative error for numbers, checkbox accuracy for booleans, date parsing equivalence.

Phase 1 includes a simple schema-aware evaluator that compares flat JSON key-value outputs (matching the example ground truth format).

### 5.3 Black-Box Evaluators

- Custom scoring functions that treat outputs as opaque (JSON, text, binary).
- Emit arbitrary named metrics.
- Useful for comparing workflow outputs where ground truth schema is not formalized, or for novel evaluation criteria.

Phase 1 includes a basic black-box evaluator (e.g., JSON deep-equal with diff output).

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

### 6.1 MLflow Deployment

- MLflow server runs as a **new containerized service** added to docker-compose.
- **Backend store**: Separate database (`mlflow`) on the **same PostgreSQL 15 instance** used by the application, with a dedicated role and schema discipline. MLflow supports PostgreSQL backend stores via SQLAlchemy — this is the standard production pattern for collaborative usage.
- **Artifact store**: MinIO (S3-compatible), shared with the DVC remote. MLflow is configured with `--default-artifact-root s3://mlflow-artifacts/` pointing to MinIO.
- This keeps infrastructure simple (one Postgres server, one object store) while maintaining logical separation.

### 6.2 MLflow Integration

- Every `BenchmarkRun` is logged to MLflow as an MLflow Run within the corresponding MLflow Experiment (mapped from `BenchmarkProject`).
- Log: params, metrics, artifacts, and run tags.
- Runs are searchable and comparable via the MLflow UI (Phase 1).

### 6.3 Required Run Metadata

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

### 6.4 Artifact Storage

- MLflow artifact store uses MinIO (S3-compatible).
- Artifact upload policy per run (controlled by `BenchmarkDefinition.artifactPolicy`):
  - `full`: Upload all outputs for all samples.
  - `failures_only`: Upload outputs only for failing samples.
  - `sampled`: Upload a configurable percentage of outputs.

### 6.5 Linkage

- Store `mlflowRunId` in Postgres `BenchmarkRun` record.
- Store `temporalWorkflowId` in Postgres `BenchmarkRun` record.
- Frontend deep-links to MLflow UI for detailed inspection (Phase 1).
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

- `DatasetVersion.gitRevision` pins exact Git commit + DVC state in the dedicated dataset repository.
- Never benchmark against a "moving" dataset reference by default (must use a published version).
- Draft versions can be used for ad-hoc testing but are flagged in results.

### 7.4 Configuration Immutability

- `BenchmarkDefinition.immutable` becomes `true` after the first run executes.
- Editing an immutable definition creates a new revision (increments `revision` field, new `id`).

### 7.5 Regression Baselines (Phase 1.5)

- Mark a `BenchmarkRun` as `isBaseline = true`.
- Compare new runs against baseline with configurable thresholds.
- Alert/flag when metrics regress beyond thresholds.

---

## 8. Storage, Retention & Infrastructure

### 8.1 Storage Architecture

| Data Type | Backend | Notes |
|-----------|---------|-------|
| Benchmark metadata | Postgres 15 | Same instance as existing app, extends Prisma schema |
| MLflow backend store | Postgres 15 | Same instance, separate `mlflow` database with dedicated role |
| Dataset binaries (DVC) | MinIO | S3-compatible, self-hosted, DVC remote |
| Benchmark artifacts | MinIO | MLflow artifact store, same MinIO instance |
| Benchmark run outputs | MinIO | Per-run output files stored via `BlobStorageInterface` |

**MinIO** serves as the unified object storage layer for all large file storage needs (DVC data, MLflow artifacts, benchmark outputs). This consolidates storage infrastructure and provides S3-compatible APIs that work with DVC, MLflow, and the application's blob storage abstraction.

### 8.2 Blob Storage Integration

The existing codebase has two blob storage implementations:
- **`LocalBlobStorageService`**: Implements `BlobStorageInterface` (write/read/exists/delete with string keys). Used for document storage.
- **`BlobStorageService`**: Azure-specific operations (container management, SAS URLs, batch uploads). Used for training data.

For benchmarking, MinIO is introduced as the primary object store. The approach:
- Add a new **`MinioBlobStorageService`** that implements the existing `BlobStorageInterface` using the S3-compatible MinIO API (via AWS SDK or MinIO client).
- Benchmark activities use this service for reading/writing dataset files and artifacts.
- Existing `LocalBlobStorageService` and Azure `BlobStorageService` remain unchanged — they continue serving their current roles.
- Configuration determines which blob storage implementation is injected for benchmark operations (MinIO by default).

### 8.3 Retention Policies

- Per-project retention settings for each artifact class:
  - Raw outputs: configurable (e.g., 90 days).
  - Diff reports: configurable (e.g., 180 days).
  - Intermediate node traces: configurable (e.g., 30 days).
- Baseline runs are exempt from retention (never auto-deleted).

### 8.4 Audit Logging

- Log events: dataset creation, version publishing, run start/complete, baseline promotion, artifact deletion.
- Store audit events in Postgres with timestamp, user, action, and target entity.

---

## 9. Security & Access Control

Uses the existing OIDC-based authentication from `apps/backend-services/src/auth/`. No new roles or permission models are introduced — all authenticated users can access benchmarking features. This is consistent with the current single-tenant deployment model.

Secrets management for new services:
- MinIO access credentials (access key + secret key) managed via environment variables.
- MLflow backend store database credentials managed via environment variables.
- Dataset repository Git credentials (for clone/pull operations) managed via environment variables.
- Consistent with the existing `.env` pattern used throughout the project.

---

## 10. UI/UX Requirements

### 10.1 Phase 1 — Basic Benchmarking UI + MLflow

In-app UI for managing benchmark entities, with MLflow UI for detailed metrics/artifact inspection:

- **Dataset UI**: Create datasets (upload documents + ground truth files via frontend), browse versions, preview samples (show input images + ground truth JSON), publish versions. Backend automates all DVC operations (add, commit, push) transparently.
- **Benchmark UI**: Create benchmark definitions (select dataset version + workflow + evaluator + runtime settings + artifact policy).
- **Run UI**: Start/cancel runs, track progress (polling `BenchmarkRun.status`), link to Temporal execution in Temporal UI (existing port 8088).
- **Results UI**: List runs with headline metrics, link to MLflow UI for deep inspection of metrics, parameters, and artifacts.

### 10.2 Phase 1.5 — Incremental Additions

- **Split Management UI**: Create/edit splits from the dataset version view.
- **Baseline Management**: Promote a run to baseline, set thresholds, show pass/fail status for candidate runs.
- **Dataset Validation UI**: Run quality checks, view results, fix issues before publishing.

### 10.3 Phase 2 — Rich React Benchmarking UI

Build custom views within `apps/frontend`:

- **Run Comparison**: Side-by-side comparison of two or more runs.
- **Regression Reports**: Highlight metrics that regressed beyond thresholds.
- **Slicing & Filtering**: Filter results by metadata dimensions (doc type, language, page count, etc.).
- **Drill-Down Panels**: Pluggable workflow-specific panels for detailed result inspection.
- **Artifact Viewer**: In-app viewing of artifacts with deep-links to MLflow artifacts.

### 10.4 Navigation

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
| POST | `/api/benchmark/datasets/:id/versions` | Create and publish a new version (triggers DVC add/commit/push) |
| GET | `/api/benchmark/datasets/:id/versions` | List versions |
| GET | `/api/benchmark/datasets/:id/versions/:versionId` | Get version details |
| POST | `/api/benchmark/datasets/:id/versions/:versionId/validate` | Validate version data quality (Phase 1.5) |
| GET | `/api/benchmark/datasets/:id/versions/:versionId/samples` | List/preview samples in a version |
| POST | `/api/benchmark/datasets/:id/versions/:versionId/splits` | Create a split (Phase 1.5) |
| GET | `/api/benchmark/datasets/:id/versions/:versionId/splits` | List splits |
| PUT | `/api/benchmark/datasets/:id/versions/:versionId/splits/:splitId` | Update a split (Phase 1.5) |
| POST | `/api/benchmark/datasets/:id/upload` | Upload files (documents + ground truth) to a dataset |

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
| POST | `/api/benchmark/projects/:id/runs/:runId/baseline` | Promote run to baseline (Phase 1.5) |
| GET | `/api/benchmark/projects/:id/runs/:runId/artifacts` | List run artifacts |
| GET | `/api/benchmark/projects/:id/runs/:runId/drill-down` | Get detailed drill-down summary |

### 11.3 Integration Services

| Service | Location | Responsibility |
|---------|----------|----------------|
| `MlflowClientService` | `apps/backend-services/src/benchmark/` | Wrap MLflow REST API — create experiments, log params/metrics/artifacts, query runs |
| `DvcService` | `apps/backend-services/src/benchmark/` | Automate DVC operations (add, commit, push, pull) on the dataset repository |
| `BenchmarkTemporalService` | `apps/backend-services/src/benchmark/` | Start/cancel/query benchmark Temporal workflows on `benchmark-processing` queue |
| `EvaluatorRegistryService` | `apps/backend-services/src/benchmark/` | Registry of available evaluators (mirrors activity registry pattern) |
| `MinioBlobStorageService` | `apps/backend-services/src/blob-storage/` | S3-compatible blob storage via MinIO, implements `BlobStorageInterface` |

### 11.4 Temporal Activities (New)

| Activity Type | Description |
|---------------|-------------|
| `benchmark.materializeDataset` | Clone/checkout dataset repo at pinned revision, run `dvc pull` to fetch files from MinIO |
| `benchmark.executeWorkflow` | Run GraphWorkflowConfig against a single document (invokes `graphWorkflow` as child workflow) |
| `benchmark.evaluate` | Run evaluator on (prediction, ground truth) pair for a single sample |
| `benchmark.logToMlflow` | Log run params, metrics, artifacts to MLflow |
| `benchmark.aggregate` | Compute aggregate metrics across all samples |
| `benchmark.cleanup` | Clean up temporary materialized files |

---

## 12. Operational Requirements

### 12.1 Deployment

Self-hosted OSS stack. New services added to `apps/backend-services/docker-compose.yml`:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **MLflow Server** | `ghcr.io/mlflow/mlflow` | 5000 | Experiment tracking, artifact management |
| **MinIO** | `minio/minio` | 9000 (API), 9001 (Console) | S3-compatible object storage for DVC + MLflow artifacts |

MLflow configuration:
- `--backend-store-uri postgresql://mlflow:password@postgres:5432/mlflow`
- `--default-artifact-root s3://mlflow-artifacts/` (pointing to MinIO)
- Depends on: postgres (for backend store), minio (for artifact store)

MinIO configuration:
- Buckets: `datasets` (DVC remote), `mlflow-artifacts` (MLflow artifact store), `benchmark-outputs` (run outputs)
- Access via AWS SDK / MinIO client with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
- Volume: `minio_data` for persistent storage

The existing `apps/backend-services/docker-compose.yml` is extended to include these new services alongside the existing PostgreSQL 15 container.

### 12.2 Observability

- Logs/metrics/traces for benchmark runs (leverage existing Temporal observability).
- Per-node timing and cost accounting (record execution time per graph node per document).
- Benchmark-specific dashboard (metrics: runs/day, avg run duration, failure rate).

### 12.3 Cost Controls

- Quotas: max documents/pages per run, max concurrent runs.
- Scheduled runs (Phase 1.5): support cron-style scheduling for nightly regression benchmarks.
- Cache reuse: cache materialized datasets to avoid re-fetching from MinIO/DVC remote.

### 12.4 CI/CD Integration

- Automated replay tests for Temporal benchmark workflows.
- Optional scheduled benchmark suites triggered from CI for regression detection.
- CLI/API for triggering benchmark runs from CI pipelines.

---

## 13. Architectural Alignment with Existing System

### 13.1 How Benchmarking Fits the DAG Workflow Engine

The benchmarking system reuses the existing graph workflow engine rather than replacing it:

- A **Benchmark Run** executes the same `graphWorkflow` Temporal workflow function that production documents use.
- The benchmark orchestrator wraps this: it fans out across all dataset samples, each invoking `graphWorkflow` as a child workflow on the `benchmark-processing` queue.
- This ensures benchmarks test the **actual execution path** — no separate "benchmark mode" engine.

### 13.2 Evaluator Registry Pattern

Mirrors the existing Activity Registry pattern (`apps/temporal/src/activity-registry.ts`):

- Evaluators are registered by type string.
- Each evaluator has a `type`, `evaluate()` function, and default config.
- New evaluators can be added without code changes to the orchestrator.
- The interface uses file paths (not in-memory objects), enabling future external evaluator support (e.g., Python subprocess) without interface changes.

### 13.3 Prisma Schema Extension

New models are added to `apps/shared/prisma/schema.prisma` alongside existing models. No changes to existing models — the benchmark system references `Workflow` via foreign key but does not modify it.

### 13.4 Module Structure

New NestJS module: `apps/backend-services/src/benchmark/` containing:
- `benchmark.module.ts`
- `benchmark.controller.ts`
- `benchmark.service.ts`
- `dataset.service.ts`
- `dataset.controller.ts`
- `mlflow-client.service.ts`
- `evaluator-registry.service.ts`
- `dvc.service.ts`

New blob storage service: `apps/backend-services/src/blob-storage/`
- `minio-blob-storage.service.ts` (implements `BlobStorageInterface`)

New Temporal workflow and activities in `apps/temporal/src/`:
- `benchmark-workflow.ts`
- `activities/benchmark-*.ts`

### 13.5 Infrastructure Additions

```
apps/backend-services/docker-compose.yml additions:
├── mlflow (port 5000)
│   ├── backend-store → postgres:5432/mlflow
│   └── artifact-store → minio:9000/mlflow-artifacts
├── minio (ports 9000, 9001)
│   ├── bucket: datasets (DVC remote)
│   ├── bucket: mlflow-artifacts
│   └── bucket: benchmark-outputs
└── postgres (port 5432) — existing service
    └── gains 'mlflow' database

apps/temporal/docker-compose.yaml (unchanged):
├── temporal (port 7233)
├── temporal-ui (port 8088)
└── postgresql (port 5433) — Temporal's own DB
```

---

## 14. Open Questions & Decisions Needed

> These will be resolved through the iterative refinement process.

1. **Dataset repository hosting**: Where will the dedicated dataset Git repository be hosted? Same Git server as the main repo, or a separate location? Does it need to be created programmatically by the backend?
2. **Scheduled runs**: Should cron scheduling be managed by Temporal schedules, a separate scheduler, or CI-only? (Phase 1.5)
3. **Worker deployment model**: Should benchmark workers be a separate deployment from production workers (sharing the same codebase but different process), or the same worker process polling multiple queues?
4. **MLflow UI access**: Should MLflow UI be exposed directly to users (separate port), or proxied through the NestJS backend?
5. **Dataset size limits**: What are reasonable limits for dataset size (max samples per version, max file size per sample)?
6. **Evaluation timeout**: What timeout should apply per-sample evaluation? Per-run? Should these differ from production workflow timeouts?
