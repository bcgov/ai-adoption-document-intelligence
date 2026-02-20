# Benchmarking System - Operational Guide

This document explains how the benchmarking system works, its key concepts, and how to use it day-to-day.

## Core Concepts

### Projects, Definitions, and Runs

The benchmarking system has three levels of hierarchy:

```
Project (organizational container)
  └── Definition (what to benchmark — the recipe)
        └── Run (a single execution of that recipe)
```

**Project** — A logical grouping for related benchmarking work. Maps 1:1 to an MLflow Experiment. Example: "Invoice Extraction Quality Q1 2026".

**Definition** — A precise, reproducible specification of *what* to benchmark. It pins together:
- A dataset version + split (the test data)
- A workflow (the processing pipeline to evaluate)
- A workflow config hash (snapshot of the workflow config at creation time)
- An evaluator type and config (how to score the results)
- Runtime settings (concurrency, timeouts, queue)
- Artifact policy (what outputs to store)

**Run** — A single execution of a definition. Each run produces metrics, per-sample results, and artifacts.

### Immutability

A definition starts as **mutable** (`immutable=false`). You can edit it freely before running it. The moment you trigger the first run, the definition becomes **immutable** (`immutable=true`). This ensures that every run against that definition used identical settings, so results are directly comparable.

If you need to change something on an immutable definition (via `PUT`), the system creates a **new definition** with an incremented `revision` number. The original stays untouched, preserving the history of all runs against it.

## Why Multiple Runs?

This is the central design question. If a definition is immutable and pins everything down, why would you ever get different results?

**The definition pins the workflow *config* (via `workflowConfigHash`), but not the *implementation*.** A workflow config describes the shape of the DAG — which nodes, which connections, which activity types. But the actual code that runs inside each activity can change independently. Specifically:

### What the definition pins (stays constant across runs)

- Dataset version and split (exact documents and ground truth)
- Workflow DAG structure and configuration
- Evaluator type and scoring configuration
- Runtime settings (concurrency, timeouts)

### What can change between runs

| Source of variation | Example |
|---|---|
| **Activity code updates** | You deploy a new version of an extraction activity that uses a better prompt or algorithm. The workflow config hash is the same (same DAG shape), but the activity implementation changed. |
| **External model/API changes** | A workflow node calls an external LLM or OCR service. The provider updates their model, or you switch model versions in your environment config. |
| **Worker version** | You rebuild and deploy new worker Docker images. Each run records `workerGitSha` and `workerImageDigest` so you can trace which code was running. |
| **Non-deterministic behavior** | LLM responses with temperature > 0, race conditions in parallel processing, or external services returning different results at different times. |
| **Infrastructure differences** | Different resource allocation, caching state, or network conditions. |

### Primary use cases for re-running

1. **Regression detection** — Run the same definition on a schedule (nightly, weekly) to catch when metrics degrade after a deployment. This is the main use case.
2. **Before/after comparison** — Run before deploying a code change, deploy, then run again. Same definition, different code version. Compare metrics.
3. **Validating a fix** — A previous run failed or showed poor results. After fixing the issue, re-run to confirm improvement.
4. **Measuring non-determinism** — Run multiple times back-to-back to understand how much variance your pipeline has.

## Workflow: Step by Step

### 1. Prepare a Dataset

Datasets are versioned collections of test documents with ground truth annotations, stored in Git + DVC.

```
POST /api/benchmark/datasets
  → Upload files: POST /api/benchmark/datasets/:id/upload
  → Create version: POST /api/benchmark/datasets/:id/versions
  → Publish: PATCH /api/benchmark/datasets/:id/versions/:vId/publish
  → Create splits: POST /api/benchmark/datasets/:id/versions/:vId/splits
  → Freeze golden split: POST .../splits/:splitId/freeze
```

See [DATASET_REPOSITORY_SETUP.md](./DATASET_REPOSITORY_SETUP.md) for repository configuration.

