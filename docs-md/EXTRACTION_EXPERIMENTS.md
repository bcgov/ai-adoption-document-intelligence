# Extraction Experiments

Hub doc for the extraction-experiments suite. Index of experiments + status + how to run + per-experiment engine-integration checklist.

See `docs/superpowers/specs/2026-05-08-extraction-experiments-design.md` for the full spec, and `experiments/briefs/` for per-experiment briefs.

## Stacking — chained

Each experiment branches from the **previous** experiment, so the final tip (`experiment/05-vlm-ocr-hybrid`) contains every workflow, every provider, and every seed change from E01–E05 — ready to run all 5 benchmarks against the same dataset and produce a cross-experiment comparison.

```
develop
  └── feature/neural-model-training              (PR #134 — neural training capability)
      └── feature/extraction-experiments         (this branch — shared scaffolding)
          └── experiment/01-neural-doc-intelligence
              └── experiment/02-mistral-doc-ai-azure
                  └── experiment/03-content-understanding
                      └── experiment/04-vlm-direct
                          └── experiment/05-vlm-ocr-hybrid     ← runs all 5 benchmarks
```

## Status

| Experiment | Branch | Status | Benchmark run tags |
|---|---|---|---|
| E01 — Neural DI + post-processing | `experiment/01-neural-doc-intelligence` | ⏳ pending | `experiment-01-neural` |
| E02 — Mistral Document AI on Azure | `experiment/02-mistral-doc-ai-azure` | ✅ implemented + live benchmark run; annotation gap on Foundry deployment is open follow-up (see SUMMARY) | `experiment-02-mistral-doc-ai-azure` |
| E03 — Azure Content Understanding | `experiment/03-content-understanding` | ⏳ pending | `experiment-03-content-understanding` |
| E04 — VLM-direct | `experiment/04-vlm-direct` | ⏳ pending | `experiment-04-vlm-direct-{variant}-{model}` |
| E05 — VLM + OCR hybrid | `experiment/05-vlm-ocr-hybrid` | ⏳ pending | `experiment-05-hybrid-{variant}-{model}` |

## How to run an experiment

1. **Switch to the experiment branch** (chained from the previous experiment, not from this parent):
   - E01: `git checkout -b experiment/01-neural-doc-intelligence feature/extraction-experiments`
   - E02: `git checkout -b experiment/02-mistral-doc-ai-azure experiment/01-neural-doc-intelligence`
   - E03: `git checkout -b experiment/03-content-understanding experiment/02-mistral-doc-ai-azure`
   - E04: `git checkout -b experiment/04-vlm-direct experiment/03-content-understanding`
   - E05: `git checkout -b experiment/05-vlm-ocr-hybrid experiment/04-vlm-direct`
2. **Read the brief** at `experiments/briefs/<slug>.md`. Read `_shared-rules.md` first.
3. **Implement** following the brief's task list.
4. **Run the workflow on a real document** end-to-end against the real engine API.
5. **Run a benchmark** programmatically (via the runner script — only works once your branch seeds the definition):

   ```bash
   ./scripts/run-experiment-benchmarks.sh <leading-number>      # e.g. 02
   ```

   Or trigger directly:

   ```bash
   curl -H "x-api-key: $TEST_API_KEY" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{"tags":["experiment-<slug>"]}' \
        http://localhost:3002/api/benchmark/projects/seed-experiments-project/definitions/seed-experiment-<slug>-definition/runs
   ```

6. **Write mock-based tests** once stable (see `_shared-rules.md` § Dev loop, step 5).
7. **Fill in the engine-integration checklist** (12 items) for your experiment in the section below.
8. **Write the summary** at `experiments/results/<slug>/SUMMARY.md`.

## Run all benchmarks + build comparison report

Once `experiment/05-vlm-ocr-hybrid` is checked out (final tip of the chained stack — has all 5 experiments accumulated), the full benchmark + comparison flow is two commands:

```bash
# 1. Trigger all 5 benchmark runs against the same dataset (33 samples).
./scripts/run-experiment-benchmarks.sh

# 2. Wait for runs to complete (watch progress in the UI or poll the API):
#    GET /api/benchmark/projects/seed-experiments-project/runs

# 3. Download all completed runs to a tmp dir and build a markdown report.
./scripts/compare-experiment-benchmarks.sh
# → /tmp/extraction-experiments-YYYYMMDD-HHMMSS/
#     ├── 01-neural-doc-intelligence/run.json
#     ├── 02-mistral-doc-ai-azure/run.json
#     ├── 03-content-understanding/run.json
#     ├── 04-vlm-direct/run.json
#     ├── 05-vlm-ocr-hybrid/run.json
#     └── COMPARISON.md
```

Both scripts require `TEST_API_KEY` exported (from your override file). The comparison script:
- Lists runs in `seed-experiments-project`
- Filters by tag pattern `experiment-*`
- Picks the most recent **completed** run per tag (so you can re-run individual experiments and the comparison picks up the latest)
- Downloads via the existing `GET /runs/:runId/download` endpoint
- Writes a markdown table with status, field/character/word accuracy, duration, cost, run id

`COMPARISON.md` is intentionally simple — extend the script as you add per-field-class metrics or P95 latency.

## Engine-integration checklists (filled per experiment)

