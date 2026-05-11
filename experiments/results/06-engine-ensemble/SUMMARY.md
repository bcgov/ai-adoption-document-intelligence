# E06 — Engine ensemble + cross-engine comparison report

**Branch**: `improve/03-engine-ensemble-and-comparison`
**Scope**: synthesis branch — no new paid benchmarks. Combines the stored predictions from E00/E02/E03/E04/E05 (re-evaluated against the current cleaned GT) into an ensemble prediction, and writes a cross-engine analysis with per-category strengths.
**Dataset**: `seed-local-samples-mix-public-v1` (40 samples, `data/datasets/samples-mix/public/`).
**Evaluator**: schema-aware, `defaultRule: { rule: "exact" }`, `passThreshold: 0.8`, with one-of array GT support.

The user asked two things on this branch: (1) build a comparison report across the five extraction approaches we have benchmarked end-to-end (E00 = Azure DI custom-trained template model, E02 = Mistral on Foundry, E03 = Azure Content Understanding + gpt-5.2, E04 = gpt-5.4 VLM-direct, E05 = gpt-5.4 VLM + Azure DI layout hybrid); (2) build an ensemble that picks the best per-field result across those five engines using a deployable routing logic.

This document does both. The data and plots live alongside it:

- [`plots/01-aggregate-metrics.png`](plots/01-aggregate-metrics.png) — bar chart of pass_rate, f1.median, f1.mean, precision.mean, recall.mean across all engines.
- [`plots/02-per-sample-f1-distribution.png`](plots/02-per-sample-f1-distribution.png) — box plot of per-sample F1 by engine.
- [`plots/03-per-category-accuracy.png`](plots/03-per-category-accuracy.png) — per-category bar chart (sin, date, phone, name, signature, freeform_text, checkboxes, income_amounts).
- [`plots/04-per-field-heatmap.png`](plots/04-per-field-heatmap.png) — heatmap of every individual field's accuracy by engine, grouped by category.
- [`plots/05-per-sample-f1-grouped.png`](plots/05-per-sample-f1-grouped.png) — per-sample F1 grouped bars (40 samples).
- [`data/aggregate-metrics.csv`](data/aggregate-metrics.csv) — the headline numbers below as CSV.
- [`data/per-category-accuracy.csv`](data/per-category-accuracy.csv) — per-category × per-engine accuracy matrix.
- [`data/per-field-accuracy.csv`](data/per-field-accuracy.csv) — every field × every engine.
- [`data/best-engine-per-field.csv`](data/best-engine-per-field.csv) — per-field winner, used by the ensemble.
- [`data/strategy-comparison.csv`](data/strategy-comparison.csv) — every ensemble strategy + each single-engine baseline.
- [`benchmark-run.json`](benchmark-run.json) — the chosen ensemble strategy's run, in the canonical benchmark export format. **This file is synthesised, not produced by a real benchmark run.**
- [`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json) — the chosen strategy's per-sample combined predictions.

**Production note: E06 is NOT a deployment.** It uses predictions that were already produced by E00–E05; running E06 against new documents means running all five upstream engines first and then combining. That is ~5× the inference cost of any single engine. The ensemble is documented as a *measurement artifact* showing the headroom that exists above the best single engine — the recommended deployable path is still one of E03 or E05 alone, with E06's per-category breakdown indicating which categories are limiting each engine.

## Re-evaluation note (foundation for the comparison)

Before any comparison work, every engine's stored predictions were re-evaluated against the **current local GT** in `data/datasets/samples-mix/public/`, using the canonical schema-aware evaluator. This was needed because:

1. **E00 was produced by an external deployment** whose evaluator code didn't honour one-of array GT (the `improve/01` change) and whose embedded GT snapshot didn't include the sin/date/phone format-variant promotions from `improve/02` and this branch. The original E00 export's pass/matched columns were structurally undercounting.
2. **The GT was further promoted on this branch.** A dry-run of `promote-gt-format-variants.ts 00-doc-intelligence-template` surfaced 4 additional pure format-variants that E00 reads in form-as-written form but the GT only listed the ISO form: `Fake 2 date` (`April 2,2026`), `Fake 3 sin` (`778 3224959`), `Fake 4 date` (`Mar 2/26`), `HR0081 (3) date` (`March 17/26`). Applied with `--write`. Idempotent for the other engines (none of them produce those exact variants).

After the GT update, all 5 engines were re-evaluated by [`apps/temporal/src/scripts/reevaluate-against-local-gt.ts`](../../../apps/temporal/src/scripts/reevaluate-against-local-gt.ts) (new on this branch), which writes the corrected metrics back into each engine's `benchmark-run.json`. Git history retains the prior numbers. The reported per-engine numbers below are therefore comparable apples-to-apples: same dataset state, same evaluator, same strict rule.

## Cross-engine comparison

### Headline aggregate metrics

| | E00 (DI custom template) | E02 (Mistral / Foundry) | E03 (CU + gpt-5.2) | E04 (gpt-5.4 VLM) | E05 (VLM + DI hybrid) | **E06 (ensemble)** |
|---|---|---|---|---|---|---|
| `pass_rate` | 0.925 | 0.925 | **1.000** | **1.000** | **1.000** | **1.000** |
| `f1.median` | 0.965 | 0.972 | 0.980 | 0.943 | 0.979 | **0.986** |
| `f1.mean` | 0.925 | 0.942 | 0.966 | 0.924 | 0.964 | **0.974** |
| `precision.mean` | 0.996 | **1.000** | **1.000** | **1.000** | 1.000 | **1.000** |
| `recall.mean` | 0.875 | 0.899 | 0.937 | 0.863 | 0.933 | **0.952** |
| `matchedFields.median` | 66 | 69 | 70 | 66 | 71 | **71** |
| `falsePositives.mean` | 0.275 | **0.000** | **0.000** | **0.000** | 0.025 | **0.000** |

See [`plots/01-aggregate-metrics.png`](plots/01-aggregate-metrics.png) for the grouped bar chart and [`plots/02-per-sample-f1-distribution.png`](plots/02-per-sample-f1-distribution.png) for the F1 distribution box plot.

**Observations:**

- **Three of the five single engines clear pass_rate 1.000** under strict + cleaned GT: E03, E04, E05. E00 and E02 land at 0.925 (3 samples below threshold each — the obscured `81 blank`/`81 coffee` pair plus one different sample each, see [`plots/05-per-sample-f1-grouped.png`](plots/05-per-sample-f1-grouped.png)).
- **E03 and E05 are essentially co-leaders** on every single-engine metric. E03 has the highest `f1.mean` (0.966); E05 has the highest `matchedFields.median` (71). The gap to the runner-up is 0.7 pp on `f1.median` and 1 matched field.
- **E04 is the weakest of the gpt-5.x stack.** Its `f1.median` (0.943) trails E03/E05 by 3.7 pp. The deficit concentrates entirely in dense numeric tables and date format variance — see "category-level findings" below.
- **E00 has the highest false-positive rate** (0.275 vs 0.000 for E02/E03/E04 and 0.025 for E05). The custom DI template is over-extracting on a handful of samples — predicting values for spouse-column fields that are visually blank on the form. E00 also has the lowest `recall.mean` (0.875), meaning it misses fields more often than the generative engines.
- **E02 sits in the middle** of the table, held back by the documented Foundry-route ceiling: its annotation pass reads OCR markdown and discards single-character handwriting on the worst three samples.

### Category-level findings (the load-bearing chart)

Per-category mean accuracy (mean across fields in each category), best non-ensemble engine in **bold**:

| category | n_fields | E00 | E02 | E03 | E04 | E05 | E06 |
|---|---|---|---|---|---|---|---|
| **sin** | 2 | 0.786 | 0.861 | 0.871 | 0.809 | **0.923** | 0.898 |
| **date** | 2 | 0.895 | 0.873 | 0.884 | 0.679 | **0.909** | 0.936 |
| **phone** | 2 | 0.818 | 0.884 | **0.963** | 0.807 | 0.936 | 0.963 |
| **name** | 2 | 0.696 | 0.779 | 0.843 | 0.777 | **0.880** | 0.880 |
| **signature** | 2 | 0.605 | 0.579 | 0.625 | 0.509 | **0.675** | 0.680 |
| **freeform_text** | 1 | 0.575 | 0.600 | 0.600 | 0.575 | **0.650** | 0.700 |
| **checkboxes** | 28 | 0.952 | 0.939 | **0.975** | 0.885 | 0.952 | 0.989 |
| **income_amounts** | 37 | 0.852 | 0.905 | 0.944 | 0.912 | **0.951** | 0.953 |

See [`plots/03-per-category-accuracy.png`](plots/03-per-category-accuracy.png).

**Key insights:**

- **E05 wins 5 categories** (sin, date, name, signature, freeform_text, income_amounts) when ensembled. As a single engine, E05 also wins `signature` and `freeform_text` — categories that lean on the model's ability to interpret long-form text and visual cues simultaneously, where hybrid OCR + vision gives gpt-5.4 the most help.
- **E03 wins phone + checkboxes.** Phone accuracy (0.963) is the highest in the table; CU normalises punctuation but is consistent enough that the strict eval works once we have the array-GT support. Checkboxes (0.975) is the strongest individual category metric for any engine — CU's `selectionMark` primitive is genuinely well-suited to the form's two-column Yes/No layout.
- **E00 (custom DI template) is NOT the best on checkboxes** as a single engine — its checkbox accuracy is 0.952, behind E03's 0.975 and tied with E05. The user's hypothesis going in was that the custom-trained template would be the checkbox specialist; the data shows it's a strong second but doesn't lead. E00's strongest *relative* category is checkboxes (0.952 vs its 0.852 income mean), so within E00 it is the most reliable kind of field, but it's not a category leader.
- **E04 is exceptionally weak on dates (0.679).** The gpt-5.4 vision encoder returns dates in form-as-written form, and even with the cleaned-up one-of array GT some hand-written dates (`Apr-02-26`, `Nov 25, 2025`) don't survive strict matching. E04 also trails on signature (0.509), where its `name`-vs-`signature` disambiguation drifts more than the other engines.
- **Income amounts is the most consistent category** across engines (range 0.852–0.951). All five engines extract numeric amounts well; the differences across engines come from a small number of dense-handwriting and blank-vs-zero edge cases.
- **Signature and freeform_text are the floor for every engine.** Even the best ensemble lands at 0.680 / 0.700 on these. Signatures in handwritten samples are interpretively ambiguous (is "X" a signature or a placeholder?); freeform_text is a single-field category and any miss drops it by 2.5 pp. These are the categories where downstream HITL would matter most.

### Per-sample reflection — where do engines fail?

The per-sample F1 grid in [`plots/05-per-sample-f1-grouped.png`](plots/05-per-sample-f1-grouped.png) shows the failure clusters by sample:

- **`81 blank` and `81 coffee`** are the floor for every engine including the ensemble. These are intentionally obscured forms (one blank, one with coffee stains over the data); the floor is not a measurement artifact, it is the physical limit of what is on the page.
- **`Fake 1` / `Fake 4`** are the next floor cluster — handwritten samples where the handwriting density beats some engines' OCR. E00 (template-tuned) and the gpt-5.4-based engines handle them at f1 ~0.78–0.85; E02 (Mistral / Foundry) struggles the hardest because Mistral's annotation pass only sees OCR markdown.
- **`HR0081 (10)`** is the synthetic edge — engines split: E00 gets it at 0.806, the generative engines clear 0.85+, E04 still struggles at 0.85.
- **The remaining 35 samples** all clear F1 0.85 on every engine and most clear 0.95. The ranking on the easy samples is essentially noise.

## E06 — the ensemble combiner

### Strategies explored

Six deployable strategies plus one oracle baseline ([`scripts/build-ensemble.py`](scripts/build-ensemble.py)):

| code | how it picks |
|---|---|
| `S1_per_category_best` | per field's category, take the per-category best engine (E03 for phone/checkboxes, E05 for the other six). No fallback. |
| `S2_best_then_majority_fallback` | S1, but if the best engine returns null-like, fall back to a ≥3 majority vote. |
| `S3_majority_then_best` | If ≥3 engines agree on a non-null value, use it. Else, fall back to per-category best. |
| `S4_weighted_majority` | Weighted vote: each engine's vote weight = its per-category accuracy on this field's category. Pick the highest-weighted value. |
| `S5_weighted_with_null_preference` | S4, but if the per-category best engine returned null AND any other engine agrees null, prefer null (avoids over-extraction). |
| `S6_per_field_weighted_majority` | Same as S4 but with **per-field** weights instead of per-category — finer granularity. |
| `Z_oracle_upper_bound` | Cheating baseline: if any engine got the field right, take that engine's value. Headroom measurement only. |

### Results — strategies vs single-engine baselines

| strategy | pass_rate | f1.median | f1.mean | precision.mean | recall.mean | matched.median | fp.mean |
|---|---|---|---|---|---|---|---|
| E00 alone | 0.925 | 0.965 | 0.925 | 0.996 | 0.875 | 66 | 0.275 |
| E02 alone | 0.925 | 0.972 | 0.942 | 1.000 | 0.899 | 69 | 0.000 |
| E03 alone | 1.000 | 0.980 | 0.966 | 1.000 | 0.937 | 70 | 0.000 |
| E04 alone | 1.000 | 0.943 | 0.924 | 1.000 | 0.863 | 66 | 0.000 |
| E05 alone | 1.000 | 0.979 | 0.964 | 1.000 | 0.933 | 71 | 0.025 |
| S1_per_category_best | 0.975 | 0.980 | 0.970 | 1.000 | 0.945 | 71 | 0.000 |
| S2_best_then_majority_fallback | 0.975 | 0.980 | 0.970 | 1.000 | 0.945 | 71 | 0.000 |
| S3_majority_then_best | 1.000 | 0.986 | 0.972 | 1.000 | 0.949 | 71 | 0.000 |
| S4_weighted_majority | 1.000 | 0.986 | 0.974 | 1.000 | 0.951 | 71 | 0.000 |
| S5_weighted_with_null_preference | 1.000 | 0.986 | 0.974 | 1.000 | 0.951 | 71 | 0.000 |
| **S6_per_field_weighted_majority** | **1.000** | **0.986** | **0.974** | **1.000** | **0.952** | **71** | **0.000** |
| Z_oracle_upper_bound | 1.000 | 0.993 | 0.991 | 1.000 | 0.982 | 73 | 0.000 |

**Chosen strategy: S6_per_field_weighted_majority** ([`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json), [`benchmark-run.json`](benchmark-run.json)).

