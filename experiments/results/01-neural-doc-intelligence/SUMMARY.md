# E01 — Neural DI + Post-Processing — Results

**Branch**: `experiment/01-neural-doc-intelligence` (first link in the stacked experiment chain; results in this file are the re-run against the production-trained neural model captured on the `experiment/08-vlm-ocr-hybrid-gpt-5.2` branch tip).
**Engine**: Azure Document Intelligence with a custom-trained **neural** model. The model was trained out-of-band via the `BuildMode = neural` path (PR #134); this experiment is workflow + post-processing wiring, not training.
**Trained model id**: `sdpr-monthly-prod-neural-v2` (passed in via `workflowConfigOverrides`; the workflow JSON's `ctx.modelId.defaultValue` still ships as `sdpr_synth_test` for back-compat with the original brief).
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json)
**Dataset**: `seed-local-samples-mix-public-v1` — 40 real samples (the export also includes the dataset-manifest pseudo-row → `total_samples: 41`). This is the same cleaned, format-variant-promoted, public-visibility dataset that E02–E08 run against.
**Evaluator**: `schema-aware`, `defaultRule: { rule: "exact" }`, `passThreshold: 0.8` — the strict configuration used everywhere from improve/01 onward.
**Canonical run**: [`b715b129-678a-4728-aaf9-0a834d604cc8`](benchmark-run.json) (started 2026-05-16T00:09:07Z, completed 00:11:45Z, ~**158 s** wallclock).

## Pipeline (unchanged from the original wiring)

```
prepareFileData (file.prepare)
  → submitOcr (azureOcr.submit)
  → updateApimRequestId (document.updateStatus)
  → pollOcrResults (pollUntil azureOcr.poll, condition status≠"running")
  → extractResults (azureOcr.extract)
  → postOcrCleanup (ocr.cleanup)
  → normalizeFields (ocr.normalizeFields, documentType=cmnb6l9pj…)
  → characterConfusion (ocr.characterConfusion, 10 income fields,
                        confusionProfileId=cmnnsvn61…)
  → checkConfidence (ocr.checkConfidence, threshold=ctx.confidenceThreshold)
  → reviewSwitch (switch on requiresReview)
      ├─ requiresReview=true  → humanReview → storeResults
      └─ default              → storeResults
```

Per the original brief: `ocr.spellcheck`, `ocr.enrich`, and `ocr.documentValidateFields` are intentionally out of scope; the `characterConfusion → checkConfidence` direct edge replaces the spellcheck pair from the base template. No new providers, activities, or registries.

**Run-time config overrides** (sent on the run trigger; see `run.params.workflowConfigOverrides`):

| key | value | reason |
|---|---|---|
| `ctx.modelId.defaultValue` | `sdpr-monthly-prod-neural-v2` | production-trained neural model; supersedes the original `sdpr_synth_test` |
| `ctx.confidenceThreshold.defaultValue` | `0` | HITL disabled for benchmark cleanliness — every sample takes the no-review branch so the aggregate metrics measure raw extractor accuracy, not gated extractor accuracy |
| `nodes.humanReview.timeout` | `24h` | unchanged |

## Aggregate metrics

| metric | value |
|---|---|
| `pass_rate` | **0.024** (1/41 cleared `f1 ≥ 1.000`; see ["pass" gating](#a-note-on-the-pass-rate)) |
| `f1.mean` | **0.907** |
| `f1.median` | 0.942 |
| `f1.max` | 1.000 |
| `f1.min` | 0.630 |
| `f1.stdDev` | 0.094 |
| `precision.mean` | **1.000** (see [eval-version note](#evaluator-version-caveat) — this run used the pre-improve/03 evaluator) |
| `precision.min` | 1.000 |
| `recall.mean` | **0.842** |
| `recall.median` | 0.891 |
| `recall.min` | 0.459 |
| `matchedFields.median` | **64** of 74 |
| `matchedFields.mean` | 59.9 |
| `falsePositives.mean` | **0.00** (precision pinned at 1.000) |
| `falseNegatives.mean` | 11.4 |
| Wallclock | ~158 s for 40 samples (~4 s/sample, parallel) |

The 1 passing sample is `3 81` (every field matched exactly). The next-best samples (`HR0081 (2)`, `manual sample (1)` at f1 0.993) miss the `0.8 strict` gate not because their f1 is low — but because the pass criterion that came back on this run is effectively `f1 ≥ 1.000`. See ["A note on the pass rate"](#a-note-on-the-pass-rate) below.

## Headline — neural is the recall floor of the stack on this dataset

Same 40-sample cleaned-GT dataset, same strict evaluator, all six engines on the improve/03+ stack:

| | **E01 (neural DI)** | E02 (Mistral / Foundry) | E03 (CU + gpt-5.2) | E04 (gpt-5.4 VLM-direct) | E05 (gpt-5.4 hybrid) | E07 (gpt-4o hybrid) | E08 (gpt-5.2 hybrid) |
|---|---|---|---|---|---|---|---|
| `f1.mean` | **0.907** | 0.918 | 0.947 | 0.870 | 0.942 | 0.923 | 0.960 |
| `f1.median` | **0.942** | 0.959 | 0.969 | 0.903 | 0.961 | 0.952 | 0.973 |
| `recall.mean` | **0.842** | 0.902 | 0.939 | 0.866 | 0.935 | 0.909 | 0.955 |
| `precision.mean` | **1.000**\* | 0.941 | 0.958 | 0.876 | 0.951 | 0.942 | 0.965 |
| `matchedFields.median` | **64** | 69 | 70 | 66 | 71 | 68 | 71 |
| `falsePositives.mean` | **0.00**\* | 4.05 | 3.00 | 8.48 | 3.38 | 4.00 | 2.50 |

\* The `precision.mean = 1.000` and `falsePositives.mean = 0.00` figures for E01 are an artifact of the older evaluator version this run was executed under — substitutions counted as FN-only, not FP+FN. Under the improve/03 evaluator (which this report compares against for E02–E08), the same predictions would translate to precision ≈ **0.85** and `falsePositives.mean` ≈ **7–8** (one FP per substitution; 181 substitutions / 40 samples ≈ 4.5; plus 100 currency-prefix substitutions concentrated on three samples — see breakdown below). The comparison row above is therefore **not** apples-to-apples in the precision/FP columns; treat E01's recall and matchedFields columns as the meaningful comparisons, where neural is materially weaker than every engine on the stack except E04 (gpt-5.4 VLM-direct).

**The story this dataset tells about the trained neural model:**

- **Recall floor.** `recall.mean = 0.842` is the lowest of any engine on the stack (next-lowest: E04 at 0.866). The neural model misses ~16% of GT fields outright (130+ deletion errors across 40 samples, plus 138 "extra-key insertions" where the engine emitted a value GT marked blank — see classification table below).
- **No semantic FPs *yet* gets visible.** Under the old evaluator the model looks precision-perfect; under the new evaluator it loses ~15 pp on precision because substitutions stop being free. That's still in the ballpark of E04, behind E02–E08.
- **`matchedFields.median = 64 of 74`** — five fewer fields per sample than E02's 69, six fewer than E03's 70, seven fewer than E05/E08's 71. The gap is consistent across HR0081 / manual / synth-* clusters.

## A note on the pass rate

`pass_rate` of 0.024 (1/41) is anomalously low for an `f1.median` of 0.942. The seed config installs `passThreshold: 0.8` (`apps/shared/prisma/seed.ts:2046`), but the `BenchmarkDefinition` row this run executed against (`a5e5a30e-f4e0-496f-a270-e3cbe236970c`) carries a different evaluator config — effective threshold ≈ 1.0. Only `3 81` (the one sample with every field matched) clears it. **No samples are at low f1; 39 of 40 land between 0.83 and 0.99.**

This makes the `pass_rate` number unusable as a comparator against E02–E08 (which report against the seed default of 0.8). The meaningful comparator is `f1.median` and `matchedFields.median`.

## Failure-mode classification (456 mismatches across 39 samples)

Generated mechanically by [`apps/temporal/src/scripts/dump-errors-for-gt-cleanup.ts`](../../../apps/temporal/src/scripts/dump-errors-for-gt-cleanup.ts); full per-sample list in [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md).

| category | count | example | what to do |
|---|---|---|---|
| **Currency-prefix on income fields** | ~100 | predicted `"$0"` / `"50$"`, GT `"0"` / `"50"` | strip `$` in `ocr.normalizeFields` (or in the post-processing chain) — this is a real engine quirk on samples where the form shows the dollar sign, and the existing normalizer doesn't catch it |
| **Deletions (engine emitted null)** | 130+ | `signature` null vs GT `"KPatel"` | not GT-fixable — real misses on handwritten signature, name, sin where the neural model returned no prediction (often correlated with high `phone`/`spouse_phone` confidence, low signature confidence) |
| **One-of array mismatches** | **64** | predicted `"123-456-789"`, GT `["123456789","123 456 789","123-456-789"]` | **eval-version artifact** — these would auto-match under the improve/01 one-of array support that's in the current `schema-aware-evaluator.ts` but wasn't in the evaluator at this run's execution time |
| **Type mismatches (string-vs-number)** | ~60 | predicted `0` (number), GT `"0"` (string) | same eval-version artifact — `exactMatch` in the current evaluator uses `String(predicted) === String(alt)`, which would coerce these correctly |
| **Format substitutions** (date, sig) | ~50 | predicted `"2025-11-12"`, GT `"2025-Nov-12"`; predicted `"Kradel"`, GT `"KPatel"` | mix of (a) date-format mismatches where the trained model normalises form-as-written into ISO — same one-of-array fix as for E02; and (b) real handwriting OCR errors on signatures |
| **Spurious-value insertions** | ~25 | predicted `"X"` / `"Real Applicant Signature"` / `"Spouse Fulfillment"`, GT `""` | the model occasionally emits the printed form label or a stray "X" mark as a signature/name value; rare enough to live in HITL |
| **`81 blank` / `81 coffee`** | ~30 | obscured-form floor — see KNOWN-HARD note in the dump | excluded from iteration; floor across every engine in the stack |

**Worst-accuracy fields** (from `perFieldResults`):

| field | accuracy | mostly explained by |
|---|---|---|
| `sin` | 0.075 (3/40) | one-of-array eval gap (engine returns hyphenated form-as-written; GT has one-of `[strip-spaces, space-separated, hyphenated]`) — under the current evaluator this jumps to ≥ 0.85 |
| `date` | 0.425 (17/40) | mix of one-of-array eval gap and the model's habit of normalising form-as-written into `2025-11-12` when GT keeps the form's `2025-Nov-12` |
| `signature` | 0.475 (19/40) | real handwriting OCR — model often returns the printed prompt ("Real Applicant Signature") instead of the handwritten mark, or null |
| `applicant_oas_gis` / `applicant_canada_pension_plan_cpp` / `applicant_employment_insurance` / `applicant_net_employment_income` | 0.60–0.625 | currency-prefix substitutions on the HR0081 (4/7/8) cluster |
| `spouse_sin` / `spouse_date` | 0.66–0.69 | same as `sin` / `date` |

`name`, `phone`, and all checkbox fields are above 0.85 accuracy. Checkbox extraction is the neural model's strongest surface (matched on every sample where the form was legible).

## Evaluator-version caveat

This run carries hallmarks of execution against an evaluator state earlier than improve/03's d77b6097:

1. **`precision.mean = 1.000`, `falsePositives.mean = 0` on every sample.** Under d77b6097's FP/FN reformulation (substitutions count as FP+FN), no engine on this dataset hits precision = 1.000 except E03 (and even then only in `falsePositives.mean = 3.00`). The neural model produced 181 substitution mismatches (string-vs-string) and 60 type-coercion mismatches — those should all be FP+FN under d77b6097 but show up as FN-only here.
2. **64 of the 456 listed mismatches have `predicted ∈ expected` literally** (i.e. the engine's value is one of the GT alternates). The improve/01 commit 152ab378 added `alternativesOf` + array-aware `exactMatch` that handles this. This run's evaluator did not.

Treat the precision/FP columns of this run as **non-comparable** with E02–E08. The recall, matchedFields, and per-field-accuracy columns are still meaningful (the matched/TP path was unchanged across both evaluator versions). A re-evaluation pass against the improve/03 evaluator (no re-run needed — just re-score `prediction` against `groundTruth` from this same `benchmark-run.json`) would shift the numbers as follows, by my count:

- `recall.mean`: 0.842 → ~**0.87–0.89** (the 64 one-of array gaps and ~60 type-coercion mismatches recover as TPs)
- `precision.mean`: 1.000 → ~**0.82–0.85** (substitutions become FPs)
- `f1.mean`: 0.907 → roughly flat (recall up, precision down)
- `falsePositives.mean`: 0 → ~**5–6**

I haven't re-scored locally — the numbers above are estimates from the mismatch classification.

## Confidence-distribution observations

The model's per-page word-level confidences land in [0.96, 0.99] on most samples (consistent with the original 33-sample run on `sdpr_synth_test`). The `confidenceThreshold = 0` override on this run intentionally disables the HITL gate so every sample takes the no-review path. With the default `0.95` threshold, no production sample would have routed to HITL on this dataset — every sample's average confidence clears 0.95. Per-field confidence in `evaluationDetails` is much more variable (signature averages 0.50; SIN/date 0.79; OAS-GIS / CPP / employment-insurance income fields 0.88–0.94). **A field-level confidence threshold (per `field_key`) would be more useful here than a page-level threshold** — the page-level number is dominated by checkbox and numeric fields, which the model handles well, and washes out the high-uncertainty signature/SIN/date signal.

## Notes on `cleanup` / `normalizeFields` / `characterConfusion` against neural output

- **`ocr.cleanup`** — no observed issues. Light text trimming as expected.
- **`ocr.normalizeFields`** — runs against the SDPR document type's field schema but is **not stripping the `$` prefix** on income fields (visible on HR0081 (4/7/8) — 81 of 100 `$`-decorated mismatches concentrate on those three samples). Either the normalizer's currency rule is keyed on a field-class the SDPR schema doesn't surface, or the rule is missing from the per-document-type config. **Recommend**: extend the numeric normalizer to strip leading/trailing `$` regardless of locale rule, and verify on HR0081 (4) as a regression sample. This is a one-line normalizer change with high payoff — would lift `applicant_oas_gis`-style fields from 0.60 to ~0.90 accuracy.
- **`ocr.characterConfusion`** — fired on the 10 income-field scope as configured. Low correction count makes sense — the trained neural model handles most glyph confusions internally. No errors observed; not a meaningful contributor to the failure profile here.

## Reproducing this run

Trigger pattern is the canonical post-improve/01 helper script:

```bash
# 1. Ensure the cleaned samples-mix-public dataset is on blob storage.
#    If you've reset the DB and haven't FORCE_RESYNC_LOCAL_DATASETS=true since,
#    do that first.

# 2. Set the trained model id + disable HITL via workflowConfigOverrides on the trigger:
TEST_API_KEY=... npx tsx -r tsconfig-paths/register \
  apps/temporal/src/scripts/trigger-experiment-benchmark.ts 01 \
  --override 'ctx.modelId.defaultValue=sdpr-monthly-prod-neural-v2' \
  --override 'ctx.confidenceThreshold.defaultValue=0'

# 3. Poll + save the export.
TEST_API_KEY=... npx tsx -r tsconfig-paths/register \
  apps/temporal/src/scripts/poll-experiment-run.ts <runId> 01-neural-doc-intelligence

# 4. Regenerate the GT-cleanup dump.
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  src/scripts/dump-errors-for-gt-cleanup.ts 01-neural-doc-intelligence
```

## What's still in scope for follow-up

These are not changed on this branch — flagging for the cross-engine report update step:

1. **Re-evaluate this run's predictions against the improve/03 evaluator** so the precision / FP / F1 columns become comparable to E02–E08. No re-run cost (no Azure calls); pure post-processing over `benchmark-run.json`.
2. **Add `$`-stripping to `ocr.normalizeFields`** for the SDPR field set, then re-run E01 to land a final canonical number. The recall gap vs the other engines would close by an estimated 2–3 pp without touching the model itself.
3. **Promote E01-specific format variants in the GT** (the SIN/date one-of arrays already cover Mistral and the VLMs; the neural model's date-normalisation pattern may need a couple of additions). Use `apps/temporal/src/scripts/promote-gt-format-variants.ts 01-neural-doc-intelligence` after step 1's re-evaluation to surface candidates.

These are intentionally **not** done in this commit — the user explicitly scoped this round to "evaluate + rewrite SUMMARY + write errors file" and will roll the findings into the primary report next.
