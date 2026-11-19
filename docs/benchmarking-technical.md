---
title: "Benchmarking Architecture"
---

# Benchmarking System — Technical Reference

This page covers the internal architecture, data model, API surface, and development configuration of the benchmarking system. For a usage-focused guide, see the [Benchmarking Guide](./benchmarking-guide.md).

## Table of Contents

- [Architecture Overview](#architecture)
- [Data Model](#data-model)
    - [Dataset & DatasetVersion](#dm-dataset)
    - [Split](#dm-split)
    - [BenchmarkProject](#dm-project)
    - [BenchmarkDefinition](#dm-definition)
    - [BenchmarkRun](#dm-run)
    - [BenchmarkAuditLog](#dm-audit)
    - [DatasetGroundTruthJob](#dm-gt-job)
    - [Enums](#dm-enums)
- [API Endpoints](#api-reference)
    - [Dataset Management](#api-datasets)
    - [HITL Dataset Creation](#api-hitl-datasets)
    - [Ground Truth Generation](#api-gt-generation)
    - [Projects](#api-projects)
    - [Definitions](#api-definitions)
    - [Runs](#api-runs)
- [Temporal Workflow Engine](#workflow-engine)
    - [Orchestrator Workflow](#workflow-orchestrator)
    - [Activities](#workflow-activities)
    - [Configuration & Timeouts](#workflow-config)
- [Evaluator System](#evaluator-system)
    - [Evaluator Interface](#evaluator-interface)
    - [Schema-Aware Evaluator](#evaluator-schema-aware)
    - [Black-Box Evaluator](#evaluator-black-box)
    - [Evaluator Registry](#evaluator-registry)
- [Metrics Pipeline](#metrics-pipeline)
    - [Per-Sample Metrics](#metrics-per-sample)
    - [Aggregation](#metrics-aggregation)
    - [Storage Format](#metrics-storage)
    - [Sliced Metrics](#metrics-slicing)
    - [Failure Analysis](#metrics-failure-analysis)
- [Baseline Comparison](#baseline-comparison)
- [Object Storage](#storage)
- [Environment Variables](#env-vars)
- [Key Files Reference](#key-files)

## Architecture Overview {#architecture}

The benchmarking system is built on three infrastructure components that integrate with the existing NestJS backend and Temporal workflow engine:

### Object Storage (MinIO / Azure Blob)

Pluggable object storage for dataset files (inputs, ground truth, manifests) and benchmark run outputs. The system uses a `BlobStorageInterface` abstraction with two implementations, switchable via the `BLOB_STORAGE_PROVIDER` environment variable:

- **MinIO** (default) — S3-compatible, used for local development. Ports: 19000 (API), 19001 (Console).
- **Azure Blob Storage** — for cloud deployments using Azure infrastructure.

### PostgreSQL (Metadata Store)

Existing PostgreSQL instance extended with benchmark tables via Prisma: datasets, versions, splits, projects, definitions, runs, and audit logs.

### Temporal (Workflow Orchestration)

Orchestrates the benchmark run lifecycle — dataset materialization, per-document fan-out execution, evaluation, aggregation, and baseline comparison. Uses a dedicated `benchmark-processing` task queue.

::: info Task Queue Isolation
Benchmark workflows run on the `benchmark-processing` task queue by default, isolating them from production document processing. The `useProductionQueue` runtime setting can route child workflows to `ocr-processing` instead, for benchmarking under production conditions.
:::

## Data Model {#data-model}

All benchmark entities are defined in the Prisma schema at `apps/shared/prisma/schema.prisma`.

### Dataset & DatasetVersion {#dm-dataset}

| Table | Field | Type | Description |
| --- | --- | --- | --- |
| `datasets` | `id` | UUID | Primary key. |
| `name` | String (unique) | Human-readable dataset name. |
| `description` | String? | Optional description. |
| `metadata` | JSON | Arbitrary metadata (default: `{}`). |
| `storagePath` | String | Base storage path prefix. |
| `createdBy` | String | User who created the dataset. |
| `versions` | Relation | Has many `DatasetVersion`. |

| Table | Field | Type | Description |
| --- | --- | --- | --- |
| `dataset_versions` | `id` | UUID | Primary key. |
| `datasetId` | UUID (FK) | References parent dataset. |
| `version` | String | Version identifier (e.g. "1.0", "2.0"). |
| `name` | String? | Optional version label. |
| `storagePrefix` | String? | Object storage prefix for all files in this version. |
| `manifestPath` | String | Relative path to `dataset-manifest.json` within the storage prefix. |
| `documentCount` | Int | Number of samples in this version. |
| `groundTruthSchema` | JSON? | Optional JSON schema for ground truth validation. |
| `frozen` | Boolean | Whether the version is locked from modification (default: false). Automatically set to `true` when a benchmark run starts. |

### Split {#dm-split}

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `datasetVersionId` | UUID (FK) | References parent dataset version. |
| `name` | String | Display name (e.g. "Test Split"). |
| `type` | SplitType | One of: `train`, `val`, `test`, `golden`. |
| `sampleIds` | JSON | Array of sample IDs belonging to this split. |
| `stratificationRules` | JSON? | Optional rules used to generate the split. |
| `frozen` | Boolean | Whether the split is locked from modification (default: false). |

### BenchmarkProject {#dm-project}

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `name` | String (unique) | Project name. |
| `description` | String? | Optional description. |
| `createdBy` | String | User who created the project. |

### BenchmarkDefinition {#dm-definition}

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `projectId` | UUID (FK) | References parent project. |
| `name` | String | Definition name. |
| `datasetVersionId` | UUID (FK) | Pinned dataset version. |
| `splitId` | UUID? (FK) | Optional split to evaluate against. |
| `workflowId` | UUID (FK) | Workflow to execute. |
| `workflowConfigHash` | String | SHA-256 hash of the workflow configuration. |
| `evaluatorType` | String | Evaluator type identifier (e.g. `schema-aware`). |
| `evaluatorConfig` | JSON | Evaluator-specific configuration (field rules, thresholds). |
| `runtimeSettings` | JSON | Execution settings (concurrency, timeouts, queue routing). |
| `immutable` | Boolean | Whether the definition is locked (default: false). |
| `revision` | Int | Revision counter (default: 1). |
| `scheduleEnabled` | Boolean | Whether scheduled execution is enabled. |
| `scheduleCron` | String? | Cron expression for scheduled runs. |
| `scheduleId` | String? (unique) | Temporal schedule ID. |

### BenchmarkRun {#dm-run}

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `definitionId` | UUID (FK) | References parent definition. |
| `projectId` | UUID (FK) | References parent project. |
| `status` | BenchmarkRunStatus | Run state: `pending` \| `running` \| `completed` \| `failed` \| `cancelled`. |
| `temporalWorkflowId` | String | Temporal workflow execution ID. |
| `workerImageDigest` | String? | Docker image digest of the benchmark worker. |
| `workerGitSha` | String | Git SHA of the codebase at execution time. |
| `startedAt` | DateTime? | When the workflow started executing. |
| `completedAt` | DateTime? | When the workflow finished. |
| `metrics` | JSON | Combined flat metrics + structured aggregate + per-sample results (see [Metrics Storage Format](#metrics-storage)). |
| `params` | JSON | Captured input parameters for reproducibility. |
| `tags` | JSON | Key-value tags (e.g. `{ regression: "true" }`). |
| `error` | String? | Error message if the run failed. |
| `isBaseline` | Boolean | Whether this run is the current baseline for its definition. |
| `baselineThresholds` | JSON? | Array of `MetricThreshold` (set when promoted to baseline). |
| `baselineComparison` | JSON? | Comparison result against the baseline (set after run completion). |

### BenchmarkAuditLog {#dm-audit}

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `timestamp` | DateTime | When the event occurred. |
| `userId` | String | User who performed the action. |
| `action` | AuditAction | Event type. |
| `details` | JSON | Event-specific details. |

### DatasetGroundTruthJob {#dm-gt-job}

Tracks the lifecycle of ground truth generation for individual samples. Each job links a dataset sample to a `Document` record that is processed through an OCR workflow and then reviewed via a dataset-scoped HITL queue.

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `datasetVersionId` | UUID (FK) | References parent dataset version. |
| `sampleId` | String | Manifest sample ID. |
| `documentId` | UUID? (FK, unique) | References the Document created for OCR processing. Unique constraint ensures one-to-one mapping. |
| `workflowConfigId` | String | Workflow configuration used for OCR processing. |
| `temporalWorkflowId` | String? | Temporal workflow execution ID. |
| `status` | GroundTruthJobStatus | Job lifecycle state (see Enums below). |
| `groundTruthPath` | String? | Blob storage path of the generated ground truth JSON. |
| `error` | String? | Error message if the job failed. |

Indices: `datasetVersionId`, `documentId`, `status`. The unique constraint on `documentId` is used by the production HITL queue to exclude ground truth documents via `groundTruthJob: { is: null }`.

### Enums {#dm-enums}

### SplitType

- `train`
- `val`
- `test`
- `golden`

### BenchmarkRunStatus

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

### AuditAction

- `dataset_created`
- `version_published`
- `run_started`
- `run_completed`
- `baseline_promoted`

### GroundTruthJobStatus

- `pending` — Job created, not yet started.
- `processing` — OCR workflow is running.
- `awaiting_review` — OCR complete, waiting for HITL review.
- `completed` — Ground truth extracted and written.
- `failed` — Job encountered an error.

## API Endpoints {#api-reference}

### Dataset Management {#api-datasets}

Controller: `apps/backend-services/src/benchmark/dataset.controller.ts`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/benchmark/datasets` | Create a dataset. |
| `GET` | `/api/benchmark/datasets` | List datasets (paginated). |
| `GET` | `/api/benchmark/datasets/:id` | Get dataset details. |
| `DELETE` | `/api/benchmark/datasets/:id` | Delete a dataset. |
| `POST` | `/api/benchmark/datasets/:id/versions` | Create a dataset version. |
| `POST` | `/api/benchmark/datasets/:id/versions/:versionId/upload` | Upload dataset files (inputs + ground truth). Blocked if version is frozen. |
| `DELETE` | `/api/benchmark/datasets/:id/versions/:versionId/samples/:sampleId` | Delete a sample from a version. Blocked if version is frozen. |
| `POST` | `/api/benchmark/datasets/:id/versions/:versionId/freeze` | Freeze a dataset version (prevents uploads and sample deletions). |
| `POST` | `/api/benchmark/datasets/:id/versions/:versionId/validate` | Validate dataset files and ground truth. |

### HITL Dataset Creation {#api-hitl-datasets}

Controller: `apps/backend-services/src/benchmark/hitl-dataset.controller.ts`

These endpoints allow creating datasets from documents that have been verified through the Human-In-The-Loop review interface. The corrected OCR data becomes ground truth in the standard flat key-value format.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/benchmark/datasets/from-hitl/eligible-documents` | List documents with approved HITL sessions (paginated, searchable). Returns filename, file type, approval date, reviewer, field count, and correction count. |
| `POST` | `/api/benchmark/datasets/from-hitl` | Create a new dataset and version from selected HITL-verified document IDs. |
| `POST` | `/api/benchmark/datasets/:id/versions/from-hitl` | Add a new version to an existing dataset from selected HITL-verified document IDs. |

#### Eligible Documents Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | Page number (default: 1). |
| `limit` | number | Results per page (default: 20). |
| `search` | string | Filter by filename (case-insensitive substring match). |

#### Ground Truth Construction

For each selected document, the service takes the most recent approved review session and applies its field corrections to the OCR results. Corrections are applied as follows: **confirmed** fields keep their original value, **corrected** fields use the reviewer's value, **deleted** fields are removed, and **flagged** fields are kept as-is. The output is a flat key-value JSON file (e.g., `{"vendor_name": "Acme Corp", "total_amount": 1250.75}`) using the same field value extraction logic as the benchmark workflow (`extractFieldValue`). Provenance metadata (source document ID, review session, reviewer) is stored in the manifest sample's `metadata` field.

### Ground Truth Generation {#api-gt-generation}

Controller: `apps/backend-services/src/benchmark/ground-truth-generation.controller.ts`

These endpoints manage the ground truth generation workflow — running samples without ground truth through an OCR workflow and providing a dataset-scoped HITL review queue.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation` | Start ground truth generation. Creates jobs for samples without GT and starts OCR workflows. Body: `{ workflowConfigId: string }`. |
| `GET` | `/api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/jobs` | List ground truth jobs (paginated). Lazily syncs job statuses from document status. |
| `GET` | `/api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/review/queue` | Dataset-scoped HITL review queue. Returns documents awaiting review with OCR results and last session info. |
| `GET` | `/api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/review/stats` | Review queue statistics: total jobs, awaiting review, completed, failed. |

#### Jobs Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | Page number (default: 1). |
| `limit` | number | Results per page (default: 50, max: 100). |

#### Review Queue Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `limit` | number | Results per page (default: 50, max: 100). |
| `offset` | number | Number of results to skip (default: 0). |
| `reviewStatus` | `pending` \| `reviewed` \| `all` | Filter by review status (default: `pending`). |

#### Queue Separation

Production and dataset HITL queues are separated at the database query level. The production queue (`GET /api/hitl/queue`) filters documents with `groundTruthJob: { is: null }`, excluding any document linked to a ground truth generation job. The dataset queue queries `DatasetGroundTruthJob` records directly. Both queues use the same `ReviewSession` and `FieldCorrection` models for the actual review process.

#### Post-Approval Hook

When a review session is approved via `POST /api/hitl/sessions/:id/submit`, the HITL service checks if the document is linked to a `DatasetGroundTruthJob`. If so, it triggers ground truth extraction: the OCR results are combined with the reviewer's corrections using `buildGroundTruth()`, the resulting JSON is written to dataset storage, and the manifest is updated. This hook is non-blocking — if it fails, the session approval still succeeds.

### Projects {#api-projects}

Controller: `apps/backend-services/src/benchmark/benchmark-project.controller.ts`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/benchmark/projects` | Create a project. |
| `GET` | `/api/benchmark/projects` | List all projects. |
| `GET` | `/api/benchmark/projects/:id` | Get project details. |
| `DELETE` | `/api/benchmark/projects/:id` | Delete a project. |

### Definitions {#api-definitions}

Controller: `apps/backend-services/src/benchmark/benchmark-definition.controller.ts`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/benchmark/projects/:projectId/definitions` | Create a definition. |
| `GET` | `/api/benchmark/projects/:projectId/definitions` | List definitions in a project. |
| `GET` | `/api/benchmark/projects/:projectId/definitions/:id` | Get definition details. |
| `PUT` | `/api/benchmark/projects/:projectId/definitions/:id` | Update a definition. |
| `DELETE` | `/api/benchmark/projects/:projectId/definitions/:id` | Delete a definition. |
| `POST` | `/api/benchmark/projects/:projectId/definitions/:id/schedule` | Configure scheduled execution. |
| `GET` | `/api/benchmark/projects/:projectId/definitions/:id/schedule` | Get schedule info. |
| `GET` | `/api/benchmark/projects/:projectId/definitions/:id/baseline-history` | Get baseline promotion history. |

### Runs {#api-runs}

Controller: `apps/backend-services/src/benchmark/benchmark-run.controller.ts`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/benchmark/projects/:projectId/definitions/:defId/runs` | Start a benchmark run. |
| `GET` | `/api/benchmark/projects/:projectId/runs` | List runs in a project. |
| `GET` | `/api/benchmark/projects/:projectId/runs/:runId` | Get run details with headline metrics. |
| `POST` | `/api/benchmark/projects/:projectId/runs/:runId/cancel` | Cancel a running benchmark. |
| `GET` | `/api/benchmark/projects/:projectId/runs/:runId/drill-down` | Get aggregated metrics, worst samples, and per-field errors. |
| `GET` | `/api/benchmark/projects/:projectId/runs/:runId/samples` | Get per-sample results (paginated, filterable). |
| `POST` | `/api/benchmark/projects/:projectId/runs/:runId/baseline` | Promote run to baseline. |
| `DELETE` | `/api/benchmark/projects/:projectId/runs/:runId` | Delete a run. |

#### Per-Sample Results Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | Page number (default: 1). |
| `limit` | number | Results per page (default: 20). |
| `passFilter` | `pass` \| `fail` | Filter by pass/fail status. |
| `dimension` | string | Metadata dimension to filter by (e.g. `docType`). |
| `dimensionValue` | string | Value of the dimension to filter on (e.g. `invoice`). |

## Temporal Workflow Engine {#workflow-engine}

### Orchestrator Workflow {#workflow-orchestrator}

The `benchmarkRunWorkflow` function in `apps/temporal/src/benchmark-workflow.ts` orchestrates the full run lifecycle:

1. **Materialize dataset** — downloads files from object storage to local cache.
2. **Load manifest** — parses `dataset-manifest.json` and filters by split.
3. **Execute & evaluate (fan-out)** — processes samples in batches:
    - Executes the graph workflow as a child Temporal workflow per sample.
    - Extracts predictions from the workflow context.
    - Writes predictions to disk and runs the evaluator.
4. **Aggregate** — computes run-level statistics from all evaluation results.
5. **Update run status** — writes metrics and status to the database.
6. **Compare against baseline** — if a baseline exists, runs threshold checks.
7. **Cleanup** — removes temporary outputs (cached datasets are preserved).

The workflow supports:

- **Progress queries** via `getProgress` — returns current phase, sample counts, and percent complete.
- **Cancellation** via the `cancel` signal — gracefully stops processing and marks the run as cancelled.

#### Progress Query Response

| Field | Type | Description |
| --- | --- | --- |
| `phase` | string | Current phase: `materializing`, `executing`, `evaluating`, `aggregating`, `cleanup`, or `completed`. |
| `totalSamples` | number | Total samples to process. |
| `completedSamples` | number | Samples finished so far. |
| `failedSamples` | number | Samples that failed execution or evaluation. |
| `percentComplete` | number | Integer 0–100. |

### Activities {#workflow-activities}

| Activity | File | Description |
| --- | --- | --- |
| `benchmark.materializeDataset` | `activities/benchmark-materialize.ts` | Downloads dataset version from object storage to a local cache directory, `{BENCHMARK_CACHE_DIR}/{groupId}/{datasetId}-{datasetVersionId}`. |
| `benchmark.loadDatasetManifest` | `activities/benchmark-materialize.ts` | Reads and parses the dataset manifest from the materialized directory. |
| `benchmark.evaluate` | `activities/benchmark-evaluate.ts` | Evaluates a single sample using the configured evaluator. Returns `EvaluationResult` with metrics, diagnostics, and pass/fail. |
| `benchmark.aggregate` | `activities/benchmark-evaluate.ts` | Aggregates all evaluation results into `BenchmarkAggregationResult` with overall stats, sliced metrics, and failure analysis. |
| `benchmark.writePrediction` | `activities/benchmark-write-prediction.ts` | Writes a prediction JSON to disk so the evaluator can read it. |
| `benchmark.updateRunStatus` | `activities/benchmark-update-run.ts` | Updates the `BenchmarkRun` record with status, metrics, and timestamps. |
| `benchmark.compareAgainstBaseline` | `activities/benchmark-baseline-comparison.ts` | Compares a run's flat metrics against the baseline's thresholds. Stores the comparison and tags regressions. |
| `benchmark.cleanup` | `activities/benchmark-logging.ts` | Removes temporary output files. Optionally preserves cached datasets. |

The **child workflow** `benchmarkExecuteWorkflow` (in `activities/benchmark-execute.ts`) wraps the existing `graphWorkflow` and executes it for a single sample. It extracts predictions from the workflow context using a field extraction function that handles Azure Document Intelligence field types (typed values like `valueNumber`, `valueCurrency`, `valueDate`, etc.).

### Configuration & Timeouts {#workflow-config}

| Setting | Default | Description |
| --- | --- | --- |
| `startToCloseTimeout` | 30 minutes | Maximum activity execution time. |
| `retry.initialInterval` | 1 second | Initial retry delay. |
| `retry.maximumInterval` | 30 seconds | Maximum retry delay. |
| `retry.maximumAttempts` | 3 | Number of retry attempts. |
| `maxParallelDocuments` | 10 | Number of samples processed concurrently per batch. |
| `timeoutPerDocumentMs` | 300,000 (5 min) | Timeout for each child workflow execution. |

All defaults can be overridden per definition via `runtimeSettings`.

## Evaluator System {#evaluator-system}

### Evaluator Interface {#evaluator-interface}

Defined in `apps/temporal/src/benchmark-types.ts`:

```
interface BenchmarkEvaluator {
  type: string;
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}

interface EvaluationInput {
  sampleId: string;
  inputPaths: string[];
  predictionPaths: string[];
  groundTruthPaths: string[];
  metadata: Record<string, unknown>;
  evaluatorConfig: Record<string, unknown>;
}

interface EvaluationResult {
  sampleId: string;
  metrics: Record<string, number>;
  diagnostics: Record<string, unknown>;
  pass: boolean;
  artifacts?: EvaluationArtifact[];
  groundTruth?: unknown;
  prediction?: unknown;
  evaluationDetails?: unknown;
}
```

### Schema-Aware Evaluator {#evaluator-schema-aware}

File: `apps/temporal/src/evaluators/schema-aware-evaluator.ts`

Performs field-by-field comparison between predicted and ground truth JSON objects. For each field, applies a configurable matching rule:

- **exact** — string equality (default).
- **fuzzy** — Levenshtein similarity with configurable threshold.
- **numeric** — numeric comparison with absolute or relative tolerance.
- **date** — date normalization to YYYY-MM-DD before comparison.
- **boolean** — boolean-like value parsing (`true`/`yes`/`1`).

Produces metrics: `precision`, `recall`, `f1`, `truePositives`, `falsePositives`, `falseNegatives`, `totalGroundTruthFields`, `matchedFields`, `checkboxAccuracy`.

Pass condition: `f1 ≥ passThreshold` (default: 1.0).

### Black-Box Evaluator {#evaluator-black-box}

File: `apps/temporal/src/evaluators/black-box-evaluator.ts`

Treats outputs as opaque. Supports two modes:

- **JSON mode** — deep equality check with field-level diff generation. Produces `exact_match`, `field_overlap`, and `diff_count`. Creates a JSON diff artifact file.
- **Raw mode** — byte-level string comparison. Produces `exact_match` and byte length metrics.

Pass condition: exact match only.

### Evaluator Registry {#evaluator-registry}

File: `apps/temporal/src/evaluator-registry.ts`

A simple Map-based registry that stores evaluator instances keyed by their `type` string. Both built-in evaluators are registered at module load time. Custom evaluators can be added via the `registerEvaluator()` function.

## Metrics Pipeline {#metrics-pipeline}

### Per-Sample Metrics {#metrics-per-sample}

Each evaluator returns a `Record<string, number>` of named metrics for each sample. The specific metrics depend on the evaluator (see [Per-Sample Metrics](./benchmarking-guide.md#per-sample-metrics) in the user guide).

### Aggregation {#metrics-aggregation}

File: `apps/temporal/src/benchmark-aggregation.ts`

The `aggregateResults()` function collects all metric names across samples, then computes the following statistics for each metric:

```
interface MetricStatistics {
  name: string;
  mean: number;     // Arithmetic mean
  median: number;   // 50th percentile
  stdDev: number;   // Population standard deviation
  p5: number;       // 5th percentile
  p25: number;      // 25th percentile (Q1)
  p75: number;      // 75th percentile (Q3)
  p95: number;      // 95th percentile
  min: number;      // Minimum value
  max: number;      // Maximum value
}
```

Percentiles are calculated using **linear interpolation**: for percentile P across N sorted values, the index is `P/100 × (N-1)`. If the index falls between two values, a weighted average is used.

The aggregation also computes overall counts: `totalSamples`, `passingsSamples`, `failingSamples`, and `passRate`.

### Storage Format {#metrics-storage}

The `BenchmarkRun.metrics` JSON field stores a combined structure:

```
{
  // Flat metrics (for baseline comparison and quick access)
  "total_samples": 100,
  "passing_samples": 95,
  "failing_samples": 5,
  "pass_rate": 0.95,
  "f1.mean": 0.92,
  "f1.median": 0.93,
  "f1.stdDev": 0.05,
  "f1.p5": 0.81,
  "f1.p25": 0.88,
  "f1.p75": 0.96,
  "f1.p95": 0.99,
  "f1.min": 0.65,
  "f1.max": 0.99,

  // Structured aggregate (for drill-down)
  "_aggregate": {
    "overall": { ... },
    "sliced": [ ... ],
    "failureAnalysis": { ... }
  },

  // Per-sample results (for sample browsing)
  "perSampleResults": [
    {
      "sampleId": "sample-1",
      "metrics": { "f1": 0.92, "precision": 0.95, "recall": 0.89 },
      "diagnostics": { ... },
      "pass": true,
      "groundTruth": { ... },
      "prediction": { ... }
    }
  ]
}
```

The flat keys (like `f1.mean`) are produced by the `flattenMetrics()` helper in the workflow, which converts `AggregatedMetrics` into a flat `Record<string, number>`. These are the keys used by baseline comparison.

### Sliced Metrics {#metrics-slicing}

When `sliceDimensions` is configured, the aggregation groups samples by metadata dimension values and computes separate `AggregatedMetrics` for each group:

```
interface SlicedMetrics {
  dimension: string;                          // e.g. "docType"
  slices: Record<string, AggregatedMetrics>;  // e.g. { "invoice": {...}, "receipt": {...} }
}
```

Metadata is read from the sample's `diagnostics.metadata` field. Samples with missing dimension values are grouped under `"unknown"`.

### Failure Analysis {#metrics-failure-analysis}

The `performFailureAnalysis()` function produces two outputs:

- **Worst samples** — the N samples with the lowest value for a given metric (default: bottom 10 by `f1`), sorted ascending. Each entry includes the sample ID, metric value, all metrics, and diagnostics.
- **Per-field error breakdown** — (schema-aware evaluator only) aggregates comparison results across all samples to compute, for each field: total occurrences, match count, missing count, mismatch count, and error rate. Sorted by error rate descending.

## Baseline Comparison {#baseline-comparison}

File: `apps/temporal/src/activities/benchmark-baseline-comparison.ts`

The comparison activity runs after every completed run. It:

1. Looks up the baseline run for the same definition (the run with `isBaseline: true`).
2. Iterates over all numeric metrics in both runs.
3. For each metric, computes the absolute delta and percentage change.
4. Checks the metric against any matching threshold:
    - **Absolute:** `currentValue ≥ threshold.value`
    - **Relative:** `currentValue ≥ baselineValue × threshold.value`
5. Stores the `BaselineComparison` result on the run record.
6. Tags the run with `regression: "true"` if any metric failed its threshold.

```
interface BaselineComparison {
  baselineRunId: string;
  overallPassed: boolean;
  metricComparisons: MetricComparison[];
  regressedMetrics: string[];
}

interface MetricComparison {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  delta: number;
  deltaPercent: number;
  passed: boolean;
  threshold?: MetricThreshold;
}

interface MetricThreshold {
  metricName: string;
  type: "absolute" | "relative";
  value: number;
}
```

### Threshold Types {#threshold-types}

| Type | Rule | Example |
| --- | --- | --- |
| `absolute` | Current value must be ≥ threshold value. | `f1.mean ≥ 0.90` — F1 must be at least 0.90 regardless of baseline. |
| `relative` | Current value must be ≥ baseline value × threshold value. | `pass_rate ≥ baseline × 0.95` — pass rate can drop by at most 5% from the baseline. |

## Object Storage {#storage}

The benchmarking system accesses object storage through a `BlobStorageInterface` abstraction, supporting both **MinIO** (S3-compatible, default for local development) and **Azure Blob Storage** (for cloud deployments). The active provider is selected via the `BLOB_STORAGE_PROVIDER` environment variable (`"minio"` or `"azure"`).

Datasets are stored with the following structure:

```
datasets/{datasetId}/{version}/
  ├── dataset-manifest.json
  ├── inputs/
  │   ├── sample-1.pdf
  │   └── sample-2.pdf
  └── ground_truth/
      ├── sample-1.json
      └── sample-2.json
```

### Dataset Materialization

The materialization activity downloads all files under the `storagePrefix` to a local cache directory:

- Cache directory: `{BENCHMARK_CACHE_DIR}/{groupId}/{datasetId}-{datasetVersionId}`, where `groupId` is the dataset's group and `BENCHMARK_CACHE_DIR` defaults to `/tmp/benchmark-cache`.
- A run reads and writes local files only inside its own group's directory, `{BENCHMARK_CACHE_DIR}/{groupId}`.
- On cache hit (manifest file exists locally), the download is skipped.
- On failure, the partial cache directory is removed.

## Environment Variables {#env-vars}

| Variable | Default | Description |
| --- | --- | --- |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address. |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace. |
| `BENCHMARK_TASK_QUEUE` | `benchmark-processing` | Task queue for benchmark workflows. |
| `BENCHMARK_CACHE_DIR` | `/tmp/benchmark-cache` | Root of the materialized dataset cache; each group's datasets go in a `{groupId}` subdirectory. |
| `WORKER_IMAGE_DIGEST` | (none) | Docker image digest of the benchmark worker (optional, for reproducibility tracking). |
| `DATABASE_URL` | (required) | PostgreSQL connection string. |
| Object Storage |
| `BLOB_STORAGE_PROVIDER` | `minio` | Storage backend: `"minio"` or `"azure"`. |
| `MINIO_ENDPOINT` | (required for MinIO) | MinIO server endpoint. |
| `MINIO_ACCESS_KEY` | (required for MinIO) | MinIO access key. |
| `MINIO_SECRET_KEY` | (required for MinIO) | MinIO secret key. |
| `MINIO_DOCUMENT_BUCKET` | (required for MinIO) | MinIO bucket name for document storage. |
| `AZURE_STORAGE_CONNECTION_STRING` | (required for Azure) | Azure Blob Storage connection string. |
| `AZURE_STORAGE_CONTAINER_NAME` | (required for Azure) | Azure Blob Storage container name. |

## Key Files Reference {#key-files}

### Backend Services

| File | Purpose |
| --- | --- |
| `apps/backend-services/src/benchmark/benchmark-run.service.ts` | Run lifecycle, metrics retrieval, drill-down, per-sample results filtering. |
| `apps/backend-services/src/benchmark/benchmark-run.controller.ts` | Run REST endpoints. |
| `apps/backend-services/src/benchmark/benchmark-definition.service.ts` | Definition CRUD, scheduling. |
| `apps/backend-services/src/benchmark/benchmark-definition.controller.ts` | Definition REST endpoints. |
| `apps/backend-services/src/benchmark/benchmark-project.service.ts` | Project CRUD. |
| `apps/backend-services/src/benchmark/benchmark-project.controller.ts` | Project REST endpoints. |
| `apps/backend-services/src/benchmark/dataset.service.ts` | Dataset versioning, upload, validation. |
| `apps/backend-services/src/benchmark/dataset.controller.ts` | Dataset REST endpoints. |
| `apps/backend-services/src/benchmark/hitl-dataset.service.ts` | HITL-to-dataset bridge: eligible document queries, ground truth construction, dataset packaging. |
| `apps/backend-services/src/benchmark/hitl-dataset.controller.ts` | HITL dataset creation REST endpoints. |
| `apps/backend-services/src/benchmark/ground-truth-generation.service.ts` | Ground truth generation: job creation, OCR workflow triggering, review queue, GT extraction on approval. |
| `apps/backend-services/src/benchmark/ground-truth-generation.controller.ts` | Ground truth generation REST endpoints. |
| `apps/backend-services/src/benchmark/benchmark-temporal.service.ts` | Temporal client wrapper for starting runs. |
| `apps/backend-services/src/benchmark/evaluator-registry.service.ts` | Backend-side evaluator registry. |

### Temporal Workflows & Activities

| File | Purpose |
| --- | --- |
| `apps/temporal/src/benchmark-workflow.ts` | Main orchestrator workflow. |
| `apps/temporal/src/benchmark-aggregation.ts` | Metrics aggregation and failure analysis. |
| `apps/temporal/src/benchmark-types.ts` | Core type definitions (evaluator interface, result types). |
| `apps/temporal/src/evaluator-registry.ts` | Evaluator plugin registry. |
| `apps/temporal/src/evaluators/schema-aware-evaluator.ts` | Schema-aware evaluator implementation. |
| `apps/temporal/src/evaluators/black-box-evaluator.ts` | Black-box evaluator implementation. |
| `apps/temporal/src/activities/benchmark-execute.ts` | Child workflow execution per sample. |
| `apps/temporal/src/activities/benchmark-materialize.ts` | Dataset materialization and manifest loading. |
| `apps/temporal/src/activities/benchmark-evaluate.ts` | Evaluation and aggregation activities. |
| `apps/temporal/src/activities/benchmark-baseline-comparison.ts` | Baseline comparison logic. |
| `apps/temporal/src/activities/benchmark-write-prediction.ts` | Write prediction to disk. |
| `apps/temporal/src/activities/benchmark-update-run.ts` | Database status updates. |

### Data Model

| File | Purpose |
| --- | --- |
| `apps/shared/prisma/schema.prisma` | Prisma schema (benchmark models at lines ~380–540). |