A **split** defines which subset of the dataset to use (e.g., `test`, `golden`). Freezing a split locks its sample list so it cannot be modified.

### 2. Create a Project

```
POST /api/benchmark/projects
  { "name": "My Benchmark Project", "description": "..." }
```

This also creates an MLflow Experiment automatically.

### 3. Create a Definition

```
POST /api/benchmark/projects/:projectId/definitions
{
  "name": "Baseline extraction v2",
  "datasetVersionId": "...",
  "splitId": "...",
  "workflowId": "...",
  "evaluatorType": "schema-aware",
  "evaluatorConfig": { ... },
  "runtimeSettings": {
    "maxParallelDocuments": 10,
    "perDocumentTimeout": 300000,
    "useProductionQueue": false
  },
  "artifactPolicy": { "type": "full" }
}
```

**Evaluator types:**
- `schema-aware` — Compares structured field outputs against typed ground truth. Supports exact, fuzzy, numeric tolerance, and date normalization matching. Produces precision, recall, and F1 per field.
- `black-box` — JSON deep-equal comparison with diff output. Useful when you don't need field-level scoring.

**Artifact policies:**
- `full` — Store all outputs for every document.
- `failures_only` — Only store outputs for documents that had errors or low scores.
- `sampled` — Store a configurable percentage of outputs.

### 4. Start a Run

```
POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs
```

This:
1. Creates a `BenchmarkRun` record (status: `pending`)
2. Locks the definition (`immutable=true`) on first run
3. Starts a `benchmarkRunWorkflow` Temporal workflow

The Temporal workflow:
1. Materializes the dataset (git clone + DVC pull at pinned version)
2. Fans out per document — runs each through the workflow as a child `graphWorkflow`
3. Evaluates each sample against ground truth
4. Aggregates metrics across all samples
5. Logs everything to MLflow
6. Updates the run record in Postgres

### 5. View Results

**Run detail page** (`/benchmarking/projects/:id/runs/:runId`) shows:
- Status and timing
- Aggregated metrics
- Baseline comparison (if a baseline exists)
- MLflow and Temporal links for deeper inspection
- Artifacts (filterable by type)
- Drill-down summary (worst-performing samples, field error breakdown)

**Per-sample results** (`/benchmarking/projects/:id/runs/:runId/drill-down`) shows:
- Individual document scores
- Filterable by metadata dimensions (document type, language, page count, etc.)
- Click any sample to see ground truth vs. prediction side by side

### 6. Establish a Baseline

Once you have a run you're satisfied with, promote it to baseline:

```
POST /api/benchmark/projects/:projectId/runs/:runId/baseline
{
  "thresholds": {
    "f1_score": { "type": "absolute", "value": 0.90 },
    "precision": { "type": "relative", "value": 0.05 }
  }
}
```

**Threshold types:**
- `absolute` — The metric must be at or above this value. E.g., F1 >= 0.90.
- `relative` — The metric must not drop by more than this fraction relative to the baseline value. E.g., precision must not decrease by more than 5%.

Only one baseline exists per definition at a time. Promoting a new baseline demotes the previous one.

After a baseline is set, every subsequent completed run is automatically compared against it. Regressions are flagged with severity levels (Warning / Critical) on the run list and detail pages.

### 7. Set Up Scheduled Runs (Optional)

```
POST /api/benchmark/projects/:projectId/definitions/:definitionId/schedule
{
  "enabled": true,
  "cron": "0 2 * * *"  // Every night at 2 AM
}
```

Scheduled runs are the primary mechanism for continuous regression monitoring.

### 8. Compare Runs

Select 2-5 runs from the project page and click "Compare" to open a side-by-side view:
- Metrics comparison with deltas
- Parameter differences highlighted with "Changed" badges
- Exportable as CSV or JSON

Route: `/benchmarking/projects/:id/compare?runs=id1,id2,...`

### 9. Regression Reports

When a run has a baseline comparison, view the full regression report:

