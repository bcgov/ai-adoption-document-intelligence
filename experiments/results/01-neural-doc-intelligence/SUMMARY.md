# E01 — Neural DI + Post-Processing — Results

**Branch**: `experiment/01-neural-doc-intelligence` (first link in the stacked experiment chain; the results in this file come from the production-neural re-run captured on the `experiment/08-vlm-ocr-hybrid-gpt-5.2` branch tip, re-evaluated against the cleaned GT with the canonical strict + one-of-array evaluator).
**Engine**: Azure Document Intelligence with a custom-trained **neural** model. The model was trained out-of-band via the `BuildMode = neural` path (PR #134); this experiment is workflow + post-processing wiring, not training.
**Trained model id**: `sdpr-monthly-prod-neural-v2` (passed in via `workflowConfigOverrides`; the workflow JSON's `ctx.modelId.defaultValue` ships as `sdpr_synth_test` for back-compat with the original brief).
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json)
**Dataset**: `seed-local-samples-mix-public-v1` — 40 samples (the export carried a 41st `manifest` pseudo-row from the local-dataset sync; the re-eval drops it). Same cleaned, format-variant-promoted, public-visibility dataset E02–E08 run against.
**Evaluator**: `schema-aware`, `defaultRule: { rule: "exact" }`, `passThreshold: 0.8` — the strict configuration used everywhere from improve/01 onward.
**Canonical run**: [`b715b129-678a-4728-aaf9-0a834d604cc8`](benchmark-run.json) (Azure DI portion started 2026-05-16T00:09:07Z, completed 00:11:45Z, ~158 s wallclock).
**Re-eval**: predictions re-scored locally on 2026-05-16 against current GT using `apps/temporal/scripts/reevaluate-against-local-gt.ts` — same pattern used to repair E00 ([76971469](https://github.com/bcgov/ai-adoption-document-intelligence/commit/76971469)). No paid API re-spend. See ["Re-evaluation against local GT"](#re-evaluation-against-local-gt) for the why.

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
| `pass_rate` | **0.925** (37/40 cleared the 0.8 strict threshold) |
| `f1.mean` | **0.924** |
| `f1.median` | 0.959 |
| `f1.max` | 1.000 |
| `f1.min` | 0.560 (`81 blank`, known-hard) |
| `precision.mean` | **0.944** |
| `recall.mean` | **0.909** |
| `matchedFields.median` | **69** of 74 |
| `matchedFields.mean` | 65.4 |
| `falsePositives.mean` | 3.70 |
| `falseNegatives.mean` | 6.45 |
| Wallclock | ~158 s for 40 samples (~4 s/sample, parallel) |

3 samples fall below the 0.8 pass threshold: `81 blank` (f1 0.560, known-hard), `HR0081 (10)` (f1 0.710), `Fake 4` (f1 0.794). The two non-known-hard fails are dense-handwriting samples where the trained model's OCR layer doesn't surface income-row digits.

## Headline — neural is mid-pack on this dataset

All six engines on the improve/03+ stack against the same cleaned-GT, strict-evaluator state:

| | **E01 (neural DI)** | E02 (Mistral / Foundry) | E03 (CU + gpt-5.2) | E04 (gpt-5.4 VLM-direct) | E05 (gpt-5.4 hybrid) | E07 (gpt-4o hybrid) | E08 (gpt-5.2 hybrid) |
|---|---|---|---|---|---|---|---|
| `pass_rate` | 0.925 | 0.875 | **1.000** | 0.800 | 0.975 | 0.900 | 0.975 |
| `f1.mean` | 0.924 | 0.918 | 0.947 | 0.870 | 0.942 | 0.923 | **0.960** |
| `f1.median` | 0.959 | 0.959 | 0.969 | 0.903 | 0.961 | 0.952 | **0.973** |
| `precision.mean` | 0.944 | 0.941 | 0.958 | 0.876 | 0.951 | 0.942 | **0.965** |
| `recall.mean` | 0.909 | 0.902 | 0.939 | 0.866 | 0.935 | 0.909 | **0.955** |
| `matchedFields.median` | 69 | 69 | 70 | 66 | 71 | 68 | **71** |
| `falsePositives.mean` | 3.70 | 4.05 | 3.00 | 8.48 | 3.38 | 4.00 | **2.50** |

E01 (the trained neural template) lands **above E02 and E07, just below E03/E05, below E08**. On `f1.median` it ties E02 at 0.959. On `pass_rate` it beats E02/E04/E07 outright; only E03 and the gpt-5.4/gpt-5.2 hybrids do better. The neural model's strong suit is **precision-per-prediction** (substitutes wrong values less often than the VLMs) and **checkbox accuracy** (handles selection marks at ≥ 0.93 accuracy on every checkbox field). Its weak suits are handwritten signatures (47.5% field accuracy) and the worst-handwriting samples in the HR0081 cluster.

This is a useful counterpoint to the rest of the stack: a relatively small custom-trained model running through the Azure DI standard post-processing pipeline is competitive with a 100B-parameter VLM (Mistral) and within 2–4 pp f1 of the larger generative-model hybrids (CU, gpt-5.x). The story isn't "neural is best" — E08 (gpt-5.2 hybrid) is clearly the strongest on this dataset — but it isn't "neural is hopelessly behind" either.

## Re-evaluation against local GT

The raw export from this benchmark, before re-eval, looked very different: `pass_rate 0.024`, `precision.mean 1.000`, `falsePositives.mean 0.00`. Those numbers were a **two-stage evaluator-version artifact** at the time of the run:

1. **The evaluator running on the worker did not have one-of-array support** (pre-improve/01 commit [`152ab378`](https://github.com/bcgov/ai-adoption-document-intelligence/commit/152ab378)). 64 of the original 456 listed mismatches had the engine's prediction literally present in the GT array — `predicted "999-999 999"` against GT `["999999999", "999 999 999", "999-999-999", "999-999 999"]` and similar. Those were spurious "mismatches" that the current evaluator handles correctly.
2. **The FP/FN bookkeeping pre-dated improve/03's [d77b6097](https://github.com/bcgov/ai-adoption-document-intelligence/commit/d77b6097)** — substitutions counted as FN-only, not FP+FN. Precision was pinned at 1.000 because there's no path for an FP outside the "extra-key out-of-schema" case, and the neural model emits exactly the 74-key SDPR schema.
3. **The `BenchmarkDefinition` row this run hit had an effective `passThreshold ≈ 1.0`** (a custom row, not the seeded one) — so the original `pass_rate` of 0.024 reflected "perfect-match only" gating, not the canonical 0.8.

Re-running the predictions through `apps/temporal/scripts/reevaluate-against-local-gt.ts 01-neural-doc-intelligence` does three things in one pass:

- Joins the stored per-sample predictions against the current local GT in `data/datasets/samples-mix/public/`.
- Runs the canonical `SchemaAwareEvaluator` with `{ defaultRule: { rule: "exact" }, passThreshold: 0.8 }` — same config E02–E08 use.
- Overwrites `experiments/results/01-neural-doc-intelligence/benchmark-run.json` with corrected metrics, `evaluationDetails`, and `perFieldResults`.

No paid API re-spend; this is pure post-processing over the stored predictions. Same approach used to repair E00 in commit [76971469](https://github.com/bcgov/ai-adoption-document-intelligence/commit/76971469).

## GT format-variant promotions applied during re-eval

Two passes of `apps/temporal/scripts/promote-gt-format-variants.ts 01-neural-doc-intelligence --write` surfaced engine-specific format variants that hadn't been seen on E02–E08:

1. **One SIN format variant on `HR0081 (9)`** — `"789-788- 425"` (extra space) added to the GT one-of array.
2. **93 currency-prefix variants across 9 samples** — the trained neural model returns income-field values **as written on the form, with the dollar sign in front or behind the number**: `"$0"` for GT `"0"`, `"$900.00"` for GT `"900.00"`, `"50$"` for GT `"50"`, etc. The numeric value is identical; only the chrome differs. Concentrated on the HR0081 series (the real handwritten samples) plus a handful of synth-full / synth-no-spouse cases. Promoted the GT scalars to one-of arrays — e.g. `"applicant_oas_gis": "0"` → `"applicant_oas_gis": ["0", "$0"]` — accepting both renderings.

The currency-prefix promotion rule is new in this branch. It generalizes `promote-gt-format-variants.ts` from `{sin, date, phone}` to also cover income-like fields (any `applicant_*`/`spouse_*` field that isn't a name/phone/sin/date/signature/email, and whose GT parses as a numeric scalar). The shape-based predicate keeps the rule open to future income fields without maintaining a name list. Verified by:

- Dry-run output reviewed manually (all 93 entries are clean digit-equivalent variants; no semantic data difference).
- Final dry-run after `--write` returns "No format-variant promotions detected" — the rule is idempotent.
- Existing `schema-aware-evaluator.test.ts` (30/30 pass) unaffected.

The downstream effect on aggregate metrics: `pass_rate` goes from 0.850 (post-reeval, pre-currency-promotion) to 0.925; `recall.mean` from 0.876 to 0.909; `matchedFields.median` from 67 to 69; `falsePositives.mean` falls from 6.05 to 3.70. Three samples that were previously failing on currency-prefix mismatches (HR0081 (4), (7), (8) etc.) now pass.

## Remaining failure-mode classification (286 mismatches across 36 samples)

Full per-sample list in [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md), worst-f1 first. The remaining mismatches after the re-eval + GT promotions fall into these buckets:

| category | count | example | what to do |
|---|---|---|---|
| **Handwritten signatures / names** | ~50 | predicted `"Real Applicant Signature"` / `"Kradel"` / null, GT `"Abe"` / `"KPatel"` | not GT-fixable — real handwriting OCR failures. The trained model occasionally returns the printed form-label text instead of the handwritten mark. Could be mitigated by adding `ocr.enrich` (LLM enrichment) to the post-processing chain — explicitly out-of-scope for E01 per brief |
| **Date format normalization** | ~30 | predicted `"2025-11-12"`, GT `"2025-Nov-12"` | the trained model normalises dates to ISO; GT preserves the form's `Mar`/`Nov` rendering. Promotion candidates — re-run `promote-gt-format-variants.ts` after any GT change |
| **Numeric-blank vs explicit zero** | ~25 | predicted null, GT `"0"` | the trained model leaves cells null where GT says explicit `"0"`. Common on HR0081 (10), Fake 4. Distinct from the currency-prefix case |
| **`81 blank` / `81 coffee` (known-hard)** | ~50 | obscured-form floor across the whole stack | excluded from iteration per convention |
| **Sentinel-label mismatches** | ~10 | predicted real value, GT `":garbled:"` / `"KEY PLAYER MISSING"` / `"Blank Declaration"` | not predictable by any engine — the sentinel is a labeller convention for fields that aren't really on the form |
| **Genuine misreads on form-as-written values** | ~50 | predicted `"M"` / `"1"`, GT `"50"` / `"0"` (a handwritten zero misread as another digit) | not GT-fixable — represents the model's OCR ceiling on dense handwriting |
| **Single-character form-fill artifacts** | ~10 | predicted `"X"` / `"$"` / `"1"`, GT `""` | the model reads stray pen marks; an `extra-key insertion` style FP. Could be filtered by minimum-length-per-field-type post-processing |
| **`Fake 1`/`Fake 2` `:present:` sentinel** | ~5 | predicted null for `signature`, GT `":present:"` | sentinel — see above |

**Worst-accuracy fields** after re-eval (from `perFieldResults`, ordered by accuracy ascending):

| field | accuracy | dominant cause |
|---|---|---|
| `signature` | 0.475 (19/40) | handwriting OCR — the trained model often returns the printed form-label or null on signatures |
| `explain_changes` | 0.700 (28/40) | substring-level transcription errors on free-form text (a "M" instead of "N/A", etc.) |
| `applicant_canada_pension_plan_cpp` / `applicant_spousal_support_alimony` | 0.700 | dense-handwriting zero misreads on HR0081 cluster |
| `applicant_employment_insurance` / `applicant_net_employment_income` | 0.725 | same |
| `applicant_oas_gis` / `applicant_child_support` | 0.750 | same |

Checkbox fields, `name`, `phone`, and `email` are above 0.85 accuracy on every sample. Checkbox extraction is the neural model's strongest surface — every selection mark across 40 samples is read correctly except on `81 blank` / `81 coffee`.

## Confidence-distribution observations

The model's per-page word-level confidences land in [0.96, 0.99] on most samples (consistent with the original 33-sample run on `sdpr_synth_test`). The `confidenceThreshold = 0` override on this run intentionally disables the HITL gate so every sample takes the no-review path. With the default `0.95` threshold, no production sample would have routed to HITL on this dataset — every sample's average confidence clears 0.95.

Per-field confidence is much more variable: signature averages 0.50; SIN/date 0.79; OAS-GIS / CPP / employment-insurance income fields 0.88–0.94. **A field-level confidence threshold (per `field_key`) would be more useful here than a page-level threshold** — the page-level number is dominated by checkbox and numeric fields, which the model handles well, and washes out the high-uncertainty signature/SIN/date signal. Not changed in E01; flagged for the report's discussion of HITL strategies.

## Notes on `cleanup` / `normalizeFields` / `characterConfusion` against neural output

- **`ocr.cleanup`** — no observed issues. Light text trimming as expected.
- **`ocr.normalizeFields`** — runs against the SDPR document type's field schema. **It is not stripping the `$` prefix on income fields** (the 93 currency-prefix variants surfaced above — concentrated on HR0081 (4/7/8) and the synth-* set). This is the highest-leverage post-processor change: extend the numeric normalizer to strip leading/trailing `$` regardless of locale rule. Not done in this branch (out of scope — would invalidate the cross-engine comparison's currency-variant GT). After the cross-engine report lands, this is a one-line normalizer fix with high payoff for production traffic — and it's the cleanest long-term resolution vs. carrying `$N` GT variants forever.
- **`ocr.characterConfusion`** — fired on the 10 income-field scope as configured. Low correction count makes sense — the trained model handles most glyph confusions internally. No errors observed; not a meaningful contributor to the failure profile here.

## Reproducing this run

```bash
# 1. Ensure the cleaned samples-mix-public dataset is on blob storage. If you've
#    reset the DB and haven't done FORCE_RESYNC_LOCAL_DATASETS=true since the GT
#    format-variant promotions on this branch landed, do that first.

# 2. Trigger with the trained model id + HITL disabled.
TEST_API_KEY=... npx tsx -r tsconfig-paths/register \
  apps/temporal/scripts/trigger-experiment-benchmark.ts 01 \
  --override 'ctx.modelId.defaultValue=sdpr-monthly-prod-neural-v2' \
  --override 'ctx.confidenceThreshold.defaultValue=0'

# 3. Poll + save the export.
TEST_API_KEY=... npx tsx -r tsconfig-paths/register \
  apps/temporal/scripts/poll-experiment-run.ts <runId> 01-neural-doc-intelligence

# 4. If the worker is on an older image without the improve/03 evaluator, re-evaluate
#    locally. (Idempotent if the worker is current.)
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  scripts/reevaluate-against-local-gt.ts 01-neural-doc-intelligence

# 5. Surface any new format variants and apply.
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  scripts/promote-gt-format-variants.ts 01-neural-doc-intelligence       # dry-run
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  scripts/promote-gt-format-variants.ts 01-neural-doc-intelligence --write
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  scripts/reevaluate-against-local-gt.ts 01-neural-doc-intelligence       # re-score after promotion

# 6. Regenerate the GT-cleanup dump.
cd apps/temporal && npx tsx -r tsconfig-paths/register \
  scripts/dump-errors-for-gt-cleanup.ts 01-neural-doc-intelligence
```