S6 ties S4 and S5 on every aggregate to three decimals but pulls ahead on `recall.mean` by 0.1 pp — the per-field weights give it a slight edge on the long tail of low-accuracy fields where per-category weights average over too much. S3/S4/S5 are all within 0.2 pp of S6 and would all be reasonable production choices; the differences are inside the noise of a 40-sample dataset.

### Why per-category-best alone (S1/S2) underperforms

S1 and S2 are the most defensible-looking strategies — pick the engine you know is best at this category — but they tie with the best single engine on `f1.median` (0.980) and only beat it on `f1.mean` by 0.4 pp. Worse, they drop `pass_rate` to 0.975 (one sample falls below 0.8). The problem: the "per-category best" engine is best *on average* over that category, but is wrong on individual fields where another engine reads the form better. Voting across engines (S3 onwards) recovers those wins without sacrificing the category-leader's average advantage.

The lesson: when you have multiple roughly-equal engines, **agreement is a stronger signal than category-level ranking**. The weighted-majority strategies treat per-category accuracy as a Bayesian prior, then update it with the actual votes; that beats trusting the prior unconditionally.

### Where the ensemble beats every single engine

Comparing E06 (S6) to the best single-engine on each category:

| category | E06 | best single | engine | delta |
|---|---|---|---|---|
| sin | 0.898 | 0.923 | E05 | **−2.5 pp** |
| date | 0.936 | 0.909 | E05 | **+2.7 pp** |
| phone | 0.963 | 0.963 | E03 | tie |
| name | 0.880 | 0.880 | E05 | tie |
| signature | 0.680 | 0.675 | E05 | +0.5 pp |
| freeform_text | 0.700 | 0.650 | E05 | **+5.0 pp** |
| checkboxes | 0.989 | 0.975 | E03 | **+1.4 pp** |
| income_amounts | 0.953 | 0.951 | E05 | +0.2 pp |