Route: `/benchmarking/projects/:id/runs/:runId/regression`

Shows:
- Pass/fail status per metric with threshold details
- Delta and delta % for each metric
- Severity classification (Warning vs Critical)
- Historical trend chart
- Filterable to show only regressions
- Exportable as JSON or HTML

## Typical Scenarios

### Scenario: Evaluating a new model version

1. You already have a project with a definition and a baseline run.
2. Deploy the new model version to your workers.
3. Re-run the same definition: `POST .../definitions/:defId/runs`
4. Compare the new run against the baseline on the run detail page.
5. If metrics improved, promote the new run to baseline.

### Scenario: Nightly regression monitoring

1. Create a definition with your production workflow and golden dataset split.
2. Promote an initial run to baseline with thresholds.
3. Enable a nightly cron schedule on the definition.
4. Every morning, check the project page for regression badges on the latest run.

### Scenario: A/B testing two workflow approaches

1. Create two definitions in the same project — one for each workflow variant.
2. Run both against the same dataset version and split.
3. Use the comparison page to evaluate metrics side by side.

### Scenario: Editing a definition after it has been run

1. You realize you want to change the evaluator config.
2. `PUT .../definitions/:defId` with the new config.
3. The system creates a new definition (revision 2) since the original is immutable.
4. The original definition and all its runs remain intact.
5. Run the new definition to get results with the updated config.

## API Reference Summary

| Area | Endpoint | Description |
|---|---|---|
| Datasets | `POST /api/benchmark/datasets` | Create dataset |
| | `POST .../datasets/:id/upload` | Upload files |
| | `POST .../datasets/:id/versions` | Create version |
| | `PATCH .../versions/:vId/publish` | Publish version |
| | `POST .../versions/:vId/splits` | Create split |
| | `POST .../splits/:splitId/freeze` | Freeze split |
| Projects | `POST /api/benchmark/projects` | Create project |
| | `GET /api/benchmark/projects` | List projects |
| Definitions | `POST .../projects/:id/definitions` | Create definition |
| | `PUT .../definitions/:defId` | Update (new revision if immutable) |
| | `POST .../definitions/:defId/schedule` | Configure cron schedule |
| Runs | `POST .../definitions/:defId/runs` | Start run |
| | `GET .../projects/:id/runs` | List runs |
| | `GET .../runs/:runId` | Run details + metrics |
| | `POST .../runs/:runId/cancel` | Cancel running benchmark |
| | `POST .../runs/:runId/baseline` | Promote to baseline |
| | `GET .../runs/:runId/drill-down` | Worst samples, error breakdown |
| | `GET .../runs/:runId/samples` | Per-sample results (paginated) |
| | `GET .../runs/:runId/artifacts` | List artifacts |

## Key Data Model

```
BenchmarkProject
  ├── BenchmarkDefinition (many)
  │     ├── datasetVersionId → DatasetVersion → Dataset
  │     ├── splitId → Split
  │     ├── workflowId → Workflow
  │     ├── workflowConfigHash (SHA-256 snapshot)
  │     ├── immutable, revision
  │     └── BenchmarkRun (many)
  │           ├── status, metrics, params, tags
  │           ├── mlflowRunId, temporalWorkflowId
  │           ├── workerGitSha, workerImageDigest
  │           ├── isBaseline, baselineThresholds, baselineComparison
  │           └── BenchmarkArtifact (many)
  └── mlflowExperimentId
```

## External Integrations

- **MLflow** — Every project maps to an MLflow Experiment. Every run maps to an MLflow Run. Metrics, parameters, tags, and artifacts are logged automatically. Use the MLflow UI for deep artifact inspection and experiment-level comparisons.
- **Temporal** — Runs execute as `benchmarkRunWorkflow` on the `benchmark-processing` queue. Each run links to its Temporal workflow execution for tracing and debugging.
- **MinIO** — Artifacts and DVC-managed dataset files are stored in MinIO.
