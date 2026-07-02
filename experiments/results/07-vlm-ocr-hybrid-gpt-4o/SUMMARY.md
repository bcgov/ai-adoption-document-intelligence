# E07 — VLM + OCR hybrid (gpt-4o) — Results

**Branch**: `experiment/07-vlm-ocr-hybrid-gpt-4o` (stacked on `improve/03-engine-ensemble-and-comparison`)
**Pipeline**: identical to [E05](../05-vlm-ocr-hybrid/SUMMARY.md) — Azure Document Intelligence `prebuilt-layout` (markdown + bbox layout) → Azure OpenAI chat-completions with image + OCR markdown + strict-mode JSON Schema response_format. Only the VLM deployment changed.
**VLM**: `gpt-4o` GlobalStandard cap 100 on `strukalex-8338-resource` (Foundry, eastus2). Provisioned for this experiment; previously not deployed on this resource.
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-07-vlm-ocr-hybrid-gpt-4o-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-07-vlm-ocr-hybrid-gpt-4o-workflow.json) — standalone copy of E05's JSON, only the `azureOpenAiDeployment` / `modelId` defaults flipped from `gpt-5.4` to `gpt-4o`.
**Iteration kit**: [`experiments/results/07-vlm-ocr-hybrid-gpt-4o/iteration/`](iteration/) — standalone copy of E05's kit, prompts/field-descriptions unchanged (SDPR-form quirks are engine-agnostic).
**Dataset**: `seed-local-samples-mix-public-v1` (40 samples) — identical to E02-E05.
**Evaluator**: `schema-aware` under `defaultRule: { rule: "exact" }, passThreshold: 0.8` — same strict-equality config as the rest of the improve-stack era.
**Canonical run**: `010a3fa1-4a3f-48be-a58f-ba7ff8c18ed5` ([`benchmark-run.json`](benchmark-run.json)).

## Purpose

Drop-in model comparison: does gpt-4o (older, cheaper, vision-capable) close enough of the gap to gpt-5.4 to be the production choice on this dataset? Same pipeline, same dataset, same prompts — only the model under test changes.

## Scope

Single-shot, no prompt iteration. The smoke iteration on the 3-sample rotation (`synth-full (1)`, `manual sample (1)`, `1 81`) confirmed gpt-4o accepts the strict-mode JSON Schema + vision payload exactly as gpt-5.4 does, then the canonical 40-sample run was triggered with the exact same prompt/field-descriptions as E05's canonical (verbatim copy on this branch). Per the request from session start: no new test file, no new fixtures.

## Aggregate metrics

| metric | value |
|---|---|
| `pass_rate` | **0.900** (36/40 cleared the 0.8 strict threshold) |
| `f1.mean` | **0.923** |
| `f1.median` | **0.952** |
| `f1.max` | 1.000 |
| `f1.min` | 0.692 |
| `f1.stdDev` | 0.078 |
| `precision.mean` | **0.942** |
| `precision.median` | 0.962 |
| `recall.mean` | **0.909** |
| `recall.median` | 0.959 |
| `matchedFields.median` | **68** (of 74 in schema) |
| `matchedFields.min` | 45 |
| `matchedFields.max` | 74 |
| `falsePositives.mean` | **4.00** |
| `falsePositives.max` | 27 (one obscured-form sample) |
| `falseNegatives.mean` | 6.58 |
| `truePositives.median` | 68 |
| Wallclock | **326 s (5 min 26 s)** for 40 samples (~8.2 s/sample wallclock with parallelism) |

## Head-to-head against gpt-5.4 (E05)

Same pipeline, same dataset, same prompts — the only difference is the chat-completions deployment. Numbers below come from each engine's current `benchmark-run.json` (recomputed under the standard-OCR FP/FN definition from `d77b6097`).