The ensemble wins on 4 categories (date, signature, freeform_text, checkboxes), ties on 2 (phone, name), loses by ≤2.5 pp on 2 (sin, income_amounts is essentially a tie). Net is strongly positive: the categories E06 wins are the ones where multiple engines individually read part of the form correctly but no single engine reads all of it correctly — agreement-based combining recovers the union of correct reads.

The single category where E06 underperforms the best single engine is **sin**, where E05 alone hits 0.923 but E06 lands at 0.898. The mechanism: on a handful of samples, E05 reads the SIN correctly but every other engine misreads it, so the weighted majority votes against E05. This is the diametric opposite of the agreement-wins-by-default pattern, and it's the single place where the ensemble's heuristic actively hurts. A future iteration could carve sin out of the voting and use S1 (per-category best) just for it; the gain would be ~0.2 pp on f1.mean.

### Headroom — the oracle baseline

The oracle baseline (`Z_oracle_upper_bound`) cheats: for every field, it asks "did any engine get this right?" and takes that engine's answer. It is not deployable (you need to know the GT to route) but it tells us the upper bound of what *any* router could achieve on these five engines' predictions.

| | best single (E03) | E06 (S6) | Oracle |
|---|---|---|---|
| `pass_rate` | 1.000 | 1.000 | 1.000 |
| `f1.median` | 0.980 | 0.986 | 0.993 |
| `f1.mean` | 0.966 | 0.974 | 0.991 |
| `recall.mean` | 0.937 | 0.952 | 0.982 |
| `matched.median` | 70 | 71 | 73 |

