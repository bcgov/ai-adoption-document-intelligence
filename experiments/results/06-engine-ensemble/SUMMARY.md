# E06 — Engine ensemble combiner

The full write-up of this ensemble — strategies explored, chosen routing, ensemble vs single-engine deltas, oracle headroom, and residual error analysis — now lives in **[Appendix A of the cross-engine comparison report](../report/REPORT.md#appendix-a--e06-ensemble-combiner)**.

## Artifacts in this folder

- [`benchmark-run.json`](benchmark-run.json) — the chosen ensemble strategy's run in the canonical benchmark export format. **Synthesised, not produced by a real benchmark run.**
- [`predictions/best-strategy-predictions.json`](predictions/best-strategy-predictions.json) — per-sample combined predictions chosen by S6 (per-field weighted majority).
- [`data/strategy-comparison.csv`](data/strategy-comparison.csv) — every strategy + each single-engine baseline.
- [`iteration/errors-for-gt-cleanup.md`](iteration/errors-for-gt-cleanup.md) — per-sample mismatch table for the ensemble (140 mismatches across 33 samples — the lowest of any engine).
- [`scripts/build-comparison-report.py`](scripts/build-comparison-report.py) — generates the cross-engine plots + CSVs into `../report/`.
- [`scripts/build-ensemble.py`](scripts/build-ensemble.py) — runs the strategies and writes this folder's outputs.

## Production note

**E06 is not a deployment.** It uses predictions already produced by E00–E05; running E06 against new documents means running all five upstream engines first and combining their outputs (~5× the inference cost of any single engine). It's documented as a measurement artifact showing the headroom that exists above the best single engine — the recommended deployable path is still one of E03 or E05 alone.
