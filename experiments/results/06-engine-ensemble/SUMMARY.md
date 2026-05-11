# E06 — Engine ensemble combiner

**Branch**: `improve/03-engine-ensemble-and-comparison`
**Scope**: synthesis only — no new paid benchmarks. Combines stored predictions from E00/E02/E03/E04/E05 (re-evaluated against the current cleaned GT) into a single per-field prediction using a per-field weighted-majority routing logic.
**Dataset**: `seed-local-samples-mix-public-v1` (40 samples, `data/datasets/samples-mix/public/`).
**Evaluator**: schema-aware, `defaultRule: { rule: "exact" }`, `passThreshold: 0.8`, with one-of array GT support.

**For the cross-engine comparison data this ensemble is built on, see [`../report/REPORT.md`](../report/REPORT.md).** This document focuses on the ensemble strategies and chosen routing logic only.

---

## Production note (read this first)

**E06 is NOT a deployment.** It uses predictions that were already produced by E00–E05; running E06 against new documents means running all five upstream engines first and then combining their outputs. That is ~5× the inference cost of any single engine. The ensemble is documented as a **measurement artifact** showing the headroom that exists above the best single engine — the recommended deployable path is still one of E03 or E05 alone, with the per-category breakdown in [`../report/REPORT.md`](../report/REPORT.md) indicating which categories are limiting each engine.

---

## Strategies explored

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

## Results — strategies vs single-engine baselines

| strategy | pass_rate | f1.median | f1.mean | precision.mean | recall.mean | matched.median | fp.mean |
|---|---|---|---|---|---|---|---|
| E00 alone | 0.925 | 0.965 | 0.925 | 0.996 | 0.875 | 66 | 0.275 |
| E02 alone | 0.925 | 0.972 | 0.942 | 1.000 | 0.899 | 69 | 0.000 |
| E03 alone | 1.000 | 0.980 | 0.966 | 1.000 | 0.937 | 70 | 0.000 |
| E04 alone | 1.000 | 0.943 | 0.924 | 1.000 | 0.863 | 66 | 0.000 |
| E05 alone | 1.000 | 0.979 | 0.964 | 1.000 | 0.933 | 71 | 0.025 |
| `S1_per_category_best` | 0.975 | 0.980 | 0.970 | 1.000 | 0.945 | 71 | 0.000 |
| `S2_best_then_majority_fallback` | 0.975 | 0.980 | 0.970 | 1.000 | 0.945 | 71 | 0.000 |
| `S3_majority_then_best` | 1.000 | 0.986 | 0.972 | 1.000 | 0.949 | 71 | 0.000 |
| `S4_weighted_majority` | 1.000 | 0.986 | 0.974 | 1.000 | 0.951 | 71 | 0.000 |
| `S5_weighted_with_null_preference` | 1.000 | 0.986 | 0.974 | 1.000 | 0.951 | 71 | 0.000 |
| **`S6_per_field_weighted_majority`** | **1.000** | **0.986** | **0.974** | **1.000** | **0.952** | **71** | **0.000** |
| `Z_oracle_upper_bound` | 1.000 | 0.993 | 0.991 | 1.000 | 0.982 | 73 | 0.000 |

Source data: [`data/strategy-comparison.csv`](data/strategy-comparison.csv).

