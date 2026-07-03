# Benchmark Run Error Detection Analysis

## Overview

Error Detection Analysis is an interactive per-field tool on the benchmark run detail page. It lets you explore how different confidence thresholds would perform as a human-review gate: flagging low-confidence predictions for human review while letting high-confidence predictions pass through automatically.

The panel is shown on completed benchmark runs only and is an exploration tool — thresholds are not saved or applied to production workflows.

---

## What it does

For each field in the schema, the tool shows a slider from 0.00 to 1.00. Predictions with confidence below the threshold are routed to human review; predictions at or above the threshold pass through. As you move the slider, three metrics update in real time:

- **Errors caught** (recall) — of the actual errors in this field, what fraction your threshold would flag for review.
- **False alarms** (false positives) — correct predictions that would be unnecessarily sent for human review.
- **Missed** (false negatives) — actual errors that would pass through the gate undetected.

A roll-up summary above the table aggregates all fields at their current thresholds ("Catching X of Y errors (N%) — R of M samples flagged for review"). Rows are sorted by field error rate, highest first.

Sliders reset to the "Best balance" threshold on each page load. There is no persistence.

---

## Evaluable fields

A field instance is included in the analysis only when it has **both** a confidence score from Azure Document Intelligence and a ground-truth value. Fields with zero evaluable instances are excluded from the table; a footnote below it shows how many fields were excluded.

---

## Suggested thresholds

Three suggested thresholds are precomputed per field and displayed as quick-select buttons:

| Label | Definition |
|---|---|
| **Catch 90%** | The smallest threshold whose recall is ≥ 0.90. Disabled when no threshold achieves this recall for the field. |
| **Best balance** | The threshold that maximises F1 score. Ties are broken by choosing the smaller threshold. This is the default on page load. |
| **Minimize review** | The largest threshold whose false-positive rate is ≤ 0.10. Disabled when no threshold satisfies this constraint for the field. |

---

## Data flow

### 1. Confidence scores from the OCR workflow

Azure Document Intelligence returns per-field confidence scores alongside extracted values in the OCR result. The per-sample child workflow calls the `benchmark.flattenPredictionFromRefs` activity, which reads the OCR result from its blob ref and builds a flat per-field confidence map via `buildFlatConfidenceMapFromCtx` (`null` for fields where Azure DI provided no score). The map is returned to the parent benchmark workflow as `confidenceData` and passed on `EvaluationInput.predictionConfidences` when invoking `benchmark.evaluate`. The flat confidence map itself is never stored in a database table — it only persists as part of the per-field evaluation details written in step 2.

### 2. Evaluation and storage

`SchemaAwareEvaluator` attaches each field's confidence score to its `FieldComparisonResult`. The full set of comparison results becomes the sample's `evaluationDetails`. The benchmark workflow persists these heavy per-sample fields to blob storage via the `benchmark.persistEvaluationDetails` activity and records only the returned `evaluationBlobPath` on `perSampleResults` in the run's metrics; older runs (pre blob-storage) inlined `evaluationDetails` directly in the metrics JSON.

### 3. Precomputed analysis on request

When the frontend requests the analysis, `BenchmarkErrorDetectionService` reads `perSampleResults` from the run's metrics. For each sample, it resolves the `evaluationDetails` array from one of two locations:

- **Inline** on the sample (older runs created before per-sample heavy fields were moved to blob storage), or
- **From blob storage** at `{groupId}/benchmark/runs/{runId}/{sampleId}.json`, when only `evaluationBlobPath` is present (current scheme — see [benchmarking-temporal-history-bloat-fix.md](../archive/benchmarking-temporal-history-bloat-fix.md) for why heavy fields were moved out of the metrics JSON).

It then groups the resolved evaluation details by field, precomputes a confusion-matrix curve at 101 threshold steps (0.00 to 1.00, step 0.01), and derives the three suggested thresholds per field from that curve. The result is cached in memory by run ID. Subsequent requests for the same run are served from the cache.

**Data-loss window**: benchmark runs created between the "strip heavy fields" change and the "persist to blob storage" change have neither inline nor blob copies of `evaluationDetails`. For those runs the analysis returns `fields: []` because the underlying field-level data does not exist anywhere — re-running the benchmark is the only way to regenerate it.

### 4. Frontend rendering

The `ErrorDetectionAnalysis` component fetches the precomputed structure and renders an inline-slider table. Each row shows one field; the slider drives live recalculation of the displayed metrics from the precomputed curve data already in the browser.

---

## API

```
GET /api/benchmark/projects/:projectId/runs/:runId/error-detection-analysis
```

Returns `ErrorDetectionAnalysisResponseDto`:

```
{
  runId:          string
  notReady:       boolean          // true when the run has no per-sample results yet (not completed)
  fields:         ErrorDetectionFieldDto[]
  excludedFields: string[]         // fields with zero evaluable instances
}
```

Each `ErrorDetectionFieldDto` contains the field name, per-field counts (`evaluatedCount`, `errorCount`, `errorRate`), the precomputed curve, and the three suggested thresholds.

---

## Key files

### Backend

| File | Purpose |
|---|---|
| `apps/backend-services/src/benchmark/benchmark-error-detection.service.ts` | Curve computation, blob-storage resolution of evaluation details, threshold selection, in-memory cache |
| `apps/backend-services/src/benchmark/benchmark-run.controller.ts` | `GET …/error-detection-analysis` endpoint |
| `apps/backend-services/src/benchmark/dto/error-detection-analysis.dto.ts` | `ErrorDetectionAnalysisResponseDto`, `ErrorDetectionFieldDto` |
| `apps/temporal/src/azure-ocr-field-display-value.ts` | `buildFlatConfidenceMapFromCtx` — builds the flat confidence map from the OCR result |
| `apps/temporal/src/activities/benchmark-flatten-prediction.ts` | `benchmark.flattenPredictionFromRefs` activity — reads the OCR blob ref, builds prediction + confidence maps |
| `apps/temporal/src/activities/benchmark-persist-evaluation-details.ts` | `benchmark.persistEvaluationDetails` activity — writes per-sample evaluation details to blob storage |
| `apps/temporal/src/evaluators/schema-aware-evaluator.ts` | `SchemaAwareEvaluator` — attaches confidence to `FieldComparisonResult` |

### Frontend

| File | Purpose |
|---|---|
| `apps/frontend/src/features/benchmarking/components/ErrorDetectionAnalysis.tsx` | Interactive slider table with roll-up summary |
| `apps/frontend/src/features/benchmarking/api/errorDetectionAnalysis.ts` | `useErrorDetectionAnalysis` data-fetching hook and response types |