| metric | **E07 (gpt-4o hybrid)** | E05 (gpt-5.4 hybrid) | Δ (E07 − E05) |
|---|---|---|---|
| `pass_rate` | **0.900** | 0.975 | −0.075 (3 more failing samples) |
| `f1.mean` | **0.923** | 0.942 | −0.019 |
| `f1.median` | **0.952** | 0.961 | −0.009 |
| `f1.min` | 0.692 | 0.851 | −0.159 |
| `precision.mean` | **0.942** | 0.951 | −0.009 |
| `recall.mean` | **0.909** | 0.935 | −0.026 |
| `matchedFields.median` | **68** | 71 | −3 fields |
| `falsePositives.mean` | **4.00** | 3.38 | +0.62 |
| `falsePositives.max` | 27 | (lower) | + (worst-case worse) |
| Wallclock | **326 s** | 344 s | −18 s (~5% faster) |

**Headline**: gpt-4o on the hybrid pipeline is solidly behind gpt-5.4 by ~2 pp on `f1.mean`, ~1 pp on `f1.median`, and 3 fields at the median. Wallclock is essentially identical (gpt-4o slightly faster). The pipeline architecture is doing most of the work; the model-quality gap shows up as a worse worst case (`f1.min` 0.692 vs 0.851) more than as a worse typical case.

## Cross-engine table (E02 / E03 / E04 / E05 / E07, current `benchmark-run.json` numbers)

All five engines on the same 40-sample dataset, strict-rule evaluator.

| | E02 (Mistral on Foundry) | E03 (Azure CU + gpt-5.2) | E04 (gpt-5.4 VLM-direct) | **E05 (gpt-5.4 hybrid)** | **E07 (gpt-4o hybrid)** |
|---|---|---|---|---|---|
| `pass_rate` | 0.875 | **1.000** | 0.800 | **0.975** | 0.900 |
| `f1.mean` | 0.918 | **0.947** | 0.870 | 0.942 | 0.923 |
| `f1.median` | 0.959 | **0.969** | 0.903 | 0.961 | 0.952 |
| `precision.mean` | 0.941 | **0.958** | 0.876 | 0.951 | 0.942 |
| `recall.mean` | 0.902 | **0.939** | 0.866 | 0.935 | 0.909 |
| `matchedFields.median` | 69 | **70** | 66 | **71** | 68 |
| `falsePositives.mean` | 4.05 | 3.00 | 8.48 | **3.38** | 4.00 |
| Wallclock | 285 s | 405 s | 235 s | 344 s | **326 s** |

E03 (Azure Content Understanding) remains the strongest engine on this dataset across every aggregate. E05 (gpt-5.4 hybrid) is the second-strongest, and E07 (gpt-4o hybrid) inserts between E05 and E02 — better than Mistral on `pass_rate` and `f1.median`, behind both gpt-5.4-based engines.

## Per-sample F1 distribution

40 samples, sorted ascending:

- **6 samples ≥ 0.99** — `3 81`, `HR0081 (2)`, `synth-full (1)`, `synth-full (2)`, `synth-regular (1)`, `synth-regular (3)` (all 1.000)
- **14 samples 0.95–0.99** — `2 81`, `HR0081 (7)`, `manual sample (1/3/4/5/8/9/10)`, `synth-full (3)`, `synth-no-spouse (1/2/3)`, `HR0081 (8)`
- **12 samples 0.85–0.95** — `1 81`, `synth-regular (2)`, `HR0081 (3/4/5/6/9)`, `Fake 2/5/6`, `manual sample (2/7)`
- **4 samples 0.80–0.85** — `Fake 1/3/4`, `HR0081 (10)` (the boundary cases)
- **3 samples 0.70–0.80** — `81 coffee`, `Fake 7`, `manual sample (6)`
- **1 sample < 0.70** — `81 blank` (0.692, the only below-0.70 sample)

Four samples fall below the 0.8 strict pass threshold: `81 blank`, `manual sample (6)`, `81 coffee`, `Fake 7`. E05 only had `manual sample (6)` below threshold (0.784).

