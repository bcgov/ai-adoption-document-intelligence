# OCR Confusion Matrices

## Overview

A **confusion matrix** for OCR records, per character (or token), how often the **true** character was recognized as each **recognized** character. This data supports error analysis, correction rule tuning, and benchmarking of OCR quality improvements.

## Data Format

### Character-Level Confusion Matrix

The canonical JSON structure for a character-level confusion matrix:

```json
{
  "schemaVersion": "1.0",
  "type": "character",
  "metadata": {
    "generatedAt": "2026-03-13T12:00:00.000Z",
    "sampleCount": 150,
    "fieldCount": 450,
    "filters": {
      "startDate": "2026-01-01T00:00:00.000Z",
      "endDate": "2026-03-01T00:00:00.000Z"
    }
  },
  "matrix": {
    "O": { "0": 42, "O": 3 },
    "l": { "1": 18, "l": 2 },
    "S": { "5": 7, "S": 1 }
  },
  "totals": {
    "totalConfusions": 73,
    "uniquePairs": 6,
    "topConfusions": [
      { "true": "O", "recognized": "0", "count": 42 },
      { "true": "l", "recognized": "1", "count": 18 },
      { "true": "S", "recognized": "5", "count": 7 }
    ]
  }
}
```

**Semantics:**
- `matrix[trueChar][recognizedChar]` = count of times `trueChar` (from ground truth / HITL correction) was recognized as `recognizedChar` (from OCR output).
- `totals.topConfusions` is sorted descending by count for quick identification of the most problematic pairs.

### Token-Level Confusion Matrix (Optional)

For word-level analysis, a similar structure can be used where keys are full tokens rather than individual characters. This is useful for identifying systematic word-level misrecognitions (e.g., common abbreviations).

## Data Sources

### 1. HITL FieldCorrections

The primary source is `FieldCorrection` records from the HITL review pipeline:

- **Original value**: `original_value` from the OCR output
- **Corrected value**: `corrected_value` from the human reviewer
- **Action**: Only `corrected` actions yield confusion data (confirmed/flagged/deleted do not)

Deriving a matrix from HITL pairs compares original vs corrected strings character-by-character using alignment to identify substitutions, insertions, and deletions.

### 2. Benchmark Ground Truth vs Predictions

When a benchmark dataset has both ground truth (from HITL-reviewed data via `HitlDatasetService.buildGroundTruth`) and predictions (from `buildFlatPredictionMapFromCtx` in the benchmark workflow), the per-field comparison yields similar (original, corrected) pairs suitable for confusion matrix derivation.

## Derivation Process

1. Collect `(originalValue, correctedValue)` pairs from one of the sources above
2. For each pair, align characters between original and corrected strings
3. For each position where the characters differ, increment `matrix[correctedChar][originalChar]`
4. Aggregate totals and sort by frequency

## Consumption

- **Character confusion correction tool** (`ocr.characterConfusion`): accepts either an inline `confusionMapOverride`, or a `confusionProfileId` that loads a stored [ConfusionProfile](./CONFUSION_PROFILES.md) matrix from the database at execution time (replacing the built-in rules). The default `CONFUSION_MAP` in `enrichment-rules.ts` covers common OCR confusions (O↔0, l↔1, S↔5, etc.).
- **AI recommendation pipeline**: references confusion profiles when recommending which correction tools to add and with what parameters (`apps/backend-services/src/benchmark/ai-recommendation.service.ts`, `apps/backend-services/src/hitl/tool-manifest.service.ts`).
- **Benchmarking**: Confusion matrices computed from benchmark runs provide per-iteration quality metrics to track improvement over time.

## Implementation status

Derivation is implemented by the **confusion-profile module**: `POST /api/groups/:groupId/confusion-profiles/derive` derives a matrix from HITL `FieldCorrection` rows and/or benchmark run mismatch pairs, stores it as a `ConfusionProfile` with provenance metadata, and profiles can be curated in the UI and consumed by `ocr.characterConfusion` via `confusionProfileId`. See [CONFUSION_PROFILES.md](./CONFUSION_PROFILES.md) for the API, data model, and UI.

## Related References

- Existing character confusion: `apps/temporal/src/activities/enrichment-rules.ts` (`fixCharacterConfusion`, `CONFUSION_MAP`)
- HITL data model: `ReviewSession`, `FieldCorrection` in Prisma schema
- Benchmarking guide: the benchmarking guide on the docs site (`docs/benchmarking-guide.html`)
- Ground truth from HITL: `apps/backend-services/src/benchmark/hitl-dataset.service.ts` (`buildGroundTruth`)
