# DVC & MLFlow in the Benchmarking System — Role Analysis

> **Status: COMPLETED** — Both DVC and MLFlow have been removed from the benchmarking system. The system now uses Postgres + object storage (MinIO / Azure Blob Storage) + Temporal exclusively. E2E tests and page objects have been updated to remove all MLflow/DVC references (`mlflowRunId`, `mlflowExperimentId`, `repositoryUrl`, `gitRevision`, `dvcRemote`) and use the new blob storage fields (`storagePath`, `storagePrefix`). The `results-mlflow-links.spec.ts` test file was deleted entirely. This document is retained for historical reference explaining the rationale for the removal.

## Overview

The benchmarking system previously used two external tools alongside its core infrastructure (Postgres, Temporal, object storage):

- **DVC (Data Version Control)** — dataset versioning and retrieval
- **MLFlow** — experiment tracking and metrics logging

Both were removed because they duplicated functionality already provided by Postgres and object storage. The frontend read exclusively from Postgres, making MLFlow a write-only sink. DVC added Git + Python CLI dependencies for what could be direct blob storage operations.

### What Was Removed

- `MLflowClientService` and the `benchmark.logToMlflow` Temporal activity
- `DvcService` and all Git clone/checkout/push operations
- MLFlow server, its separate PostgreSQL database, and the `mlflow-artifacts` bucket
- DVC binary dependency, Git credentials, and dataset Git repositories
- `mlflowExperimentId` from `BenchmarkProject`, `mlflowRunId` from `BenchmarkRun`
- `gitRevision` from `DatasetVersion`, `repositoryUrl` and `dvcRemote` from `Dataset`

### What Replaced Them

- Datasets are stored directly in object storage at `datasets/{datasetId}/{versionId}/`
- Dataset versions are tracked via `storagePrefix` in Postgres
- Materialization downloads from object storage using the `BlobStorageInterface`
- All metrics, params, and tags remain in Postgres (unchanged)
- Artifacts remain in object storage (unchanged)

---

The original analysis below explains in detail what each tool did and why removal was justified.

---

## DVC (Data Version Control)

### What It Is

DVC is an open-source tool that extends Git to handle large files (datasets, models, etc.) that are impractical to store in Git directly. It works by storing metadata (`.dvc` files) in Git while pushing the actual data to a remote storage backend (MinIO or Azure Blob Storage).

### How It's Used in This Project

The `DvcService` (`apps/backend-services/src/benchmark/dvc.service.ts`) wraps the DVC CLI binary and provides:

| Operation | What It Does |
|-----------|--------------|
| `initRepository()` | Clones a dataset Git repo, runs `dvc init`, configures the object storage remote |
| `addFiles()` | Runs `dvc add` to track data files, creating `.dvc` metadata stubs |
| `commitChanges()` | Commits the `.dvc` metadata to Git, returns a Git SHA for version pinning |
| `pushData()` | Uploads tracked files to object storage (`datasets` bucket/container) via `dvc push` |
| `pullData()` | Checks out a Git revision and runs `dvc pull` to fetch the matching data |
| `checkout()` | Switches to a specific Git commit for reproducible dataset access |

**During a benchmark run**, the Temporal workflow's `benchmark-materialize` activity:

1. Queries the `DatasetVersion` record for a Git revision
2. Clones the dataset repository
3. Checks out that Git revision
4. Configures the DVC remote (storage credentials)
5. Runs `dvc pull` to fetch the actual data files
6. Caches locally as `{datasetId}-{gitRevision}` for reuse

### Infrastructure Requirements

- **DVC binary** installed on the host (Python package, path set via `DVC_BINARY_PATH`)
- **Git repository** per dataset (with DVC initialized)
- **Object storage** bucket/container `datasets` for data storage
- Git credentials (`DATASET_GIT_USERNAME`, `DATASET_GIT_PASSWORD`) for private repos

### What DVC Actually Provides

1. **Version-pinned datasets** — a Git SHA uniquely identifies a dataset snapshot
2. **Large file storage** — data lives in object storage, not in Git
3. **Reproducibility** — any benchmark run can re-materialize the exact same dataset by checking out the recorded Git revision

---

## MLFlow

### What It Is