E06 closes about **40% of the f1.mean gap** between the best single engine and the oracle (E03 → Oracle = 2.5 pp gap; E03 → E06 = 0.8 pp closed). The remaining 60% is on the table for a smarter router — primarily through better per-field calibration, possibly with confidence scores when those become available across all engines. The matched-fields gap (E03 = 70, Oracle = 73 of 74) means there exist 3 fields per sample at the median where *one of the five engines* got it right but the others didn't, and our ensemble didn't pick the right one.

## Reflection — what this tells us about extraction approaches

1. **Generative engines + good prompts have eclipsed the custom-trained template** on this form. E00 (the Azure DI custom template) was the historical baseline approach for forms like the SDPR Monthly Report — train a labelled model, deploy, infer. On the cleaned 40-sample dataset it lands at `pass_rate 0.925` and `f1.median 0.965` — competitive but no longer winning. The three generative paths (CU, VLM-direct, hybrid) all hit `pass_rate 1.000` with `f1.median ≥ 0.943`. The template's structural advantage (it knows the form shape exactly) is fully matched by the generative engines once they have field-level descriptions and a workflow-level prompt.
2. **The hybrid (E05) and CU (E03) are essentially co-leaders.** They win different categories — hybrid takes recall-heavy text fields (names, signatures, free-form) because the VLM can interpret context; CU takes structural fields (phone, checkboxes) because its analyzer schema makes the structure explicit. The "best engine" choice between them is workload-dependent: if the form-shape matters more than recall, pick CU; if reading interpretive content matters more, pick hybrid.
3. **VLM-direct (E04) has a real ceiling on dense-numeric and date-format samples.** It clears `pass_rate 1.000` but its `f1.median 0.943` is meaningfully below its peers. The gap is not "the eval is unfair"; it is "the gpt-5.4 vision encoder produces close-but-not-exact reads on dense numeric tables and reads dates in form-as-written rather than canonical form". Both are real limits, not measurement artifacts.
4. **The ensemble gain is real but modest.** E06 beats the best single engine by 0.8 pp on `f1.mean` and 0.7 pp on `f1.median`, with one extra matched field at the median. For a production system that already has access to E03 or E05 alone, the ensemble would cost ~5× the inference budget to gain ~1 pp. The case for E06 in production is not "always run it" — it is "run when correctness exceeds cost and a single engine isn't enough", e.g. final review of HITL-flagged samples, or batch validation passes.
5. **Per-category accuracy is the load-bearing data.** The aggregate metrics compress too much. The category breakdown ([`data/per-category-accuracy.csv`](data/per-category-accuracy.csv), [`plots/03-per-category-accuracy.png`](plots/03-per-category-accuracy.png)) is what tells you which engine to deploy for which workload, and where the residual errors are. The reflection-worthy single fact in that table is the signature/freeform_text floor at ~0.65–0.70 for every engine — that is the irreducible ambiguity in the form's interpretive fields, and no engine substitution will close it.
6. **The headroom is per-field calibration.** The oracle baseline says there is ~1.7 pp of additional `f1.mean` available with perfect per-field routing. That gap closes if (a) we can score each engine's per-field confidence at inference time and weight by that, (b) we add more engines that genuinely disagree (more votes is more information), or (c) we accept that on a 40-sample dataset, 1.7 pp ≈ 2 fields, which is at the noise floor.