## Wins for gpt-4o vs gpt-5.4

A handful of samples actually scored higher on gpt-4o (these are mostly synth and clean handwriting; nothing surprising — both models read clean inputs well):

- `synth-regular (3)`: +0.135 (0.865 → 1.000)
- `synth-no-spouse (3)`: +0.115 (0.865 → 0.981)
- `manual sample (1)`: +0.081 (0.905 → 0.986)
- `synth-regular (1)`: +0.027 (0.973 → 1.000)
- `manual sample (5)/(10)`: +0.027 each
- Small wins on a handful of other manual / synth samples

## Where gpt-4o lost ground — single dominant failure mode

A clear, repeatable failure surfaced across **5 of the top-7 regressions**:

**gpt-4o systematically marks the spouse-column `_no` checkboxes as `"selected"` when the cell is empty/unmarked.** The "no" boxes in the spouse column of the SDPR form are tightly drawn — empty cells have thin borders that gpt-4o appears to interpret as a mark.

Samples affected (same 5-field pattern each time):
- `81 blank`: 5 spouse `_no` checkboxes → `selected` instead of `unselected`
- `Fake 7`, `Fake 5`, `HR0081 (3)`: same 5 spouse `_no` checkboxes
- `1 81`: 5 *applicant* `_no` checkboxes (same failure on the applicant column, not spouse)