MLFlow is an open-source ML lifecycle platform. This project uses only its **Tracking** component — a REST API + database for logging experiment runs, metrics, parameters, and artifacts.

### How It's Used in This Project

The `MLflowClientService` (`apps/backend-services/src/benchmark/mlflow-client.service.ts`) wraps the MLFlow REST API (v2.0) and provides:

| Operation | What It Does |
|-----------|--------------|
| `createExperiment()` | Creates an MLFlow experiment (1:1 with a `BenchmarkProject`) |
| `deleteExperiment()` | Removes an experiment and all its runs |
| `createRun()` | Creates a run inside an experiment (1:1 with a `BenchmarkRun`) |
| `updateRunStatus()` | Sets status to RUNNING / FINISHED / FAILED / KILLED |
| `logMetrics()` | Logs flat numeric metrics: `pass_rate`, `{metric}.mean`, `{metric}.p95`, etc. |
| `logParams()` | Logs parameters: `dataset_version_id`, `workflow_config_hash`, `evaluator_config_hash`, etc. |
| `setTags()` | Logs tags: `worker_image_digest`, `benchmark_run_id`, `benchmark_project_id`, etc. |
| `queryRuns()` | Retrieves runs with filtering |

**During a benchmark run**, the `benchmark-logging` Temporal activity:

1. Logs parameters (dataset version, config hashes, evaluator type)
2. Logs aggregated metrics (pass rate, per-metric statistics)
3. Sets tags linking the MLFlow run to internal entity IDs
4. Uploads artifacts to object storage (`mlflow-artifacts` bucket/container)

### Infrastructure Requirements

- **MLFlow server** (Python process, port 5000)
- **PostgreSQL database** `mlflow` (separate from the app database)
- **Object storage** bucket/container `mlflow-artifacts` for artifact storage
- Environment: `MLFLOW_TRACKING_URI`, storage credentials

### What MLFlow Actually Provides

1. **Flat metrics queryable via REST API** — search/filter/compare runs
2. **MLFlow UI** (port 5000) — a web dashboard for viewing experiment history
3. **Artifact storage** — benchmark outputs stored alongside run metadata
4. **Standardized ML experiment format** — familiar to data scientists

---

## The Duplication Problem

Here is the critical observation: **the same data is stored in two places**.

| Data | Stored in Postgres (`BenchmarkRun`) | Stored in MLFlow |
|------|--------------------------------------|------------------|
| Run status | `status` field | Run status |
| Aggregated metrics | `metrics` JSON column | Logged metrics |
| Parameters | `params` JSON column | Logged params |
| Tags | `tags` JSON column | Set tags |
| Dataset version link | `datasetVersionId` FK | Param `dataset_version_id` |
| Baseline comparison | `baselineComparison` JSON | Not stored |
| Per-sample results | `metrics.perSampleResults` JSON | Not stored |
| Failure analysis | `metrics.failureAnalysis` JSON | Not stored |

The **frontend reads exclusively from Postgres** — it does not query MLFlow. The MLFlow UI is a secondary, standalone dashboard.

Similarly for DVC:

| Data | Managed by DVC | Could be managed without DVC |
|------|----------------|------------------------------|
| Dataset files | Object storage via DVC push/pull | Object storage directly (SDK) |
| Version pinning | Git SHA of `.dvc` metadata | Database record with storage path + version |
| Dataset checkout | `dvc pull` at a Git revision | Direct download by path |

---

## Are They Really Needed?

### DVC — Assessment

**What DVC adds beyond what the system already has:**

- Git-based version history of dataset manifests
- CLI-driven push/pull workflow familiar to ML practitioners

**What the system already has without DVC:**

- Object storage (MinIO / Azure Blob Storage) for storing the actual files
- Postgres `DatasetVersion` records with `gitRevision` for version tracking
- Temporal activities that could download from object storage directly

**Verdict: DVC is not strictly necessary.** The system could store dataset files directly in object storage with a versioning scheme (e.g., `datasets/{datasetId}/{versionId}/`) and track versions in Postgres. The DVC layer adds complexity:

- Requires a Python binary on the host
- Requires a Git repository per dataset
- Requires Git credentials
- Shells out to CLI commands (error-prone, hard to test)
- Adds a second version-tracking system alongside Postgres

