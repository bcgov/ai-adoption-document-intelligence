# Cross-Definition OCR Cache Picker

## Problem

The benchmark system persists Azure OCR responses per sample (`benchmark_ocr_cache` table) on every run by default, but there is no UI to replay cached OCR. The `ocrCacheBaselineRunId` field exists in the API/DTO/workflow but is never passed from the frontend. Additionally, the backend currently restricts cache replay to the same definition, even though definitions sharing the same `datasetVersionId` have identical samples and would benefit from cross-definition cache reuse.

## Design

### New Backend Endpoint

**`GET /benchmark/projects/:projectId/ocr-cache-sources?datasetVersionId=<uuid>`**

Returns completed runs that have at least one `BenchmarkOcrCache` row and whose definition uses the specified `datasetVersionId`. Scoped to the given project.

Response shape (array, sorted by `completedAt` desc):

```typescript
interface OcrCacheSourceDto {
  id: string;              // run ID
  definitionId: string;
  definitionName: string;
  completedAt: string;
  sampleCount: number;     // count of cache rows for this run
}
```

Query: join `BenchmarkRun` -> `BenchmarkDefinition` (on `definitionId`) filtered by `datasetVersionId`, then left-join count on `BenchmarkOcrCache` grouped by `sourceRunId`, filtering to runs with count > 0.

Full Swagger/OpenAPI documentation with dedicated DTO classes per CLAUDE.md requirements.

### Backend Validation Change

**`assertOcrCacheBaselineRun`** in `benchmark-run.service.ts`: Replace the `definitionId` match with a `datasetVersionId` match. The baseline run's definition must share the same `datasetVersionId` as the current definition. The `projectId` and `status: "completed"` checks remain.

Updated query:

```typescript
const run = await this.prisma.benchmarkRun.findFirst({
  where: {
    id: baselineRunId,
    projectId,
    status: "completed",
    definition: {
      datasetVersionId: currentDefinition.datasetVersionId,
    },
  },
});
```

### Frontend: OCR Cache Source Picker

#### New Hook: `useOcrCacheSources`

Fetches `GET /benchmark/projects/:projectId/ocr-cache-sources?datasetVersionId=<uuid>`. Returns the list of available cache source runs.

#### DefinitionDetailView (Start Run)

Add a `Select` dropdown labeled **"Use cached OCR from"** in the run controls group (near the existing "Persist OCR cache" switch). Options populated from `useOcrCacheSources` using the definition's `datasetVersionId`. Each option displays:

```
{definitionName} - {completedAt formatted} ({sampleCount} samples)
```

When a source is selected, pass `ocrCacheBaselineRunId` to `startRun()`. When cleared (no selection), omit the field (fresh OCR).

The "Persist OCR cache" toggle remains independent — the existing mutual exclusivity constraint is preserved in the backend.

#### RunDetailPage (Rerun)

Same `Select` dropdown added to the rerun controls group, next to the existing "Persist OCR cache" switch. Uses the definition's `datasetVersionId` (available via the `definition` object already fetched on this page).

#### Run Detail: Cache Source Display

When a run's `params.ocrCacheBaselineRunId` is set, display a visible label on the run detail page showing the cache source. Fetch the source run's basic info (definition name, completion date) to render:

```
OCR cache source: {definitionName} - {completedAt}
```

This ensures traceability — you can always see where a run's cached OCR came from.

### What Does NOT Change

- Cache persistence logic (`persistOcrCache` flag, default true)
- Cache keying: `(sourceRunId, sampleId)` composite unique
- Mutual exclusivity of `persistOcrCache: true` + `ocrCacheBaselineRunId`
- Temporal workflow cache load/persist activities
- Graph engine cache injection in node-executors
- Cache miss behavior (non-retryable failure)
