# OCR Recover Numeric Zeros (from misread checkboxes)

Activity: `ocr.recoverNumericZerosFromCheckboxes`
Source: [apps/temporal/src/activities/ocr-recover-numeric-zeros.ts](../apps/temporal/src/activities/ocr-recover-numeric-zeros.ts)
Tests: [apps/temporal/src/activities/ocr-recover-numeric-zeros.test.ts](../apps/temporal/src/activities/ocr-recover-numeric-zeros.test.ts)

## What it solves

Azure Document Intelligence sometimes parses a handwritten or printed `0` as a selection mark — the round glyph looks like an open/unselected checkbox. For custom-model fields declared as `number`, the misread surfaces as an *empty* value:

| Custom model build | Failed field shape | Flat prediction |
|---|---|---|
| Template (e.g. `sdpr_synth_test`) | `{ type: "number", confidence: 0.3 }` | `null` |
| Neural (e.g. `neural-test`)        | `{ type: "number", confidence: 0.5, valueString: "" }` | `""` |

Both shapes lose information: the user wrote `0`, the model emits "nothing." This activity recovers the value by reading the OCR layout (tables + page-level selection marks) and writing `valueNumber`, `content`, and `valueString` on the affected fields.

## Where it sits in the workflow

Between `azureOcr.extract` and `ocr.cleanup` in [docs-md/graph-workflows/templates/standard-ocr-workflow.json](graph-workflows/templates/standard-ocr-workflow.json). The recovery mutates `ctx.ocrResult` in place so all downstream nodes (`ocr.cleanup`, `ocr.checkConfidence`, `ocr.storeResults`, benchmark prediction flattening) see real numeric values.

```
extractResults → recoverNumericZeros → postOcrCleanup → checkConfidence → reviewSwitch → …
```

A no-op when no `tables` config is supplied or no custom-model documents are returned, so it's safe to leave wired into workflows that don't need it.

## Detection rule

A field is recovered iff **all** of these hold:

1. **Currently empty in the custom model output**: no `valueNumber`/`valueInteger`, and both `valueString` and `content` are empty or absent. The activity never overwrites a real value.
2. **The mapped table cell content has no real digits or letters** after stripping the configured tokens (default: `$`, `€`, `£`, `¥`, `:selected:`, `:unselected:`). Cells like `$1500`, `$0.00`, or `Free` are not eligible.
3. **At least one page-level `selectionMark` polygon overlaps the cell's bounding region.** This rejects cells where the table parser hiccupped — empty cells stay null.

The selection-mark check accepts any state (`selected` *or* `unselected`) by default. Azure's layout occasionally re-classifies the same circular glyph between runs, so insisting on `unselected` causes misses; the cell-content + bbox-overlap pair is the strong signal.

## Mapping (cell → field key)

Per-table configuration in node `parameters`. No DB or schema changes required.

```jsonc
{
  "tables": [
    {
      "find": { "firstCellTextContains": "Declare all income" },
      "columns": [
        { "prefix": "applicant_", "headerEquals": "Applicant" },
        { "prefix": "spouse_",    "headerEquals": "Spouse"    }
      ],
      "rows": [
        { "suffix": "net_employment_income", "labelEquals": "Net Employment Income" },
        { "suffix": "rental_income",         "labelEquals": "Rental Income"          }
        // …
      ],
      // Optional:
      "recoveryValue": 0,
      "cellEligibility": {
        "stripBeforeCheck": ["$", "€", "£", "¥", ":selected:", ":unselected:"],
        "requireSelectionMarkInCell": true,
        "acceptedMarkStates": []
      }
    }
  ]
}
```

`fieldKey = column.prefix + row.suffix` (e.g. `applicant_` + `net_employment_income` → `applicant_net_employment_income`).

Match modes per row/column:
- `*Equals` (case-insensitive, whitespace-collapsed exact match) — preferred for reliability.
- `*Contains` (case-insensitive substring) — for noisy header cells.

If a row label or column header doesn't resolve in a given run, the activity skips just that selector and records it under `metadata.unresolvedSelectors`. The recovery still fires for everything that does resolve.

## Reliability properties

