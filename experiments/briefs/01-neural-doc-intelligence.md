# E01 — Neural Document Intelligence + post-processing

**Branch**: `experiment/01-neural-doc-intelligence` — branched from `feature/extraction-experiments` (first in the chained stack)
**Read first**: `experiments/briefs/_shared-rules.md`

## Goal

Wire the existing trained neural model into a workflow alongside the relevant post-processing activities, and run a benchmark against the user's seeded dataset.

## What's already done (per the user)

- Neural training capability shipped in PR #134 (`BuildMode = neural`, training-hours, `/training/info` endpoint, UI mode selector).
- A neural model is **already trained** — model id is `"sdpr_synth_test"`.
- The user's 33-sample dataset is seeded and synced to blob storage at `seed-local-samples-mix-public-v1`.

So this experiment is mostly **wiring** — no training, no new providers. The Azure DI activities (`azureOcr.submit/poll/extract`) already exist and are registered. You're composing them with the right post-processing nodes for handwritten input.

## Tasks

1. **Define the workflow graph** at `docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json`. **Start by copying `docs-md/graph-workflows/templates/standard-ocr-workflow-with-corrections.json`**, then:
   - Set `metadata.name` to `"Experiment 01 - Neural DI + Post-Processing"`.
   - `ctx.modelId.defaultValue` should be `"sdpr_synth_test"` (the existing trained neural model). The base template already has this — leave it as-is.
   - **Drop the `spellcheck` node and its edges** (replace `e7c: characterConfusion → spellcheck` and `e7d: spellcheck → checkConfidence` with a single edge `characterConfusion → checkConfidence`). Spellcheck isn't valuable for our handwritten field set.
   - **Don't add `ocr.enrich`** (LLM enrichment is out of scope for E01).
   - **Don't add `ocr.documentValidateFields`** / cross-field validation (out of scope for E01).
   - Keep: `file.prepare → azureOcr.submit/poll/extract → ocr.cleanup → ocr.normalizeFields → ocr.characterConfusion → ocr.checkConfidence → reviewSwitch → humanReview/storeResults`.
   - No activity-type changes — Azure DI activities already exist; no new registrations needed.

   Once dropped in, `seedExperimentWorkflows()` auto-discovers it on the next `npm run test:db:reset` and creates `WorkflowLineage` + `WorkflowVersion` + `BenchmarkDefinition` in `seed-experiments-project`.

2. **Run the workflow on one real document** end-to-end via the real Azure DI API. Confirm `OCRResult` is produced and the cleanup → normalize → character-confusion chain runs without errors.

3. **Run the benchmark programmatically** against the full seeded dataset (33 samples):
   ```bash
   ./scripts/run-experiment-benchmarks.sh 01
   ```
   …or directly:
   ```
   POST /api/benchmark/projects/seed-experiments-project/definitions/seed-experiment-01-neural-doc-intelligence-definition/runs
   ```
   Tag the run with `experiment-01-neural-doc-intelligence`.

4. **Write mock-based tests** once stable. Record the trained-neural-model OCR response from step 2, replay in tests under `apps/temporal/src/ocr-providers/` (or a sensible neighbor location) verifying the workflow + post-processors run correctly.

5. **Write `experiments/results/01-neural-doc-intelligence/SUMMARY.md`** with: trained model id (`sdpr_synth_test`), nodes wired, observations from step 2, benchmark run id from step 3, any gaps found in `cleanup`/`normalizeFields`/`characterConfusion` against neural output.

## Watch for

- **Confidence threshold recalibration** — neural-model output may have different confidence distribution than template output. The `check-ocr-confidence.ts` default threshold of 0.95 was tuned for templates; document and adjust if needed.
- **Date/number normalizers tuned for printed text** — may over-correct on handwriting. Document any rules that misbehave; user can per-field-class disable later.
- **`ConfusionProfile` integration** — `ocr-character-confusion.ts` supports DB-stored profiles. If the user has uploaded a confusion profile for this document type, the activity will pick it up automatically; if not, the built-in rules apply.

## Out of scope for E01 (do NOT implement here)

- LLM-based enrichment (`ocr.enrich` activity / `enrichment-llm.ts`)
- Spellcheck (`ocr.spellcheck` activity)
- Cross-field validation (`document-validate-fields.ts`)

These activities exist in the codebase but the user isn't evaluating them in this experiment. If a later experiment needs them, that experiment adds the node back.
