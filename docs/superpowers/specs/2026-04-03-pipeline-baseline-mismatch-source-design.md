# Pipeline Correction Source: Baseline Run Mismatches

**Date:** 2026-04-03
**Status:** Draft

## Problem

The OCR improvement pipeline's step 1 ("HITL aggregation") queries the `field_corrections` table filtered by the benchmark project's `groupId`. This is fundamentally disconnected from the benchmark dataset and its runs:

1. **Wrong data source:** `field_corrections` contains corrections from manual HITL document review sessions. These are unrelated to the benchmark dataset's ground truth. The pipeline picks up incidental corrections from any document that happens to be in the same group.

2. **No connection to any run:** The pipeline doesn't reference the baseline run or any run at all. It doesn't know what the OCR actually got wrong during benchmarking.

3. **Correct data already exists:** The baseline run's `perSampleResults[].evaluationDetails` contains per-field comparisons (`{ field, expected, predicted, matched }`) computed by the schema-aware evaluator against the dataset's ground truth. This is exactly what the pipeline needs.

## Design

### Replace step 1 data source

Replace the HITL aggregation step with baseline run mismatch extraction. The rest of the pipeline (steps 2-7) is unchanged — the AI recommendation service continues to receive `{ fieldKey, originalValue, correctedValue, action }[]`.

### Data extraction

From the baseline run's `metrics.perSampleResults`, for each sample iterate `evaluationDetails` and collect entries where `matched === false`. Map each to:

```typescript
{
  fieldKey: entry.field,          // e.g. "date"
  originalValue: entry.predicted, // e.g. "16-06-2009" (what OCR produced)
  correctedValue: entry.expected, // e.g. "2009-06-16" (ground truth)
  action: "mismatch",
  sessionId: sampleId,            // use sampleId as context identifier
  documentId: sampleId,           // use sampleId as context identifier
  createdAt: baselineRun.completedAt
}
```

All mismatched fields are included — no filtering by mismatch type.

### Baseline run lookup

The pipeline already receives `definitionId`. Use the existing `BenchmarkRunDbService.findBaselineBenchmarkRun(definitionId)` to find the baseline. If no baseline run exists or the baseline run is not in `completed` status, return early with:

```typescript
{
  status: "error",
  error: "No completed baseline run found for this definition. Promote a run to baseline first."
}
```

### Files changed

**`ocr-improvement-pipeline.service.ts`**
- Replace `HitlAggregationService` dependency with `BenchmarkRunDbService`
- Replace step 1: call `findBaselineBenchmarkRun(definitionId)`, extract mismatches from `perSampleResults[].evaluationDetails`
- Remove `hitlFilters` from `GenerateInput` interface
- Make `definitionId` required in `GenerateInput` (currently optional, already always passed)
- Update debug log step name from `hitl_aggregation` to `baseline_mismatch_extraction` with data: `{ baselineRunId, totalMismatches, sampleCorrections: [...first 5] }`

**`benchmark-run.controller.ts`**
- Remove `mapHitlFilters()` function
- Remove `hitlFilters` mapping and `groupIds` defaulting logic (lines 152-155)
- Remove `hitlFilters` from pipeline input

**`dto/ocr-improvement-run.dto.ts`**
- Remove `hitlFilters` field from `OcrImprovementGenerateDto`

**`DefinitionDetailView.tsx`**
- No functional change needed. Currently sends `generateCandidate({})` which works since `hitlFilters` is being removed.

### What gets removed

- `hitlFilters` parameter from `GenerateInput` and `OcrImprovementGenerateDto`
- `mapHitlFilters()` helper in the controller
- `HitlAggregationService` import/dependency from the pipeline service (the service itself is not deleted — it may be used elsewhere)
- The `groupIds` defaulting logic in the controller

### What stays the same

- `HitlAggregationService` continues to exist for other consumers
- Pipeline steps 2-7 (tool manifest, AI recommendation, workflow load, apply recommendations, create candidate) are untouched
- `AiRecommendationService` input format is unchanged
- Frontend generate button behavior is unchanged
- `normalizeFieldsEmptyValueCoercion` parameter continues to work

### Tests

- Update existing pipeline service tests to provide baseline run data instead of HITL corrections
- Test: no baseline run returns error with clear message
- Test: baseline run with no mismatches returns `no_recommendations` status
- Test: mismatches are correctly mapped to correction format
- Test: controller no longer sends hitlFilters