**DVC makes sense when** datasets are managed by data scientists who work in Git repos and use DVC as part of their ML workflow. If datasets are uploaded through the application UI (which this system supports), DVC is an unnecessary intermediary.

### MLFlow — Assessment

**What MLFlow adds beyond what the system already has:**

- MLFlow UI for ad-hoc experiment comparison
- REST API for querying runs (used only internally, not by the frontend)
- Standardized experiment tracking format

**What the system already has without MLFlow:**

- All metrics, params, and tags stored in Postgres `BenchmarkRun`
- Frontend UI for viewing/comparing runs
- Baseline comparison logic in Postgres
- Object storage for artifact storage (accessible directly)

**Verdict: MLFlow is not strictly necessary.** Every piece of data logged to MLFlow is also stored in Postgres, and the frontend reads from Postgres. MLFlow is a write-only sink from the application's perspective — data goes in but is only consumed through the standalone MLFlow UI.

**MLFlow makes sense when** data scientists want to use MLFlow's native tools (Python SDK, UI, model registry) to interact with experiment data outside the application. If all interaction happens through the application's own UI, MLFlow adds infrastructure cost (server, database, storage bucket) without clear benefit.

---

## How the System Would Function Without Them

### Without DVC

**Dataset upload flow:**
1. User uploads dataset files through the application
2. Backend stores files directly in object storage: `datasets/{datasetId}/{versionId}/{filename}`
3. Postgres `DatasetVersion` stores the storage path prefix, file manifest, and a content hash for integrity

**Dataset materialization during benchmark run:**
1. Temporal activity reads `DatasetVersion` from Postgres
2. Downloads files from object storage using the storage SDK (already in the project)
3. Caches locally using `{datasetId}-{versionId}` as the cache key

**What changes:**
- No Git repository per dataset
- No DVC binary dependency
- No Git credential management
- No shell-out to CLI commands
- Simpler error handling (storage SDK vs CLI parsing)
- Dataset versioning managed entirely in Postgres

### Without MLFlow

**Metrics logging during benchmark run:**
1. Temporal activity aggregates metrics (already happens)
2. Stores structured metrics in the `BenchmarkRun.metrics` JSON column (already happens)
3. Stores params and tags in their respective columns (already happens)
4. Uploads artifacts directly to object storage: `benchmark-artifacts/{runId}/`

**Run comparison:**
1. Frontend queries Postgres for runs within a project
2. Compares metrics across runs using stored JSON data (already happens)
3. Baseline comparison logic remains unchanged (already in Postgres)

**What changes:**
- No MLFlow server to run and maintain
- No separate `mlflow` PostgreSQL database
- No `mlflow-artifacts` bucket/container (use a single bucket/container)
- No dual-write of metrics (Postgres only)
- Remove `MLflowClientService` and the `benchmark-logging` activity
- Lose the standalone MLFlow UI (replace with application UI features if needed)

### Without Both

The system would rely on:

| Concern | Solution |
|---------|----------|
| Dataset storage | Object storage (SDK directly) |
| Dataset versioning | Postgres `DatasetVersion` records |
| Metrics storage | Postgres `BenchmarkRun.metrics` JSON |
| Artifact storage | Object storage (SDK directly) |
| Run comparison | Postgres queries + frontend UI |
| Reproducibility | Postgres stores dataset version ID, config hashes, evaluator config |
| Workflow orchestration | Temporal (unchanged) |

The core pipeline — materialize dataset, execute workflow, evaluate results, aggregate metrics, compare to baseline — would remain identical. The only losses would be the MLFlow standalone UI and Git-based dataset version history.

---

## Summary

| Tool | Role | Strictly Needed? | Adds Value When... |
|------|------|-------------------|---------------------|
| DVC | Dataset versioning via Git + object storage | No | Datasets are managed in Git repos by data scientists |
| MLFlow | Experiment tracking via REST API | No | Data scientists use MLFlow tools outside the app |

Both tools are **industry-standard ML infrastructure** and make the system familiar to ML practitioners. However, in this project's architecture — where Postgres already stores all run data and the frontend reads from Postgres — they introduce infrastructure overhead and code complexity without being load-bearing components of the data flow.

The system could function with **Postgres + object storage + Temporal** alone, which are already required dependencies.
