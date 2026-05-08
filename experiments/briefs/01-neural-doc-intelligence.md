# E01 — Neural Document Intelligence + post-processing inventory

**Branch**: `experiment/01-neural-doc-intelligence`
**Stack**: `develop → feature/neural-model-training (PR #134) → feature/extraction-experiments → experiment/01-neural-doc-intelligence`
**Read first**: `experiments/briefs/_shared-rules.md`

## Goal

Use the neural-model training capability shipped in PR #134 to extract fields from the seeded handwritten-form dataset, audit and wire all applicable post-processing activities into the workflow, run a benchmark, compare against the existing template-model baseline.

## Why this is the first experiment

PR #134 already added `BuildMode = neural` for template models, training-hours, the `/training/info` endpoint, and the UI mode selector. What that PR did *not* do is benchmark a trained neural model against the existing template baseline with full post-processing wired in. That's E01.

## Tasks

1. **Audit the 9 existing post-processing activities** for compatibility with neural-model output:
   - `apps/temporal/src/activities/post-ocr-cleanup.ts` (Unicode, dehyphenation)
   - `apps/temporal/src/activities/ocr-spellcheck.ts` (dictionary-based)
   - `apps/temporal/src/activities/ocr-character-confusion.ts` (built-in confusion rules + `ConfusionProfile` DB model)
   - `apps/temporal/src/activities/ocr-normalize-fields.ts` (field-format application)
   - `apps/temporal/src/activities/enrichment-rules.ts` (type-aware: trim, char-confusion, date, number)
   - `apps/temporal/src/activities/enrichment-llm.ts` (Azure OpenAI semantic correction)
   - `apps/temporal/src/activities/enrich-results.ts` (orchestrator)
   - `apps/temporal/src/activities/check-ocr-confidence.ts` (threshold routing)
   - `apps/temporal/src/activities/document-validate-fields.ts` (cross-field validation)

   For each: confirm it operates correctly on neural-model output. Where neural output shape differs from template output, document the gap and decide: (a) fix in the activity, or (b) fix in the OCR mapper that produces `OCRResult` before post-processing runs.

2. **Train a neural model** against the seeded dataset's training split (or use an already-trained one if the user has one).

3. **Define a workflow graph** wiring `azureOcr.submit`/`poll`/`extract` (already exist) followed by every applicable post-processing activity, then `ocr.checkConfidence` and `ocr.storeResults`. Persist the graph via seed or workflow CRUD API.

4. **Run the workflow** on one real document end-to-end. Confirm `OCRResult` produced, post-processing activities ran, no errors.

5. **Run a benchmark programmatically** via `POST /api/benchmark/projects/:projectId/runs` (user provides the API key) against the seeded dataset's test split. Tag the run with `experiment-01-neural`.

6. **Mock-based tests** — record the trained-neural-model OCR response once, replay in tests verifying the workflow + post-processors operate end-to-end against the mock.

7. **Write `experiments/results/01-neural-doc-intelligence/SUMMARY.md`** with: trained model ID, post-processors wired, gaps found per activity, benchmark run ID, observations.

## TODOs captured here

### APIM-vs-direct DI access (parent-spec TODO)

Today, the app's existing DI calls go through APIM (`api.gov.bc.ca`). Experiments use direct (`*.cognitiveservices.azure.com`). Verify:

- `apps/temporal/src/activities/submit-to-azure-ocr.ts`
- `apps/backend-services/src/template-model/template-model-ocr.service.ts`

…don't have APIM-specific path manipulation that breaks under direct access. If they do, abstract the path-prefix logic so direct works alongside APIM. Capture findings in `SUMMARY.md`.

## Watch for

- **Confidence threshold recalibration** — neural-model output may have different confidence distribution than template output. The `check-ocr-confidence.ts` default threshold of 0.95 was tuned for templates; document and adjust if needed.
- **Date/number normalizers tuned for printed text** — may over-correct on handwriting. Each `enrichment-rules.ts` rule should be evaluated; some may need to be per-field-class enabled.
- **`ConfusionProfile` integration** — the `ocr-character-confusion.ts` activity supports DB-stored profiles. If the user has uploaded a confusion profile for this document type, wire it in.
- **Worse on a field-class** is a finding, not a failure. Document it.

## Reference: Mistral provider as a pattern source

For mapper / converter patterns:
- `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`
- `apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`