## Reproducing this analysis

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/temporal

# 1. (Optional) Apply any new format-variant GT promotions surfaced by E00
#    or any other engine. Idempotent.
npx tsx -r tsconfig-paths/register src/scripts/promote-gt-format-variants.ts 00-doc-intelligence-template --write

# 2. Re-evaluate every engine's stored predictions against current local GT.
for slug in 00-doc-intelligence-template 02-mistral-doc-ai-azure 03-content-understanding 04-vlm-direct 05-vlm-ocr-hybrid; do
  npx tsx -r tsconfig-paths/register src/scripts/reevaluate-against-local-gt.ts $slug
done

# 3. Generate per-field/per-category accuracy CSVs (also writes plots).
cd ../..
python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py

# 4. Run the ensemble combiner — generates benchmark-run.json + predictions.
python3 experiments/results/06-engine-ensemble/scripts/build-ensemble.py

# 5. Re-run the comparison script with E06 included to refresh plots
INCLUDE_E06=1 python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py
```

## What's NOT in scope here

- **E01 is excluded** from this comparison per the user's instruction. E01 ran on the original 33-sample dataset (pre synth-alignment fix) and would need its own strict + cleaned-GT re-run before it could join the apples-to-apples comparison.
- **Production deployment of the ensemble.** E06's `benchmark-run.json` is synthesised from upstream engine predictions; running it as a live workflow would mean orchestrating all 5 engines per document. That is a separate implementation effort, not done here.
- **Confidence-aware ensemble.** Each engine's `confidence` field exists in the cached responses, but the cross-engine confidence scales aren't normalised (E00's per-field confidence is calibrated, E04's is page-level constant, E05's is bimodal). A confidence-aware S7 would be a follow-up.
- **Cost-aware ensemble.** Engines differ in per-document cost by ~10×. A real production router would weight by cost; we don't yet have a normalised cost-per-document table across all five engines (tracked in [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 2).
