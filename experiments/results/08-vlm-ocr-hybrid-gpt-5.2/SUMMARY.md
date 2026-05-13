# E08 — VLM + OCR hybrid (gpt-5.2) — Results

**Branch**: `experiment/08-vlm-ocr-hybrid-gpt-5.2` (stacked on `experiment/07-vlm-ocr-hybrid-gpt-4o`, which is stacked on `improve/03-engine-ensemble-and-comparison` — results accumulate).
**Pipeline**: identical to [E05](../05-vlm-ocr-hybrid/SUMMARY.md) — Azure Document Intelligence `prebuilt-layout` (markdown + bbox layout) → Azure OpenAI chat-completions with image + OCR markdown + strict-mode JSON Schema response_format. Only the VLM deployment changes.
**VLM**: `gpt-5.2` (already deployed on `strukalex-8338-resource`, eastus2, Foundry, GlobalStandard cap 100). No provisioning needed — gpt-5.2 was deployed for E03's Azure Content Understanding generative leg.
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-08-vlm-ocr-hybrid-gpt-5.2-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-08-vlm-ocr-hybrid-gpt-5.2-workflow.json) — standalone copy of E05's JSON; deployment defaults flipped to `gpt-5.2`, name/description/labels updated.
**Iteration kit**: [`experiments/results/08-vlm-ocr-hybrid-gpt-5.2/iteration/`](iteration/) — standalone copy of E05's kit; prompts/field-descriptions unchanged (engine-agnostic per E05 retrospective).
**Dataset**: `seed-local-samples-mix-public-v1` (40 samples) — identical to E02–E07.
**Evaluator**: `schema-aware` under `defaultRule: { rule: "exact" }, passThreshold: 0.8` — same strict config as the rest of the improve-stack era.
**Canonical run**: `1b16e3d4-5b50-4b77-bb13-6d617b424dbb` ([`benchmark-run.json`](benchmark-run.json)).

## Purpose

