---
title: "Benchmarking Guide"
---

# Benchmarking System Guide

The benchmarking system evaluates your document processing workflows by running them against curated datasets with ground truth, then measuring accuracy, detecting regressions, and comparing results across workflow versions.

::: info Prerequisites
The benchmarking system requires **object storage** (**MinIO** for local development or **Azure Blob Storage** for cloud deployments) and **Temporal** (workflow orchestration) to be running. See the [Benchmarking Architecture](./benchmarking-technical.md) for setup instructions.
:::

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
    - [Projects and Definitions](#projects-and-definitions)
    - [Datasets and Versions](#datasets-and-versions)
    - [Splits](#splits)
    - [Evaluators](#evaluators)
- [Understanding Per-Sample Metrics](#per-sample-metrics)
    - [Schema-Aware Evaluator Metrics](#schema-aware-metrics)
    - [Black-Box Evaluator Metrics](#black-box-metrics)
    - [Pass / Fail Determination](#pass-fail)
- [Understanding Aggregate (Run-Level) Metrics](#aggregate-metrics)
    - [Summary Counts](#summary-counts)
    - [Statistical Measures](#statistical-measures)
    - [Reading Aggregate Metrics](#reading-aggregate-metrics)
- [Setting Up a Benchmark](#workflow-setup)
    - [Creating Datasets from Verified Documents](#hitl-datasets)
    - [Generating Ground Truth via HITL Review](#gt-generation)
- [Running Benchmarks](#running-benchmarks)
- [Baseline Management & Regression Detection](#baseline-management)
- [Drill-Down & Failure Analysis](#drill-down)
- [Comparing Runs](#comparing-runs)
- [Sliced Metrics](#sliced-metrics)
- [Deleting Resources](#deleting-resources)
- [Scheduled Benchmarks](#scheduling)

## Overview {#overview}

The benchmarking system answers one question: **"How well does my workflow perform, and has it gotten worse?"** It is workflow-agnostic — it can evaluate any graph workflow configuration. The system wraps your existing workflow execution with dataset management, automated evaluation, metric tracking, and regression detection.

### Datasets

Upload documents with ground truth, organise them into versioned snapshots that are automatically frozen when benchmarked, and optionally split them into train/test/golden subsets.

### Evaluation

Pluggable evaluators compare workflow predictions against ground truth and produce per-sample metrics such as precision, recall, and F1.

### Regression Detection

Promote any run to a baseline, define metric thresholds, and automatically detect regressions in subsequent runs.

## Core Concepts {#core-concepts}

### Projects and Definitions {#projects-and-definitions}

The hierarchy is: **Project → Definition → Run**.

| Entity | Description |
| --- | --- |
| **Benchmark Project** | A named container that groups related benchmark definitions and runs. Example: "Invoice Processing Q1". |
| **Benchmark Definition** | Pins together a specific dataset version, an optional split, a workflow, an evaluator type and configuration, and runtime settings. Each definition is a repeatable test specification. |
| **Benchmark Run** | A single execution of a definition. Produces per-sample evaluation results, aggregated metrics, and an optional baseline comparison. |

### Datasets and Versions {#datasets-and-versions}

A **Dataset** is a named collection of documents. Each dataset has one or more **Dataset Versions**. A version starts as mutable — you can upload files and delete samples freely. When a benchmark run is started against a version, it is automatically **frozen**, preventing any further modifications. This ensures that benchmark results are reproducible. A version consists of:

- A **dataset manifest** (`dataset-manifest.json`) listing every sample, its input files, ground truth files, and metadata.
- **Input files** — the documents to process (e.g. PDFs, images).
- **Ground truth files** — JSON files containing the expected output for each sample.
- An optional **ground truth schema** used for validation.

All files are stored in object storage (MinIO or Azure Blob Storage) under a per-version storage prefix.

::: details Example dataset manifest
```json
{
  "schemaVersion": "1.0",
  "samples": [
    {
      "id": "sample-1",
      "inputs": [
        { "path": "inputs/invoice-1.pdf", "mimeType": "application/pdf" }
      ],
      "groundTruth": [
        { "path": "ground_truth/invoice-1.json", "format": "json" }
      ],
      "metadata": {
        "docType": "invoice",
        "language": "en",
        "source": "vendor-A"
      }
    }
  ],
  "splits": {
    "train": ["sample-1", "sample-2"],
    "test": ["sample-10", "sample-11"]
  }
}
```
:::

### Splits {#splits}

A **Split** is a named subset of samples within a dataset version. Splits partition samples for different purposes:

| Split Type | Purpose |
| --- | --- |
| `train` | Samples used for training or tuning (not typically benchmarked). |
| `val` | Validation samples for parameter tuning. |
| `test` | Held-out samples for unbiased evaluation. |
| `golden` | Curated, high-confidence samples for critical regression checks. |

When a benchmark definition references a split, only the samples in that split are processed during a run. If no split is specified, all samples in the dataset version are used.

::: warning Automatic Freezing
When a benchmark run starts, the referenced dataset version and split (if any) are automatically **frozen**. Frozen versions cannot have files uploaded or samples deleted, and frozen splits cannot have their sample list modified. This ensures benchmark results remain reproducible. To iterate on your data, create a new dataset version. You can also manually freeze a version or split before running benchmarks via the freeze endpoints.
:::

### Evaluators {#evaluators}

An **Evaluator** is a pluggable component that compares workflow predictions against ground truth and produces per-sample metrics. Two evaluators are built in:

### Schema-Aware

Compares predicted and expected values field-by-field. Supports configurable matching rules (exact, fuzzy, numeric, date, boolean) per field. Produces **precision**, **recall**, and **F1** metrics.

Best for structured extraction workflows where you know which fields to expect.

### Black-Box

Treats outputs as opaque. Performs deep JSON equality or raw byte comparison and produces **exact\_match** and **field\_overlap** metrics.

Best for workflows where you care about exact output reproduction.

## Understanding Per-Sample Metrics {#per-sample-metrics}

Each sample in a benchmark run is evaluated individually. The evaluator compares the workflow's prediction against the ground truth and produces a set of numeric metrics. Which metrics you get depends on the evaluator type.

### Schema-Aware Evaluator Metrics {#schema-aware-metrics}

The schema-aware evaluator performs **field-level comparison** between the predicted JSON and the ground truth JSON. It categorises each field into one of three outcomes:

| Outcome | Meaning |
| --- | --- |
| **True Positive (TP)** | Field exists in ground truth _and_ the prediction matched (per the matching rule). |
| **False Positive (FP)** | Field exists in the prediction but _not_ in the ground truth (extra field). |
| **False Negative (FN)** | Field exists in the ground truth but is missing or mismatched in the prediction. |

From these counts the evaluator calculates:

| Metric | Formula | Interpretation |
| --- | --- | --- |
| **Precision** | `TP / (TP + FP)` | Of all fields the workflow produced, what fraction were correct? A precision of 1.0 means the workflow never produced a wrong or extra field. _Low precision_ means the workflow is producing junk fields or incorrect values. |
| **Recall** | `TP / (TP + FN)` | Of all fields expected in the ground truth, what fraction did the workflow find correctly? A recall of 1.0 means nothing was missed. _Low recall_ means the workflow is missing fields. |
| **F1 Score** | `2 × P × R / (P + R)` | The harmonic mean of precision and recall. Balances both concerns into a single number between 0 and 1. An F1 of 1.0 means perfect extraction; 0.0 means total failure. |
| **Checkbox Accuracy** | `matched booleans / total booleans` | For boolean/checkbox fields specifically, the fraction that were correctly predicted. |

In addition to these primary metrics, the evaluator also emits the underlying **count metrics** that feed the formulas above:

| Metric | Description |
| --- | --- |
| `truePositives` | Number of fields correctly matched. |
| `falsePositives` | Number of predicted fields with no corresponding ground truth field (extra fields). |
| `falseNegatives` | Number of ground truth fields missing or mismatched in the prediction. |
| `totalGroundTruthFields` | Total number of fields defined in the ground truth. |
| `matchedFields` | Number of fields that matched (same as truePositives). |

::: info Why F1 instead of simple accuracy?
Simple accuracy (% correct) can be misleading when the number of expected fields varies between samples. F1 combines precision and recall into a single score that penalises both false extractions and missed fields equally, making it a more reliable single-number summary.
:::

::: details Worked example
Ground truth has 5 fields: `invoice_number`, `date`, `total`, `vendor`, `currency`.

The workflow predicts 4 fields: `invoice_number` (correct), `date` (correct), `total` (wrong value), `tax_id` (extra, not in ground truth).

- **TP = 2** (invoice\_number, date)
- **FP = 1** (tax\_id is extra)
- **FN = 3** (total mismatched, vendor missing, currency missing)

- Precision = 2 / (2 + 1) = **0.667**
- Recall = 2 / (2 + 3) = **0.400**
- F1 = 2 × 0.667 × 0.400 / (0.667 + 0.400) = **0.500**
:::

#### Matching Rules

The schema-aware evaluator supports configurable matching rules per field. The default rule is **exact** match (string equality). You can override this in the evaluator configuration:

| Rule | Behaviour | Configuration |
| --- | --- | --- |
| `exact` | String equality after coercing both values to strings. | None. |
| `fuzzy` | Levenshtein similarity ≥ threshold. Useful for OCR outputs with minor character-level errors. | `fuzzyThreshold` (default: 0.8) |
| `numeric` | Numeric comparison with optional absolute or relative tolerance. Handles comma-separated numbers. | `numericAbsoluteTolerance`, `numericRelativeTolerance` |
| `date` | Parses dates and compares normalised YYYY-MM-DD values. Handles different input formats. | `dateFormats` (optional hint) |
| `boolean` | Parses boolean-like values (`true`/`yes`/`1`) and compares. | None. |

#### Evaluator Config Reference {#evaluator-config}

When creating a benchmark definition, you set `evaluatorType` and `evaluatorConfig` as **separate fields**. The `evaluatorConfig` JSON is passed directly to the evaluator. Here is the complete set of available options for the schema-aware evaluator:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `passThreshold` | number | `1.0` | Minimum F1 score for a sample to pass. Set to `0.9` to allow minor mismatches. |
| `defaultRule` | FieldMatchingRule | `{ "rule": "exact" }` | Default matching rule applied to fields not listed in `fieldRules`. |
| `fieldRules` | Record\<string, FieldMatchingRule> | `{}` | Per-field overrides keyed by field name. |

Each `FieldMatchingRule` object supports:

| Key | Type | Applies to | Description |
| --- | --- | --- | --- |
| `rule` | string | all | One of: `"exact"`, `"fuzzy"`, `"numeric"`, `"date"`, `"boolean"`. |
| `fuzzyThreshold` | number | `fuzzy` | Minimum Levenshtein similarity (0.0–1.0). Default: `0.8`. |
| `numericAbsoluteTolerance` | number | `numeric` | Maximum absolute difference allowed (e.g. `0.01`). |
| `numericRelativeTolerance` | number | `numeric` | Maximum relative difference allowed as fraction (e.g. `0.05` = 5%). |
| `dateFormats` | string\[\] | `date` | Optional hint for accepted date formats (e.g. `["YYYY-MM-DD", "MM/DD/YYYY"]`). |

::: details Complete example: schema-aware evaluatorConfig
This is the JSON you enter into the **Evaluator Config** field when creating a definition with `evaluatorType: "schema-aware"`:

```json
{
  "passThreshold": 0.9,
  "defaultRule": { "rule": "exact" },
  "fieldRules": {
    "total_amount": {
      "rule": "numeric",
      "numericAbsoluteTolerance": 0.01
    },
    "vendor_name": {
      "rule": "fuzzy",
      "fuzzyThreshold": 0.85
    },
    "invoice_date": {
      "rule": "date",
      "dateFormats": ["YYYY-MM-DD", "MM/DD/YYYY"]
    },
    "is_taxable": {
      "rule": "boolean"
    }
  }
}
```
:::

::: details Complete example: black-box evaluatorConfig
The black-box evaluator does not use any configuration options. Pass an empty object:

```json
{}
```
:::

### Black-Box Evaluator Metrics {#black-box-metrics}

The black-box evaluator treats outputs as opaque. It operates in two modes depending on the content type:

#### JSON Mode

Used when both prediction and ground truth are valid JSON objects. Produces:

| Metric | Interpretation |
| --- | --- |
| `exact_match` | `1.0` if the prediction is identical to ground truth (deep JSON equality); `0.0` otherwise. |
| `field_overlap` | The fraction of keys (union of prediction and ground truth keys) where both sides have the same value. Ranges from 0.0 to 1.0. |
| `diff_count` | Number of individual differences found (added, deleted, or changed fields/elements). |

JSON mode also produces a **diff artifact** — a JSON file listing every difference path, type (`added`/`deleted`/`changed`), and the expected vs. actual values.

#### Raw Mode

Used when content is not JSON (e.g. plain text, raw bytes). Produces:

| Metric | Interpretation |
| --- | --- |
| `exact_match` | `1.0` if the raw content matches byte-for-byte; `0.0` otherwise. |
| `byte_length_prediction` | Byte length of the prediction content. |
| `byte_length_groundtruth` | Byte length of the ground truth content. |

### Pass / Fail Determination {#pass-fail}

Each sample is marked **pass** or **fail** based on evaluator-specific rules:

- **Schema-aware:** A sample passes when its F1 score ≥ `passThreshold` (default: 1.0, i.e., every field must match).
- **Black-box:** A sample passes only on exact match.

## Understanding Aggregate (Run-Level) Metrics {#aggregate-metrics}

After all samples in a run are evaluated, the system aggregates the individual results into run-level statistics. These give you a bird's-eye view of how the workflow performed across the entire dataset.

### Summary Counts {#summary-counts}

| Metric | Description |
| --- | --- |
| **total\_samples** | Total number of samples processed in the run. |
| **passing\_samples** | Number of samples that passed the evaluator's threshold. |
| **failing\_samples** | Number of samples that failed (including execution errors). |
| **pass\_rate** | Fraction of samples that passed: `passing_samples / total_samples`. Ranges from 0.0 to 1.0. |

### Statistical Measures {#statistical-measures}

For each per-sample metric (e.g. `f1`, `precision`, `recall`, `exact_match`), the system computes the following statistics across all samples:

| Statistic | Key Format | What It Tells You |
| --- | --- | --- |
| **Mean** | `metric.mean` | The average value. The simplest summary — add up all sample values and divide by the count. Sensitive to outliers: a few very bad samples can pull the mean down. |
| **Median** | `metric.median` | The middle value when samples are sorted. Unlike the mean, the median is robust to outliers. If the median is much higher than the mean, you likely have a small number of very poor samples dragging the average down. |
| **Standard Deviation** | `metric.stdDev` | Measures how spread out the values are around the mean. A low standard deviation means results are consistent across samples; a high value means performance varies widely. Calculated as the population standard deviation. |
| **Min** | `metric.min` | The worst score among all samples. Useful for identifying the floor of performance. |
| **Max** | `metric.max` | The best score among all samples. |
| **5th Percentile (P5)** | `metric.p5` | The value below which 5% of samples fall. Represents the "worst-case tail" — useful for SLAs where you need to know "at minimum 95% of documents score above X". |
| **25th Percentile (P25 / Q1)** | `metric.p25` | The lower quartile. 25% of samples score below this value. Together with P75, defines the interquartile range (IQR). |
| **75th Percentile (P75 / Q3)** | `metric.p75` | The upper quartile. 75% of samples score below this value. The IQR (P75 minus P25) shows where the "middle 50%" of your data sits. |
| **95th Percentile (P95)** | `metric.p95` | The value below which 95% of samples fall. Almost all samples score at or below this level — useful for identifying if the top end is consistent. |

::: info How percentiles are calculated
The system uses **linear interpolation**. For example, the P25 of 100 sorted values is the value at position 24.75 — computed as 75% of value at index 24 plus 25% of value at index 25. This is the same method used by most statistics software.
:::

### Reading Aggregate Metrics {#reading-aggregate-metrics}

Here is a practical guide to interpreting a run's aggregate metrics:

### Healthy Run

- `pass_rate` ≥ 0.95
- `f1.mean` and `f1.median` are close together and both high (e.g. 0.92+)
- `f1.stdDev` is low (e.g. \< 0.10)
- `f1.p5` is still acceptable (e.g. ≥ 0.75) — even your worst samples are reasonable

### Warning Signs

- **Mean \<\< Median** — A few catastrophic failures are dragging the average down. Use the drill-down to find the worst samples.
- **High stdDev** — Performance is inconsistent; some document types or qualities may be problematic.
- **Low P5, high P95** — Wide spread indicates a subset of documents the workflow struggles with. Investigate using sliced metrics by metadata dimension.
- **pass\_rate dropping between runs** — A regression may have been introduced. Compare against the baseline.

## Setting Up a Benchmark {#workflow-setup}

The end-to-end process to benchmark a workflow:

### Step 1: Create a Dataset

1. Navigate to **Benchmarking > Datasets** and click **"Create Dataset"**. Enter a name, optional description, and optional metadata key-value pairs.
2. On the **Dataset Detail** page, click **"New Version"** to create a version (optionally give it a name such as "Q4 invoices").
3. A file upload dialog opens automatically — drag and drop or select input documents and their corresponding ground truth files.
4. Review uploaded samples in the **Sample Preview** tab.
5. Optionally validate the dataset using the version's **three-dot menu > "Validate"**, which opens a validation report.
6. Optionally freeze the version via **three-dot menu > "Freeze Version"**. Note: versions are also automatically frozen when a benchmark run starts against them.

### Alternative: Create a Dataset from Verified Documents {#hitl-datasets}

If your documents have already been processed through the OCR pipeline and verified via the Human-In-The-Loop (HITL) review interface, you can create a benchmark dataset directly from them — no separate ground truth files required. The corrected OCR data from approved review sessions becomes the ground truth.

::: info Eligibility
A document is eligible when it has completed OCR processing and has at least one approved HITL review session. If a document has multiple approved sessions, the most recent one is used.
:::

1. Click **"From Verified Documents"** on the Dataset List page (to create a new dataset) or on a Dataset Detail page (to add a version to an existing dataset).
2. Enter a dataset name and description (when creating a new dataset).
3. Select eligible documents from the table. You can search by filename and paginate through the list. The table shows each document's filename, file type, approval date, reviewer, field count, and correction count.
4. Confirm and submit. The system will:
    - Copy the original document files into the dataset's `inputs/` directory.
    - Build ground truth by applying the reviewer's corrections to the OCR results, producing flat key-value JSON files in the `ground-truth/` directory.
    - Generate a `dataset-manifest.json` with provenance metadata (source document ID, review session, reviewer) for each sample.

The resulting dataset is identical in format to one created via file upload and can be used with any evaluator.

::: details How ground truth is constructed from HITL corrections
| Reviewer Action | Effect on Ground Truth |
| --- | --- |
| **Confirmed** | Original OCR value is kept as-is (verified correct). |
| **Corrected** | Field value is replaced with the reviewer's corrected value. |
| **Deleted** | Field is removed from the ground truth. |
| **Flagged** | Field is kept as-is (flagged but still included). |

The output uses the same flat key-value format as uploaded ground truth — for example, `{"vendor_name": "Acme Corp", "total_amount": 1250.75, "invoice_date": "2026-01-15"}`. Field values are resolved using the same extraction logic as the benchmark workflow (selection marks, numbers, dates, strings).
:::

### Alternative: Generate Ground Truth via HITL Review {#gt-generation}

If you have documents but **no ground truth**, you can generate it by running the documents through an OCR workflow and reviewing the results in a dedicated, dataset-scoped HITL queue. This is the third pathway for creating dataset ground truth.

::: info When to use this
Use this pathway when you have raw documents (PDFs, images) but no pre-existing ground truth. The system runs OCR, then lets a reviewer correct the results — the corrected output becomes ground truth. This is useful for bootstrapping a benchmark dataset from scratch.
:::

1. Upload documents **without ground truth files** to a dataset version (input files only).
2. Navigate to the dataset detail page and select the version. Click the **"Ground Truth"** tab.
3. Select a **workflow template** from the dropdown (e.g., your standard OCR workflow) and click **"Start Generation"**.
4. The system creates a ground truth generation job for each sample that lacks ground truth. Each job:
    - Creates a Document record and copies the input file to document storage.
    - Starts the selected OCR workflow with the model ID from the workflow configuration.
    - The workflow runs to completion (the confidence gate is bypassed so the workflow does not pause for human review during processing).
5. Monitor progress on the **Ground Truth** tab — a progress bar and job table show the status of each sample (Pending → Processing → Awaiting Review).
6. Once jobs reach **"Awaiting Review"**, click **"Open Review Queue"** to open the dataset-scoped HITL review queue.
7. Review each document using the same HITL review interface used in production — view OCR results, make corrections, and approve.
8. On approval, the system automatically extracts ground truth from the OCR results plus your corrections and writes it to the dataset storage. The dataset manifest is updated with the new ground truth entry.

::: warning Separate Queue
Documents in the ground truth generation queue are **completely isolated** from the production HITL queue. They will never appear in the production review queue, and production documents will never appear in the dataset review queue.
:::

::: details How ground truth generation works under the hood
The ground truth generation process creates a `DatasetGroundTruthJob` record per sample, tracking its lifecycle: `pending` → `processing` → `awaiting_review` → `completed` (or `failed`).

For each job, a real `Document` record is created in the database — this allows the existing OCR workflow and HITL review system to process it like any other document. The key difference is:

- The workflow runs with `confidenceThreshold: 0`, so it always skips the human review gate and runs straight through to storing OCR results.
- The `model_id` is read from the workflow configuration's `ctx.modelId.defaultValue`, so it uses whatever model the workflow is configured for.
- The document is linked to the `DatasetGroundTruthJob` via a unique foreign key, which causes the production HITL queue to exclude it.

After HITL approval, the same `buildGroundTruth()` logic used by the "From Verified Documents" pathway is invoked to construct flat key-value ground truth JSON from the OCR fields and reviewer corrections.
:::

### Step 2: Create a Project and Definition

1. Navigate to **Benchmarking > Projects** and click **"Create Project"**. Enter a name and optional description.
2. Open the project and click **"Create Definition"**. Fill in the dialog:
    - **Name** — a descriptive name for this test specification.
    - **Dataset Version** — select from available versions (grouped by dataset, showing document count).
    - **Split** (optional) — choose a split to evaluate a subset of the dataset, or leave as "All samples".
    - **Workflow** — select the workflow to benchmark.
    - **Evaluator Type** — choose `Schema-Aware` or `Black-Box`.
    - **Evaluator Config** (optional) — JSON configuration for the evaluator (see [Evaluator Config Reference](#evaluator-config)).
    - **Max Parallel Documents** — number of samples processed concurrently (default: 10).
    - **Per Document Timeout (ms)** — timeout for each sample (default: 300,000 ms / 5 minutes).
3. Click **"Create"**.

### Step 3: Run the Benchmark

1. On the **Project Detail** page, click a definition row to open the **Definition Details** dialog.
2. Click **"Start Run"**. The system creates a new run and navigates to the **Run Detail** page.
3. Watch real-time progress as the run moves through its phases (see [Running Benchmarks](#running-benchmarks) below). You can cancel at any time using the **"Cancel"** button.

## Running Benchmarks {#running-benchmarks}

When a benchmark run is started, the system automatically progresses through six phases:

1. **Dataset Preparation** — downloads the dataset version to the worker (cached for subsequent runs).
2. **Execution** — runs the configured workflow against each sample, processing them in configurable parallel batches.
3. **Evaluation** — compares each sample's predicted output against the ground truth using the configured evaluator.
4. **Aggregation** — combines all per-sample results into run-level statistics (see [Understanding Aggregate Metrics](#aggregate-metrics)).
5. **Baseline Comparison** — if a baseline exists, checks the current run's metrics against the baseline thresholds (see [Baseline Management](#baseline-management)).
6. **Cleanup** — removes temporary output files while preserving cached datasets for reuse.

You can monitor progress in real time on the **Run Detail** page, which shows the current phase, sample counts, and percent complete. If needed, click **"Cancel"** to stop a running benchmark.

### Run Statuses

| Status | Meaning |
| --- | --- |
| `pending` | Run created, not yet started. |
| `running` | Actively processing samples. |
| `completed` | All samples processed and metrics aggregated. |
| `failed` | Encountered an unrecoverable error. |
| `cancelled` | Cancelled by the user. |

## Baseline Management & Regression Detection {#baseline-management}

### Promoting a Baseline

Any completed run can be promoted to baseline. Only one run per definition can be the baseline — promoting a new one automatically demotes the previous one.

1. Open a completed run on the **Run Detail** page.
2. Click **"Promote to Baseline"** in the top-right actions.
3. In the **Configure Baseline Thresholds** dialog, set a threshold for each metric:
    - Choose **Relative (%)** or **Absolute** from the dropdown.
    - Enter the threshold value.
4. Click **"Promote to Baseline"** to confirm.

After promotion, the run shows a **Baseline** badge and its thresholds appear in the Definition Details dialog. You can update thresholds later using the **"Edit Thresholds"** button on the baseline run.

### Threshold Types

| Type | Rule | Example |
| --- | --- | --- |
| **Absolute** | Current value must be ≥ threshold value. | `f1.mean ≥ 0.90` — F1 must be at least 0.90 regardless of baseline. |
| **Relative (%)** | Current value must be ≥ baseline value × threshold value. | `pass_rate ≥ baseline × 0.95` — pass rate can drop by at most 5% from the baseline. |

### Automatic Comparison

Every completed run is automatically compared against the baseline for its definition (if one exists). The comparison produces:

- A **per-metric delta** showing the absolute and percentage change from baseline.
- A **pass/fail** determination for each threshold.
- A list of **regressed metrics** — metrics that failed their threshold check.
- An **overallPassed** flag — `true` only if no metrics regressed.

If any metric regresses, the run is tagged with `regression: "true"` for easy filtering.

## Drill-Down & Failure Analysis {#drill-down}

After a run completes, the **Run Detail** page provides several tools for inspecting results:

### Run Detail Page

- **Baseline Comparison banner** — a green (passed) or orange (regression detected) alert at the top of the page. If no baseline is set, a blue prompt offers to promote the current run.
- **Aggregated Metrics** — an expandable accordion listing every metric name and its aggregated value.
- **Per-Field Error Breakdown** (schema-aware evaluator only) — a table showing each field's error count and error rate. Click a field row to open a drawer with the specific samples where that field had errors, including expected and predicted values.
- **Artifacts** — browse all run artifacts, filtered by type (per-document output, intermediate node output, diff report, evaluation report, error log). Click an artifact row to view its contents.

### Per-Sample Drill-Down

Click **"View All Samples"** on the Run Detail page to open the full drill-down page with paginated, filterable per-sample results:

- **Filter by metadata dimensions** — the filter panel dynamically shows dropdowns for each available metadata dimension (e.g. document type, language). Apply one or more filters to narrow results.
- **Results table** — shows each sample's ID, pass/fail status, metadata values, and key metrics.
- **Sample detail drawer** — click a sample row to open a side panel showing the full metrics, metadata, ground truth (expected) vs prediction (actual) side by side, evaluation details, and diagnostics.

## Sliced Metrics {#sliced-metrics}

Sliced metrics break down the aggregate statistics by metadata dimensions. For example, if your samples have `docType` metadata, you can see separate aggregate metrics for invoices, receipts, and contracts.

Slicing is configured via the `sliceDimensions` option in the aggregation. Each dimension produces a separate set of `AggregatedMetrics` per unique value.

This is useful for identifying if performance varies by document type, language, source, or any other metadata attribute.

## Comparing Runs {#comparing-runs}

You can compare metrics across multiple runs side by side:

1. On the **Project Detail** page, use the checkboxes in the **Recent Runs** table to select **2 to 5** completed runs.
2. Click the **"Compare"** button that appears above the table.
3. The **Run Comparison** page displays:
    - **Run Information** — status, definition, and start time for each run.
    - **Metrics Comparison** — a table with one column per run, plus delta and delta-percentage columns. Values are colour-coded: green for improvements, red for regressions.
    - **Parameters Comparison** — highlights parameters that differ across runs with a "Changed" badge.
    - **Tags Comparison** — same format as parameters.

You can export the comparison data as **CSV** or **JSON** using the buttons in the top-right corner.

## Deleting Resources {#deleting-resources}

The following resources can be deleted through the interface:

| Resource | Where | Notes |
| --- | --- | --- |
| **Project** | Project Detail page > **"Delete Project"** | Deletes all definitions and runs within the project. |
| **Definition** | Project Detail page > definition row > **"Delete"** | Deletes all associated runs. |
| **Run** | Project Detail page > run row > **"Delete"** | Only available for completed, failed, or cancelled runs. |
| **Dataset Version** | Dataset Detail page > version three-dot menu > **"Delete Version"** | Cannot delete frozen versions. |
| **Sample** | Dataset Detail page > Sample Preview tab > per-sample **"Delete"** | Only available when the version is not frozen. |

::: warning Deletions are permanent
All delete operations require confirmation and cannot be undone. Associated artifacts are also removed.
:::

## Scheduled Benchmarks {#scheduling}

Benchmark definitions support scheduled execution. You can configure a cron schedule so that benchmark runs are triggered automatically — useful for continuous quality monitoring such as nightly regression checks against a golden dataset.

1. On the **Project Detail** page, click a definition row to open the **Definition Details** dialog.
2. Scroll to the **Schedule Configuration** card.
3. Toggle **"Enable automatic scheduled runs"** on.
4. Enter a **cron expression** (e.g. `0 2 * * *` for daily at 2 AM).
5. Click **"Save Schedule"**.

Once active, the schedule status panel displays the **schedule ID**, **cron pattern**, **next run** time, and **last run** time, along with an **Active** or **Paused** badge.

Scheduled runs use the same workflow as manual runs and produce identical metrics and baseline comparisons.