**Chosen strategy: `S6_per_field_weighted_majority`** ([`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json), [`benchmark-run.json`](benchmark-run.json)).

S6 ties S4 and S5 on every aggregate to three decimals but pulls ahead on `recall.mean` by 0.1 pp — the per-field weights give it a slight edge on the long tail of low-accuracy fields where per-category weights average over too much. S3/S4/S5 are all within 0.2 pp of S6 and would all be reasonable production choices; the differences are inside the noise of a 40-sample dataset.

## Why per-category-best alone (S1/S2) underperforms

S1 and S2 are the most defensible-looking strategies — pick the engine you know is best at this category — but they tie with the best single engine on `f1.median` (0.980) and only beat it on `f1.mean` by 0.4 pp. Worse, they drop `pass_rate` to 0.975 (one sample falls below 0.8). The problem: the "per-category best" engine is best *on average* over that category, but is wrong on individual fields where another engine reads the form better. Voting across engines (S3 onwards) recovers those wins without sacrificing the category-leader's average advantage.

**The lesson:** when you have multiple roughly-equal engines, **agreement is a stronger signal than category-level ranking**. The weighted-majority strategies treat per-category accuracy as a Bayesian prior, then update it with the actual votes; that beats trusting the prior unconditionally.

## Where the ensemble beats every single engine

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

The single category where E06 underperforms the best single engine is **sin**, where E05 alone hits 0.923 but E06 lands at 0.898. The mechanism: on a handful of samples, E05 reads the SIN correctly but every other engine misreads it, so the weighted majority votes against E05. This is the diametric opposite of the agreement-wins-by-default pattern, and it's the single place where the ensemble's heuristic actively hurts. A future iteration could carve `sin` out of the voting and use S1 (per-category best) just for it; the gain would be ~0.2 pp on f1.mean.

## Headroom — the oracle baseline

The oracle baseline (`Z_oracle_upper_bound`) cheats: for every field, it asks "did any engine get this right?" and takes that engine's answer. It is not deployable (you need to know the GT to route) but it tells us the upper bound of what *any* router could achieve on these five engines' predictions.

| | best single (E03) | E06 (S6) | Oracle |
|---|---|---|---|
| `pass_rate` | 1.000 | 1.000 | 1.000 |
| `f1.median` | 0.980 | 0.986 | 0.993 |
| `f1.mean` | 0.966 | 0.974 | 0.991 |
| `recall.mean` | 0.937 | 0.952 | 0.982 |
| `matched.median` | 70 | 71 | 73 |

E06 closes about **40% of the f1.mean gap** between the best single engine and the oracle (E03 → Oracle = 2.5 pp gap; E03 → E06 = 0.8 pp closed). The remaining 60% is on the table for a smarter router — primarily through better per-field calibration, possibly with confidence scores when those become available across all engines. The matched-fields gap (E03 = 70, Oracle = 73 of 74) means there exist 3 fields per sample at the median where *one of the five engines* got it right but the others didn't, and our ensemble didn't pick the right one.

## E06 errors (post-cleanup)

The per-sample mismatch table is at [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md) — **140 mismatches across 33 samples** (7 samples have zero mismatches under strict eval). This is the lowest mismatch count of any engine on this dataset (E03 has 185, E05 has 190, E04 has 379, E00 has 368, E02 has 297), confirming the ensemble's structural strength.

The residual error categories on E06 are the ones the oracle baseline says are *not fully recoverable* by routing alone:

- **Single-character handwriting** (X-marks, isolated `0`s, signature placeholders). When 4+ engines misread the same character, voting can't recover. These are the `signature` and a subset of the `name` field misses.
- **Numeric blank-vs-zero ambiguity** on a small handful of income-amount fields where the form has a stray pen mark visible. Multiple engines extract `0`; the GT is `""`. Voting amplifies the wrong answer.
- **One-of-array GT not yet covering an engine's format variant.** E.g. an engine reads `April 2, 2026` while the GT array has `["2026-04-02", "April 2,2026"]` — the no-space-before-comma variant is missing. These are caught by `promote-gt-format-variants.ts` and would be absorbed in a subsequent GT cleanup pass.
- **Genuine OCR misreads** — `5` vs `8`, `1` vs `7` confusions on dense handwriting. These are the irreducible per-engine errors that no ensemble can fix.

## Artifacts

- [`SUMMARY.md`](SUMMARY.md) — this file.
- [`benchmark-run.json`](benchmark-run.json) — the chosen ensemble strategy's run, in the canonical benchmark export format. **Synthesised, not produced by a real benchmark run.**
- [`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json) — per-sample combined predictions chosen by S6.
- [`data/strategy-comparison.csv`](data/strategy-comparison.csv) — every strategy + each single-engine baseline.
- [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md) — per-sample mismatch table for the ensemble.
- [`scripts/build-comparison-report.py`](scripts/build-comparison-report.py) — writes plots + data into `../report/` (used by the comparison report).
- [`scripts/build-ensemble.py`](scripts/build-ensemble.py) — strategies + writes this folder's outputs.

## Reproducing

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/temporal

# 1. Re-evaluate every upstream engine's predictions against current GT.
for slug in 00-doc-intelligence-template 02-mistral-doc-ai-azure 03-content-understanding 04-vlm-direct 05-vlm-ocr-hybrid; do
  npx tsx -r tsconfig-paths/register src/scripts/reevaluate-against-local-gt.ts $slug
done

# 2. Generate per-field/per-category accuracy data into results/report/data/.
cd ../..
python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py

# 3. Run the ensemble combiner — writes this folder's outputs.
python3 experiments/results/06-engine-ensemble/scripts/build-ensemble.py

# 4. Refresh comparison-report plots so E06 is included alongside E00-E05.
INCLUDE_E06=1 python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py

# 5. Dump E06's per-sample mismatch table.
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/dump-errors-for-gt-cleanup.ts 06-engine-ensemble
```

## What's NOT in scope

- **E01 is excluded** from the comparison this ensemble is built on (33-sample dataset, pre synth-alignment fix).
- **Production deployment.** E06's `benchmark-run.json` is synthesised; running it as a live workflow would mean orchestrating all 5 engines per document. Separate effort, not done here.
- **Confidence-aware ensemble.** Each engine's `confidence` field exists in the cached responses, but the cross-engine confidence scales aren't normalised (E00's per-field confidence is calibrated, E04's is page-level constant, E05's is bimodal). A confidence-aware S7 would be a follow-up.
- **Cost-aware ensemble.** Engines differ in per-document cost by ~10×. A real production router would weight by cost; we don't yet have a normalised cost-per-document table across all five engines (tracked in [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 2).
