# Benchmark Run Download

## Overview

The benchmark run detail page exposes a **Download Results** button that serves a single self-contained JSON file with the entire run: metadata, raw metrics, every per-sample result with full evaluation details (resolved from blob storage), and the precomputed error-detection analysis.

Use it to:

- Save a snapshot of a run for offline analysis or sharing.
- Pull error information out of failed runs (the endpoint works regardless of run status).
- Audit per-field confidence scores and matched flags for any sample that the UI surfaces in drill-down.

---

## API

```
GET /api/benchmark/projects/:projectId/runs/:runId/download
```

Returns `application/json` as a file attachment named `benchmark-run-{runId}.json`.

### Response shape (`BenchmarkRunExportDto`)

```
{
  exportedAt:           string   // ISO timestamp generated server-side
  exportFormatVersion:  number   // currently 1
  run:                  RunDetailsDto         // full run metadata, including `error` for failed runs
  metrics:              object                // raw metrics including `_aggregate` and the per-sample snapshots
  perSampleResults: [
    {
      sampleId:           string
      metadata:           object
      metrics:            { [name: string]: number }
      pass:               boolean
      diagnostics?:       object
      groundTruth?:       unknown               // resolved from blob if needed
      prediction?:        unknown               // resolved from blob if needed
      evaluationDetails?: Array<{               // resolved from blob if needed
        field: string
        matched: boolean
        confidence?: number | null
        // evaluator-specific fields are passed through verbatim
      }>
      evaluationBlobPath?: string               // included for traceability
      blobReadError?:      string               // set when this sample's blob could not be loaded
    }
  ]
  errorDetectionAnalysis?: ErrorDetectionAnalysisResponseDto
}
```

### Behaviour

- **Available for any run status.** Failed runs return whatever metadata exists plus `run.error`.
- **Heavy fields are inlined.** When a sample uses the blob-storage scheme (post-fix), `groundTruth`, `prediction`, and `evaluationDetails` are pulled from `{groupId}/benchmark/runs/{runId}/{sampleId}.json` and merged into the response. Older runs that still have inline values are returned as-is.
- **Per-sample blob failures are isolated.** If a single sample's blob can't be read, the export still returns; `blobReadError` is populated on that sample so the consumer can tell what's missing.
- **Confidence + error info per field.** Each entry in `evaluationDetails` carries the field name, the matched flag, and the confidence score that the schema-aware evaluator attached. Anything else the evaluator emitted (mismatch reasons, similarity, parsed value) is passed through unchanged.
- **Audit logged** as a `document_list_accessed` event on `benchmark_run`, with `payload.action = "download"` and the sample count.

---

## Frontend

The button lives on `RunDetailPage` and is always shown (regardless of status) so users can pull error data from failed runs. It calls the `useDownloadRun` mutation, which fetches the JSON via `apiService.getBlob` and triggers a browser download via a `Blob` URL.

| File | Purpose |
|---|---|
| `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` | `useDownloadRun` mutation hook |
| `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx` | "Download Results" button (`data-testid="download-run-btn"`) |

---

## Backend

| File | Purpose |
|---|---|
| `apps/backend-services/src/benchmark/benchmark-run.controller.ts` | `downloadRun` handler — sets `Content-Disposition: attachment`, audit-logs the export |
| `apps/backend-services/src/benchmark/benchmark-run.service.ts` | `exportFullRun` — assembles run details, raw metrics, and per-sample results with blob resolution |
| `apps/backend-services/src/benchmark/dto/export-run.dto.ts` | `BenchmarkRunExportDto`, `BenchmarkRunExportSampleDto` |

---

## Notes on data recoverability

Per-field evaluation data is **not** stored on every benchmark run. There were three eras:

1. **Pre-strip** — `evaluationDetails` was stored inline on `BenchmarkRun.metrics.perSampleResults`. Downloads include it.
2. **Stripped, no persistence** — a transitional change stripped the heavy fields before saving the run to fit under Temporal's 2 MB activity payload limit, but did not persist them anywhere. Downloads of these runs return `evaluationDetails: undefined` for every sample. The data cannot be recovered without re-running the benchmark.
3. **Blob storage (current)** — heavy fields are written to Azure blob storage by the `benchmark.persistEvaluationDetails` activity and the path is stored on the row. Downloads resolve the blob and inline the contents.

See [benchmarking-temporal-history-bloat-fix.md](benchmarking-temporal-history-bloat-fix.md) and [benchmarking-error-detection-analysis.md](benchmarking-error-detection-analysis.md) for context on the migration.