Each experiment fills in this 12-item checklist as part of its work. See `experiments/briefs/_shared-rules.md` for the full item descriptions and references to the codebase files involved.

### E01 — Neural DI

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Map engine output to canonical `OCRResult` | ⏳ | Existing Azure DI mapper applies |
| 2 | Activity-type registration | ⏳ | Existing `azureOcr.submit/poll/extract` |
| 3 | Field schema → engine format | ⏳ | Neural model has its own training; existing flow |
| 4 | Confidence values 0–1 | ⏳ | Verify neural confidence distribution matches threshold semantics |
| 5 | Bounding-box convention | ⏳ | DI returns inches at top-left |
| 6 | Page indexing | ⏳ | |
| 7 | Auth & endpoint via env vars | ⏳ | Direct, bypassing APIM (parent-spec TODO) |
| 8 | Workflow graph | ⏳ | Neural extraction + all post-processors |
| 9 | Engine-internal preprocessing | ⏳ | DI handles deskew/rotate internally |
| 10 | Test coverage | ⏳ | |
| 11 | Benchmark integration | ⏳ | |
| 12 | Cost/usage telemetry | ⏳ | |

### E02 — Mistral Doc AI on Azure

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Map engine output to canonical `OCRResult` | ✅ | Shared mapper at `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts` (extended in E02 to populate per-word/per-line `polygon` from optional `bbox` corners — public-API path benefits too). |
| 2 | Activity-type registration | ✅ | New `mistralAzureOcr.process` registered in all three registries (`activity-registry.ts`, `activity-types.ts`, backend allow-list). 20 m start-to-close timeout, 3 retries. Sync (single HTTP call) like the public-API Mistral path. |
| 3 | Field schema → engine format | ✅ | Reuses `field-definitions-to-mistral-annotation-format.ts` from the public-API provider unchanged. |
| 4 | Confidence values 0–1 | ✅ | `confidence_scores_granularity: "word"` requested; per-word scores ∈ [0,1]. Mapper falls back to `average_page_confidence_score` then `0.95`. |
| 5 | Bounding-box convention | ✅ | Mistral returns axis-aligned bbox corners `{top_left_x, top_left_y, bottom_right_x, bottom_right_y}` in page-pixel space; mapper converts to canonical 8-element top-left-clockwise polygon. |
| 6 | Page indexing | ✅ | `pages[].index` is 0-indexed in the response → `pageNumber = index + 1` (1-indexed in `OCRResult`, matches Azure DI mapper). |
| 7 | Auth & endpoint via env vars | ✅ | `MISTRAL_DOC_AI_AZURE_ENDPOINT` + `MISTRAL_DOC_AI_AZURE_KEY`. URL = `{endpoint}/providers/mistral/azure/ocr`. Auth = `Authorization: Bearer <key>` (LiteLLM-confirmed; `api-key` header is **not** the Foundry convention for this route despite the brief preamble). |
| 8 | Workflow graph | ✅ | `experiment-02-mistral-doc-ai-azure-workflow.json` (sync chain: prepareFileData → mistralAzureOcr → cleanup → checkConfidence → reviewSwitch → humanReview/storeResults). Auto-discovered by `seedExperimentWorkflows()`. |
| 9 | Engine-internal preprocessing | ✅ | Mistral OCR 3 explicitly handles deskew, distortion, low DPI, and background noise internally (per Mistral release notes). The existing upstream `pdf-normalization.service.ts` (PDF→image rendering, DPI normalization) stays on; no separate deskew step needed. |
| 10 | Test coverage | ✅ | `experiment-02-mistral-doc-ai-azure.test.ts` — 19 static + 2 runtime; 4 unit tests on `mistralAzureOcrProcess` (mock + URL/auth + missing-env errors); 3 mapper tests covering bbox population. CI gate via `process.env.CI` skips runtime suite on GitHub Actions. |
| 11 | Benchmark integration | ✅ | Auto-discovered from JSON template; `seed-experiment-02-mistral-doc-ai-azure-definition` seeded against `seed-local-samples-mix-private-v1`. Trigger via `./scripts/run-experiment-benchmarks.sh 02`. |
| 12 | Cost/usage telemetry | ⏳ | `usage_info.pages_processed` (and `doc_size_bytes` when present) returned per-page; cross-engine normalization deferred to post-E05 follow-up. |

### E03 — Azure Content Understanding

(Same template; filled during the experiment.)

### E04 — VLM-direct

(Same template; filled during the experiment.)

### E05 — VLM + OCR hybrid

(Same template; filled during the experiment.)

## Where results live

- **Benchmark runs** — `BenchmarkRun` table, tagged `experiment-XX-...`. Query via `GET /api/benchmark/projects/:projectId/runs`.
- **Per-experiment summaries** — `experiments/results/<slug>/SUMMARY.md`, committed on the experiment branch.
- **Final cross-experiment comparison** — appended at the end of `experiments/results/05-vlm-ocr-hybrid/SUMMARY.md` (E05 is the last one to land).

## Future candidates

After E01–E05 land, see `docs/superpowers/specs/2026-05-08-extraction-experiments-design.md` § "Future candidates" for the next batch of trends to evaluate (confidence-based routing, per-field calibration, multi-engine ensemble voting, agentic correction loop, open-source VLMs, OCR-free models, DeepSeek OCR).