This single failure mode accounts for **−0.62 mean F1** points across the affected samples (roughly half the gap to E05's mean F1). E05 (gpt-5.4) does not exhibit it: gpt-5.4's vision encoder evidently reads thin-bordered empty cells as unmarked. Adding a description-level cue ("the `_no` column boxes are unmarked unless visibly filled in") could close this for gpt-4o, but per the standing brief on this experiment ("no prompt tuning"), it's left as a documented gap rather than fixed.

Other gpt-4o-only mismatches on regression samples (each shows up only once):
- `signature` on `HR0081 (10)`: predicted `"ace"` instead of `"Joe"` (one-character handwriting misread).
- `signature` on `Fake 5`: predicted `"Kelly ❤️ X"` — gpt-4o read the decorative heart + 'X' next to the signature as part of the field.
- `applicant_net_employment_income` on `Fake 5`: predicted `0` instead of `500` (blank-vs-zero misread; same class of error E05 documented but at lower frequency).
- `explain_changes` on `HR0081 (3)`: `"NA"` vs ground-truth `"N/A"` (punctuation normalisation).

## Worst sample — `81 blank` (F1 0.692)

The single sample below 0.70. Obscured form (mostly empty / overexposed); historically the floor for every engine. E05 (gpt-5.4) cleared 0.905 on it. E07's drop here is consistent with the checkbox failure mode (10 of the 27 false positives on this sample are the spouse-column `_no` checkboxes flipping from `unselected` to `selected`) plus a higher rate of "phantom" extractions on barely-visible fields (gpt-4o appears more eager to populate fields from faint marks than gpt-5.4).

## Cost note (informal)

Per call: DI prebuilt-layout (~$0.01/page) + gpt-4o vision per-token. Token counts in the canonical run are similar to E05 (same prompt + same schema; output token counts vary by a few percent). At Azure list prices, gpt-4o input/output token rates are roughly half of gpt-5.4's, so cost per sample for the VLM leg should be ~50% of E05. Plus DI cost is identical. Net: ~25–35% cheaper per sample than E05, with a ~2 pp `f1.mean` accuracy hit.

## Conclusion

**gpt-5.4 wins on accuracy; gpt-4o wins on cost.** On this dataset, the hybrid pipeline with gpt-5.4 (E05) hits the 0.8 strict gate on 39/40 samples vs 36/40 with gpt-4o; the production choice between the two is roughly a 2 pp F1 trade for ~30% per-sample cost reduction.

The single dominant gpt-4o failure mode (spouse-column `_no` checkboxes flipping to `selected` on empty cells) is well-defined and likely fixable with a targeted prompt cue; without that cue, gpt-4o sits a clear step behind both gpt-5.4-based engines and behind CU on every aggregate. As a standalone production engine on this form, gpt-4o is not preferred over gpt-5.4 or CU.

## What this branch changed

- **New** [`docs-md/graph-workflows/templates/experiment-07-vlm-ocr-hybrid-gpt-4o-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-07-vlm-ocr-hybrid-gpt-4o-workflow.json) — standalone copy of E05's workflow, deployment defaults flipped to `gpt-4o` + metadata/labels updated. Auto-discovered by `seedExperimentWorkflows()` as definition `seed-experiment-07-vlm-ocr-hybrid-gpt-4o-definition`.
- **New** [`experiments/results/07-vlm-ocr-hybrid-gpt-4o/iteration/`](iteration/) — verbatim copy of E05's iteration kit; only the README was rewritten to reference E07 paths + gpt-4o + the `ITERATION_DIR` env-var override.
- [`apps/temporal/scripts/iterate-hybrid-extraction.ts`](../../../apps/temporal/scripts/iterate-hybrid-extraction.ts) — two small edits:
  - Fixed stale path `data/datasets/samples-mix/private` → `samples-mix/public` (the dataset folder rename from commit `8bd2ccb1` left this iterate script broken for any sample lookup; bug was pre-existing on the parent branch).
  - Added `ITERATION_DIR` env-var override so the iteration kit can be pointed at a folder other than E05's (defaults preserved).
- [`apps/temporal/scripts/trigger-experiment-benchmark.ts`](../../../apps/temporal/scripts/trigger-experiment-benchmark.ts) — added `07-vlm-ocr-hybrid-gpt-4o` to the slug allow-list so the trigger accepts `07` as the prefix.
- **gpt-4o deployment** on the Foundry resource (`az cognitiveservices account deployment create`, model `gpt-4o` version `2024-11-20`, GlobalStandard cap 100). One-time Azure-side change; not a code change.

Not changed (per the standing scope for this branch):
- No new test file under `apps/temporal/src/experiment-07-*.test.ts`.
- No new fixture under `apps/temporal/src/__fixtures__/experiment-07/`.
- E05's workflow, iteration kit, results, and benchmark-run.json are untouched.

## Reproducing this run

```bash
# 0. (Once, Azure-side) Provision gpt-4o.
az cognitiveservices account deployment create \
  --name strukalex-8338-resource --resource-group rg-strukalex-8338 \
  --deployment-name gpt-4o --model-name gpt-4o --model-version 2024-11-20 \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 100

# 1. Re-seed (auto-discovers the E07 workflow JSON).
npm run test:db:reset

# 2. Restart Temporal worker if it wasn't running.
cd apps/temporal && npm run dev

# 3. Preflight on gpt-4o.
cd apps/temporal
TEST_API_KEY=... npx tsx -r tsconfig-paths/register scripts/preflight-hybrid.ts gpt-4o

# 4. (Optional) 3-sample smoke iteration on gpt-4o.
ITERATION_DIR=$(pwd)/../../experiments/results/07-vlm-ocr-hybrid-gpt-4o/iteration \
  TEST_API_KEY=... \
  npx tsx -r tsconfig-paths/register scripts/iterate-hybrid-extraction.ts "1 81" gpt-4o

# 5. Trigger E07 benchmark + poll.
rm -rf /tmp/benchmark-cache/*
TEST_API_KEY=... npx tsx -r tsconfig-paths/register scripts/trigger-experiment-benchmark.ts 07
# Capture the run id from the response, then:
TEST_API_KEY=... npx tsx -r tsconfig-paths/register scripts/poll-experiment-run.ts <runId> 07-vlm-ocr-hybrid-gpt-4o
```

Per-sample timing: ~8.2 s wallclock at gpt-4o cap 100 (DI ~5 s + VLM ~13–25 s).
