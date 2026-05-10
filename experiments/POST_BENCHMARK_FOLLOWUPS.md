# Post-benchmark follow-ups (cross-experiment)

Tasks that cut across all five experiments — defer until E05 lands and the chained stack is complete. Pick up from this list once you have all five `benchmark-run.json` files committed.

## 1. Re-evaluate every run under strict equality

**Why.** All five experiments are evaluated with the same `schema-aware` evaluator using `defaultRule: { rule: "fuzzy", fuzzyThreshold: 0.85 }, passThreshold: 0.8` (wired in [`apps/shared/prisma/seed.ts:2044-2062`](../apps/shared/prisma/seed.ts#L2044-L2062)). This is correct for cross-experiment comparison — same rule, same dataset, same evaluator — but fuzzy@0.85 is forgiving on close-but-not-exact OCR misreads (e.g. predicted `2326.4` vs ground truth `2326.47`). For a stricter view of "the model got the value exactly right," re-evaluate every run with the rule changed to `"exact"` (or `fuzzyThreshold: 1.0`).

**What this affects** ([detailed in `experiments/results/04-vlm-direct/SUMMARY.md` "Gaps"](results/04-vlm-direct/SUMMARY.md)):

- All `metrics.*` aggregates: `pass_rate`, `f1.*`, `precision.*`, `recall.*`, `matchedFields.*`, `truePositives.*`, `falseNegatives.*`, `falsePositives.*`, `passing_samples`, `failing_samples`.
- Per-sample: `metrics`, `pass`, `evaluationDetails[].matched`.
- `perFieldResults[].{accuracy, correctCount, errorCount, errorRate, errors[]}`.
- `errorDetectionAnalysis.fields[].{errorCount, errorRate, curve, suggestedBestBalance, suggestedCatch90, suggestedMinimizeReview}`.

The raw `similarity`, `predicted`, `expected`, `confidence` values are preserved per evaluation pair — re-evaluation only needs to recompute `matched` and the aggregates downstream of it. **No re-running the model.**

**Two ways to do it:**

### Option A — re-run the benchmarks under a tighter rule

Change the seed config:

```ts
// apps/shared/prisma/seed.ts L2044-L2062
evaluatorType: "schema-aware",
evaluatorConfig: {
  defaultRule: { rule: "exact" },        // <- was { rule: "fuzzy", fuzzyThreshold: 0.85 }
  passThreshold: 0.8,
},
```

`npm run test:db:reset` to re-seed, then re-trigger every experiment via:

```bash
cd apps/temporal
for slug in 01 02 03 04 05; do
  npx tsx -r tsconfig-paths/register src/scripts/trigger-experiment-benchmark.ts $slug
done
```

Save the new exports to `experiments/results/<slug>/benchmark-run-strict.json` (parallel to `benchmark-run.json` so we keep both). Cost: full benchmark re-run for all five experiments (~$15-25, ~30 min wallclock).

### Option B — re-evaluate the existing exports without re-running

Write a script that reads each `benchmark-run.json` and recomputes metrics from the preserved `evaluationDetails[].similarity`. No paid calls, instant turnaround:

```ts
// experiments/scripts/reevaluate-strict.ts (sketch)
//
// For each run:
//   - read perSampleResults[].evaluationDetails
//   - recompute matched = (similarity == 1.0)   // or some other rule
//   - re-aggregate truePositives, falseNegatives, falsePositives per sample
//   - recompute precision, recall, f1 per sample
//   - re-aggregate to top-level metrics, perFieldResults, errorDetectionAnalysis
//   - write benchmark-run-strict.json
```

Option B is the recommended path — it's lossless w.r.t. raw model output, runs in seconds, and produces a parallel comparison artifact you can diff against the fuzzy-evaluated original.

**Expected impact** (estimated from E04's distribution):

- E04 (VLM-direct): drops ~3-4 pp on f1.median because gpt-5.4 vision produces more close-but-not-exact OCR misreads (76 of 1646 matches in the canonical run are fuzzy-only).
- E03 (CU): drops ~1-2 pp — CU's dedicated OCR layer transcribes digits exactly more often.
- E02 (Mistral): somewhere in between.
- Rank order stays the same; the *gap* between E03 and E04 widens slightly.

## 2. Cross-experiment cost normalisation

Each engine bills differently:

- E01 (Azure DI Neural): per-page custom-model invocation
- E02 (Mistral DocAI): per-page OCR + per-token annotation
- E03 (Azure CU): per-page content-extraction + per-token gpt-5.2 generative
- E04 (gpt-5.4 VLM-direct): per-token (input + output) only
- E05 (hybrid): E01-style DI Read per-page + E04-style VLM tokens

`benchmark-run.json` has `usage_info` / `prompt_tokens` / `completion_tokens` etc. but cross-engine cost normalisation requires hard-coded rate cards or a per-engine cost-aggregation activity. Defer until E05 lands; then add a `cost_per_page_usd` column to the comparison table.

## 3. P50 / P95 latency per engine

`benchmark-run.json` carries per-sample `startedAt` / `completedAt`. Compute P50 / P95 / P99 wallclock per engine and add to the comparison table. One small script reading all five exports.

## 4. Rebaseline `iterate-*-extraction.ts` scorer

The per-experiment iteration scripts use strict-with-normalisation matching, but the canonical benchmark uses fuzzy@0.85. This divergence cost time on E04 (iterating to 70.3% per-field accuracy that turned out not to predict the benchmark median). After re-evaluating runs under both rules (item 1), update the iteration scripts to optionally accept a `--scorer fuzzy|strict` flag so future experiments can iterate against whichever matches the configured benchmark rule.