- **Never overwrites real numbers.** A `$1500` cell stays `1500`. A field with a populated `valueNumber` is skipped.
- **Empty cells stay null.** Without an overlapping selection mark the activity does not write `0`. This preserves the distinction between "user wrote 0" and "field was blank."
- **No coordinate-system math required.** Mapping is by label/header text, so cross-document coordinate units don't matter.
- **Model-agnostic.** Identical behavior for template/neural/(future) custom models — the recovery uses `tables[]` and `pages[].selectionMarks[]` from prebuilt-layout, which sits beneath every custom model.

## Diagnostics

Each recovery emits one `EnrichmentChange`:

```json
{
  "fieldKey": "applicant_net_employment_income",
  "originalValue": "",
  "correctedValue": "0",
  "reason": "Recovered 0 from misread checkbox in table (row=\"Net Employment Income\" column=\"Applicant\")",
  "source": "rule"
}
```

The activity returns metadata with:
- `applied` — count of fields recovered
- `appliedFieldKeys` — exact keys that fired
- `skipped` and `skippedByReason` — counts by reason (`field_already_populated`, `field_not_in_documents`, `cell_not_found`, `cell_has_digits_or_letters`, `no_selection_mark_in_cell`)
- `unresolved` and `unresolvedSelectors` — config selectors that didn't match anything in the OCR layout

These flow through `enrichment_summary` on the stored OcrResult and through the benchmark evaluation diagnostics.

## Verified results

On the SDPR Monthly Report sample `0-center (1).jpg` (35 income fields, all expected = `0`):

| Run | Recall | F1 | Missing fields |
|---|---|---|---|
| Before recovery (template `sdpr_synth_test`) | 0.473 | 0.642 | 35 income |
| After recovery (neural `neural-test`, same workflow) | **0.946** | **0.972** | 1 (`explain_changes`, unrelated transcription drift) |

The remaining 3 mismatches are number-formatting on `phone`/`sin`/`spouse_sin` (handled by `ocr.normalizeFields`, not this activity).

## How to configure for a new form

1. Locate the target table in Azure DI's parse by inspecting the cached `analyzeResult.tables[]` (e.g. via `benchmark_ocr_cache.ocrResponse` or by uploading once through the workflow).
2. Identify the table by `firstCellTextContains` (the text in cell r0c0 — usually the section heading).
3. List every value column with its `prefix` (matching your schema's field-key naming) and the column-header text.
4. List every row with its `suffix` (the rest of the schema field-key) and the row-label text exactly as it appears in cell r*c0 (no fuzzy matching — keep it exact).
5. Drop the JSON into `parameters.tables` on the `recoverNumericZeros` workflow node.
6. Run one sample through, check `metadata.applied` and `unresolvedSelectors` to validate.

## Not AI-recommendable

The activity is intentionally excluded from `ToolManifestService.getAiRecommendableTools()`. Its per-form structural config can't be authored reliably by the AI recommender. Wire it into workflows as a deterministic, fixed node — same model as `ocr.normalizeFields`.

## Registries to update when changing the activity type id

If renaming or removing the activity, update all of these:

- [apps/temporal/src/activities.ts](../apps/temporal/src/activities.ts) — barrel export
- [apps/temporal/src/activity-types.ts](../apps/temporal/src/activity-types.ts) — `REGISTERED_ACTIVITY_TYPES`
- [apps/temporal/src/activity-registry.ts](../apps/temporal/src/activity-registry.ts) — temporal-side `register({...})`
- [apps/temporal/src/activity-registry.test.ts](../apps/temporal/src/activity-registry.test.ts) — `EXPECTED_ACTIVITY_TYPES`
- [apps/temporal/src/correction-tool-registry.ts](../apps/temporal/src/correction-tool-registry.ts) — temporal-side manifest
- [apps/backend-services/src/workflow/activity-registry.ts](../apps/backend-services/src/workflow/activity-registry.ts) — backend-side type list
- [apps/backend-services/src/workflow/activity-registry.spec.ts](../apps/backend-services/src/workflow/activity-registry.spec.ts) — `EXPECTED_ACTIVITY_TYPES`
- [apps/backend-services/src/hitl/tool-manifest.service.ts](../apps/backend-services/src/hitl/tool-manifest.service.ts) — backend-side tool manifest and `getAiRecommendableTools()` exclusion
- [docs-md/graph-workflows/templates/standard-ocr-workflow.json](graph-workflows/templates/standard-ocr-workflow.json) — workflow JSON (node + edges + nodeGroups)
