# E06 — Engine ensemble combiner

The full write-up of this ensemble — strategies explored, chosen routing, ensemble vs single-engine deltas, oracle headroom, and residual error analysis — lives in **[Appendix A of the cross-engine comparison report](../report/REPORT.md#appendix-a--e06-ensemble-combiner)**.

## Artifacts in this folder

- [`benchmark-run.json`](benchmark-run.json) — the chosen ensemble strategy's run in the canonical benchmark export format. **Synthesised, not produced by a real benchmark run.**
- [`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json) — per-sample combined predictions chosen by S1 (per-category specialist routing).
- [`data/strategy-comparison.csv`](data/strategy-comparison.csv) — every strategy + each single-engine baseline.
- [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md) — per-sample mismatch table for the ensemble (63 mismatches across 23 samples — the lowest of any engine).
- [`scripts/build-comparison-report.py`](scripts/build-comparison-report.py) — generates the cross-engine plots + CSVs into `../report/`.
- [`scripts/build-ensemble.py`](scripts/build-ensemble.py) — runs the strategies and writes this folder's outputs.

## Engine pool and routing

The ensemble combines predictions from all eight upstream engines (E00, E01, E02, E03, E04, E05, E07, E08). The chosen strategy `S1_per_category_best` routes each field to that category's best single engine:

| category | routes to |
|---|---|
| `sin` | E01 (Azure DI Neural) |
| `date` | E05 (gpt-5.4 hybrid) |
| `phone` | E08 (gpt-5.2 hybrid) |
| `name` | E05 (gpt-5.4 hybrid) |
| `signature` | E07 (gpt-4o hybrid) |
| `freeform_text` | E05 (gpt-5.4 hybrid) |
| `checkboxes` | E03 (Azure CU + gpt-5.2) |
| `income_amounts` | E08 (gpt-5.2 hybrid) |

Reproducing E06 on new documents requires running the five distinct specialist engines (E01, E03, E05, E07, E08). E00, E02, and E04 contribute to strategy selection (we evaluate them to confirm S1 still wins) but their predictions are not used at routing time.

## Production note

**E06 is a measurement, not a packaged deployment.** At ~$0.249/page (sum of the five specialist engines, cold-cache) it is ~5.5× the per-page cost of E08 alone (~$0.046). The deltas vs E08 are real (F1.mean 0.984 vs 0.973, FP.mean 0.83 vs 1.58, matched.median 73 vs 72) but the cost premium only makes sense when wrong-value substitutions cost human-review time worth more than the inference delta, or when the extra recall on hard samples justifies the spend. For most production workloads E08 alone is the recommended path.