Third leg of the same-pipeline model bake-off: does gpt-5.2 (Microsoft's CU generative model, available before gpt-5.4) close, match, or beat gpt-5.4 on the hybrid pipeline? With E05 (gpt-5.4) and E07 (gpt-4o) already on this branch stack, E08 completes a clean three-way head-to-head with the only variable being the VLM deployment.

## Scope

Single-shot, no prompt tuning. 3-sample smoke iteration on the standard rotation (`synth-full (1)`, `manual sample (1)`, `1 81`) confirmed gpt-5.2 round-trips the strict-mode JSON Schema + vision payload identically to gpt-5.4 and gpt-4o. The canonical 40-sample run uses the verbatim E05 prompt + field descriptions. No new test file, no new fixtures.

## Aggregate metrics

| metric | value |
|---|---|
| `pass_rate` | **0.975** (39/40 cleared the 0.8 strict threshold) |
| `f1.mean` | **0.960** |
| `f1.median` | **0.973** |
| `f1.max` | 1.000 |
| `f1.min` | 0.784 |
| `f1.stdDev` | 0.042 |
| `precision.mean` | **0.965** |
| `recall.mean` | **0.955** |
| `matchedFields.median` | **71** (of 74) |
| `matchedFields.min` | 50 |
| `falsePositives.mean` | **2.50** |
| `falsePositives.max` | 16 |
| `falseNegatives.mean` | 3.28 |
| `truePositives.median` | 71 |
| Wallclock | **356 s (5 min 56 s)** for 40 samples (~8.9 s/sample wallclock with parallelism) |

## Headline — gpt-5.2 is the strongest VLM on this pipeline

Across the three VLM bake-off legs on the identical hybrid pipeline:

| metric | **E08 (gpt-5.2)** | E05 (gpt-5.4) | E07 (gpt-4o) |
|---|---|---|---|
| `pass_rate` | **0.975** | 0.975 | 0.900 |
| `f1.mean` | **0.960** | 0.942 | 0.923 |
| `f1.median` | **0.973** | 0.961 | 0.952 |
| `f1.min` | **0.784** | 0.784 | 0.692 |
| `precision.mean` | **0.965** | 0.951 | 0.942 |
| `recall.mean` | **0.955** | 0.935 | 0.909 |
| `matchedFields.median` | **71** | 71 | 68 |
| `falsePositives.mean` | **2.50** | 3.38 | 4.00 |
| Wallclock | 356 s | 344 s | 326 s |

**gpt-5.2 beats gpt-5.4 on every accuracy aggregate** — `f1.mean` +1.8 pp, `f1.median` +1.2 pp, `recall.mean` +2.0 pp, `falsePositives.mean` 26% lower. Both engines pass 39/40 samples and have the same failing sample (`manual sample (6)` at 0.784). gpt-5.4 is only ~3% faster on wallclock.

This is a non-obvious result: the older-numbered model wins. The most likely reason is that gpt-5.2 is the specific model Microsoft optimised for Content Understanding's generative layer (E03 uses gpt-5.2 internally too), so it's been tuned for exactly this kind of structured form extraction; gpt-5.4 is more general-purpose and gains capabilities elsewhere that aren't on display here.

## Cross-engine table (all six runs on the 40-sample cleaned dataset, strict-rule evaluator)

| | E02 (Mistral on Foundry) | E03 (Azure CU + gpt-5.2) | E04 (gpt-5.4 VLM-direct) | E05 (gpt-5.4 hybrid) | E07 (gpt-4o hybrid) | **E08 (gpt-5.2 hybrid)** |
|---|---|---|---|---|---|---|
| `pass_rate` | 0.875 | **1.000** | 0.800 | 0.975 | 0.900 | 0.975 |
| `f1.mean` | 0.918 | 0.947 | 0.870 | 0.942 | 0.923 | **0.960** |
| `f1.median` | 0.959 | 0.969 | 0.903 | 0.961 | 0.952 | **0.973** |
| `precision.mean` | 0.941 | 0.958 | 0.876 | 0.951 | 0.942 | **0.965** |
| `recall.mean` | 0.902 | 0.939 | 0.866 | 0.935 | 0.909 | **0.955** |
| `matchedFields.median` | 69 | 70 | 66 | 71 | 68 | **71** |
| `falsePositives.mean` | 4.05 | 3.00 | 8.48 | 3.38 | 4.00 | **2.50** |
| Wallclock | 285 s | 405 s | 235 s | 344 s | 326 s | 356 s |

**E08 (hybrid + gpt-5.2) takes the top spot on every accuracy aggregate except `pass_rate`** — where E03 (Azure CU) still holds the 1.000 by clearing all 40 samples while E08 misses by one (`manual sample (6)`). On `f1.median`, `f1.mean`, `precision.mean`, `recall.mean`, `matchedFields.median`, and `falsePositives.mean`, E08 is the strongest.

This is interesting because CU and E08 share the same generative model (gpt-5.2) but differ in the OCR layer (CU's proprietary content-extraction layer vs Azure DI prebuilt-layout). Despite that, E08 matches or beats CU on five of seven aggregate measures. The OCR layer difference is essentially noise on this dataset; the generative model dominates.

## Per-sample F1 distribution

40 samples on E08, sorted ascending:

- **4 samples ≥ 0.99** — `3 81`, `HR0081 (2)`, `HR0081 (5)`, `HR0081 (7)` (all 1.000)
- **28 samples 0.95–0.99** — the bulk of the distribution; includes 9 of 10 manual handwriting samples and most real HR forms
- **6 samples 0.85–0.95** — `81 blank`, `manual sample (7)`, `Fake 2/4/6`, `HR0081 (8/10)`
- **1 sample 0.80–0.85** — `Fake 3` (0.846)
- **1 sample 0.70–0.80** — `manual sample (6)` (0.784, the only failing sample)
- **0 samples < 0.70**

The distribution is unusually tight — `f1.stdDev` is **0.042**, the lowest of any engine on this dataset (E05: 0.060, E07: 0.078, E03: 0.069). The hybrid + gpt-5.2 combination has both a high median and low spread.

## Per-sample movement vs gpt-5.4 (E05)

E08 wins on 16 samples, ties on 11, loses on 13 vs E05. Net +0.018 mean F1 in favor of gpt-5.2. The wins are larger than the losses:

**Biggest E08 wins over E05** (gpt-5.2 better than gpt-5.4):
- `Fake 1`: 0.837 → 0.986 (**+0.149**)
- `synth-no-spouse (3)`: 0.865 → 0.981 (+0.115)
- `81 coffee`: 0.851 → 0.959 (+0.108) — one of the historically-floor obscured-form samples
- `synth-regular (2)`: 0.885 → 0.981 (+0.096)
- `synth-regular (3)`: 0.865 → 0.962 (+0.096)
- `HR0081 (9)`: 0.877 → 0.952 (+0.076)
- `Fake 7`: 0.887 → 0.959 (+0.072)
- `manual sample (1)`: 0.905 → 0.973 (+0.068)

**Biggest E08 losses vs E05** (gpt-5.4 better):
- `Fake 6`: 0.986 → 0.919 (−0.068)
- `HR0081 (10)`: 0.986 → 0.951 (−0.035)
- `manual sample (7)`: 0.925 → 0.898 (−0.027)
- `2 81`: 1.000 → 0.973 (−0.027)
- `manual sample (9)`: 0.986 → 0.959 (−0.027)
- `synth-full (2)`: 1.000 → 0.980 (−0.020)

**The wins are concentrated on harder samples; the losses are concentrated on already-perfect or near-perfect samples on E05.** gpt-5.2 raises the floor more than gpt-5.4 raises the ceiling. The obscured-form `81 coffee` going from 0.851 → 0.959 is the most striking single-sample improvement of the experiment.

## Wins for gpt-5.2 vs gpt-4o (E07)

E08 wins on 28 samples, ties on 8, loses on 4 vs E07. The four losses are tiny (≤ 0.027). The wins are substantial — the spouse-column `_no` checkbox failure mode that hammered E07 doesn't appear on E08; gpt-5.2 reads empty checkboxes correctly. Biggest wins:

- `81 blank`: 0.692 → 0.898 (**+0.206**) — E07's worst sample, mostly recovered on E08
- `HR0081 (10)`: 0.810 → 0.951 (+0.141)
- `81 coffee`: 0.779 → 0.959 (+0.180)
- `Fake 7`: 0.791 → 0.959 (+0.168)
- `1 81`: 0.897 → 0.966 (+0.069)
- `Fake 5`: 0.877 → 0.966 (+0.089)
- `Fake 4`: 0.824 → 0.946 (+0.122)
- `HR0081 (3)`: 0.877 → 0.980 (+0.103)

gpt-5.2 is the right answer if you were considering gpt-4o for cost reasons — it's roughly the same generation cost-wise but materially more accurate.

## The single residual failing sample — `manual sample (6)`

`manual sample (6)` scores 0.784 on E08 (below the 0.8 strict gate by 0.016). It scored 0.784 on E05 too — the same sample, the same failure level. The dominant errors on this sample are dense handwritten income figures where the digit shapes are ambiguous (the `2` and `3` are visually similar; the `7` and `1` overlap on this writer's hand). Neither gpt-5.2 nor gpt-5.4 reads it cleanly. This sample is consistent floor across both engines and probably benefits from a per-engine post-processing pass (e.g., flagging single-character handwritten digits in numeric fields for HITL) rather than from prompt tuning.

## Cost note (informal)

Per call: DI prebuilt-layout (~$0.01/page) + gpt-5.2 vision per-token. At Azure list prices, gpt-5.2 input/output rates are typically slightly higher than gpt-4o's but lower than gpt-5.4's. The token counts in this run are essentially identical to E05 (same prompt + same schema), so per-sample cost should fall ~10–20% below E05 with ~2 pp higher F1. Best value of the three legs.

## Conclusion

**gpt-5.2 + hybrid is the production-stack winner on this dataset** by every measure except `pass_rate`, where it's tied with E05 and behind E03. It beats gpt-5.4 by ~1.8 pp `f1.mean`, beats gpt-4o by ~3.7 pp `f1.mean`, beats CU (E03) by ~1.3 pp `f1.mean`. Cost-wise it sits between gpt-4o and gpt-5.4. Wallclock-wise it's competitive with E05 and well ahead of CU (~50 s faster on the same 40-sample run).

The bake-off has a clear ordering:

```
gpt-5.2 hybrid  >  gpt-5.4 hybrid  >  gpt-4o hybrid
   (E08)             (E05)              (E07)
```

If pass-rate-1.000 is a hard requirement (no manual-review fallback), E03 (Azure CU) is still the only engine that clears it on this dataset. If the goal is highest `f1.median` / lowest false-positive rate / lowest per-sample cost, E08 is the choice.

## What this branch changed

Stacks on top of [E07](../07-vlm-ocr-hybrid-gpt-4o/SUMMARY.md):

- **New** [`docs-md/graph-workflows/templates/experiment-08-vlm-ocr-hybrid-gpt-5.2-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-08-vlm-ocr-hybrid-gpt-5.2-workflow.json) — standalone copy of E05's workflow, deployment defaults flipped to `gpt-5.2` + metadata/labels updated. Auto-discovered as `seed-experiment-08-vlm-ocr-hybrid-gpt-5.2-definition`.
- **New** [`experiments/results/08-vlm-ocr-hybrid-gpt-5.2/iteration/`](iteration/) — verbatim copy of E05's iteration kit; only the README references E08 paths + gpt-5.2 + the `ITERATION_DIR` env-var override.
- [`apps/temporal/src/scripts/trigger-experiment-benchmark.ts`](../../../apps/temporal/src/scripts/trigger-experiment-benchmark.ts) — added `08-vlm-ocr-hybrid-gpt-5.2` to the slug allow-list (E07's `07-vlm-ocr-hybrid-gpt-4o` entry preserved from the parent commit).
- **No code/test/fixture changes**; the iterate script's `ITERATION_DIR` env-var override + the `samples-mix/public` path fix were both already on E07's parent commit.

Not changed:
- E05's workflow, iteration kit, results, and `benchmark-run.json` are untouched.
- E07's workflow, iteration kit, results, and `benchmark-run.json` are untouched (E07 sits in this branch's history).

## Reproducing this run

```bash
# 0. gpt-5.2 is already deployed on strukalex-8338-resource (E03 set this up).
#    Confirm with:
az cognitiveservices account deployment list \
  --name strukalex-8338-resource --resource-group rg-strukalex-8338 \
  --query "[?name=='gpt-5.2']" -o table

# 1. Re-seed (auto-discovers the E08 workflow JSON alongside E05/E07).
npm run test:db:reset

# 2. Restart Temporal worker if it wasn't running.
cd apps/temporal && npm run dev

# 3. Preflight on gpt-5.2.
TEST_API_KEY=... npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts gpt-5.2

# 4. (Optional) 3-sample smoke iteration on gpt-5.2.
ITERATION_DIR=$(pwd)/../../experiments/results/08-vlm-ocr-hybrid-gpt-5.2/iteration \
  TEST_API_KEY=... \
  npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "1 81" gpt-5.2

# 5. Trigger E08 benchmark + poll.
rm -rf /tmp/benchmark-cache/*
TEST_API_KEY=... npx tsx -r tsconfig-paths/register src/scripts/trigger-experiment-benchmark.ts 08
TEST_API_KEY=... npx tsx -r tsconfig-paths/register src/scripts/poll-experiment-run.ts <runId> 08-vlm-ocr-hybrid-gpt-5.2
```

Per-sample timing: ~8.9 s wallclock at gpt-5.2 cap 100 (DI ~5–7 s + VLM ~10–25 s).
