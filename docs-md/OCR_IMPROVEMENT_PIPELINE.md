# OCR Improvement Pipeline (Feature 004)

The OCR improvement pipeline aggregates HITL corrections, runs AI tool recommendations, creates a candidate workflow with suggested correction nodes, and starts a benchmark run for comparison. It is used to evaluate workflow changes before promoting a new baseline.

## Benchmark OCR cache (skip repeat Azure OCR)

When iterating on **downstream** correction nodes only (same OCR inputs and upstream graph as a prior run), you can avoid re-calling Azure Document Intelligence submit/poll:

1. **Populate cache:** Start a benchmark run with `POST .../runs` body including **`"persistOcrCache": true`**. After each successful sample, the worker persists `ctx.ocrResponse` (post-poll) into `benchmark_ocr_cache` keyed by `(sourceRunId, sampleId)`.
2. **Replay:** Start a run with **`"ocrCacheBaselineRunId": "<uuid of source run>"`** (must be the same definition/project). The worker loads cached `OCRResponse` per sample and injects `initialCtx.__benchmarkOcrCache` so `azureOcr.submit` / `azureOcr.poll` short-circuit. If the cache row is missing for a sample, the run **fails** for that sample (fail-fast).
3. **Validity:** Only safe when the **upstream OCR path** (everything before `extractResults` in practice) is unchanged vs the source run. Changing model, file prep, or nodes before extract invalidates the cache; run again with `persistOcrCache: true` on a full OCR run.

**Improvement pipeline:** When the pipeline starts a candidate benchmark run, it should pass `ocrCacheBaselineRunId` set to the **current baseline run** for that definition (query `benchmark_runs` where `isBaseline` and `definitionId`), so candidate runs reuse OCR from the baseline. The baseline run must have been executed with `persistOcrCache: true` at least once.

## Backend

- **Orchestration:** `OcrImprovementPipelineService` in `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`
- **HTTP:** `OcrImprovementPipelineController` — `POST /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/run`
- **Candidate runs:** `POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs` accepts optional `candidateWorkflowId` (same definition; workflow must belong to the project’s group). Run `params` store `candidateWorkflowId` and `workflowConfigHash` when set.
  - **Body (optional):** `{ "hitlFilters": { "startDate", "endDate", "groupIds", "fieldKeys", "actions", "limit" } }`
  - **Response:** `{ candidateWorkflowId, benchmarkRunId, recommendationsSummary, analysis?, status, error? }`
  - **Status values:** `benchmark_started` (run started; poll run status separately), `no_recommendations`, `error`
- **Dependencies:** Azure OpenAI (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`) for the AI recommendation step. HITL corrections must exist for the pipeline to produce recommendations.
- **HITL scope:** If the request body does not include `hitlFilters.groupIds`, the backend defaults to the benchmark project’s group so corrections are scoped to that project’s documents.

## Troubleshooting “no recommendations”

- **Which database the backend uses:** On startup, the backend logs `Prisma client initialized; database: <host>/<database name>` (from `DATABASE_URL`). Ensure the app is started from `apps/backend-services` so `ConfigModule` loads `.env` from that directory; the database name in the log should match the one you query (e.g. `localhost/ai_doc_intelligence`).
- **Why aggregation returned 0:** When HITL aggregation finds no corrections, the backend logs `HITL aggregation returned 0 corrections; filters used: <JSON>`. Check that `groupIds` in the filters include the project’s group (e.g. `seed-default-group`) and that the database actually contains `field_corrections` for that group (and actions `confirmed` or `corrected`).

## Troubleshooting "candidate run results identical to baseline"

If the improvement pipeline created a candidate workflow and started a run, but the run's metrics (e.g. F1, pass rate) are the same as the baseline:

1. **Confirm the run used the candidate config:** Query the run's `params` in the database. When a run was started with a workflow override, `params` includes `candidateWorkflowId` and `workflowConfigHash`. If present, the Temporal workflow was started with the candidate config; the worker executed the graph (including any inserted correction nodes) with that config.
2. **Identical metrics are expected when corrections don't affect evaluated output:** The candidate workflow adds OCR correction nodes (e.g. `ocr.characterConfusion`, `ocr.spellcheck`, `ocr.normalizeFields`, `ocr.enrich`). If the benchmark dataset has no errors in the fields those tools target, or the evaluator compares fields that were not modified, aggregate metrics will match the baseline. The correction activities still run; they just do not change the values that feed into the evaluator. To see metric changes, use a dataset/split where HITL corrections indicated real errors in those fields, or run with an evaluator that compares the same fields the correction tools are scoped to.

### Checking whether any values should have changed

The run’s stored **prediction** data is the OCR result after all correction activities. It lives in the run’s `metrics` JSON: `metrics.perSampleResults[].prediction` (flat key–value per sample). You can query it to see field values that passed through the tools.

- **ocr.characterConfusion:** Applies when `applyToAllFields` is true **or** the value contains a confusion glyph from the active confusion map. For valid slash-separated dates (`MM/DD/YYYY`-style), the `/` substitution is suppressed so date separators are preserved, while other substitutions (e.g. `O -> 0`) can still apply.
- **ocr.spellcheck:** Only corrects misspellings in scoped text fields (dictionary-based). Null or numeric values are skipped. If scoped fields are null or numbers, no changes.
- **ocr.normalizeFields:** Uses a composable rule pipeline with rule IDs (`unicode`, `whitespace`, `dehyphenation`, `digitGrouping`, `commaThousands`, `dateSeparators`, `currencySpacing`). Parameters `enabledRules` / `disabledRules` control which rules run, and `normalizeFullResult` controls whether full OCR text regions are normalized in addition to field values. Numeric/money-like values can still have numeric rules applied via heuristics even when outside `fieldScope`.
- **ocr.enrich:** Uses the labeling project’s `field_schema` (parameter `documentType` = project id). If the project is missing or has an empty schema, the activity returns the input OCR unchanged (`summary: null`). LLM enrichment only runs when `enableLlmEnrichment` is true and fields are below `confidenceThreshold`. Optional **`llmPromptAppend`** (string) is appended to the enrichment LLM user prompt so the correction agent can steer the model (e.g. recurring HITL patterns); it is ignored when empty and only affects the LLM path.

If, after comparing the tool logic to the per-sample predictions, no values qualify for correction, identical metrics are expected.

### Current intended correction order

For candidate workflows generated by the improvement pipeline, the preferred insertion order is:

1. `ocr.characterConfusion` after `extractResults` and before `checkConfidence`
2. `ocr.normalizeFields` after `extractResults` and before `checkConfidence` (after character confusion in the same segment)
3. `ocr.enrich` after `postOcrCleanup` and before `checkConfidence` (schema-driven enrichment; requires `documentType` = labeling project id in parameters; graph node binds `documentId` and `cleanedResult`)
4. `ocr.spellcheck` after `checkConfidence` and before `reviewSwitch`

This order is encoded in safe insertion points and AI prompt guidance so deterministic corrections happen before downstream validation and branching.

## UI

- **Location:** Benchmarking → Project → Definition detail. The **OCR improvement pipeline** card has a **Run improvement pipeline** button.
- **Flow:** Click **Run improvement pipeline**. On success (`benchmark_started`), the UI redirects to the new run’s detail page. Use the existing run detail and comparison pages to compare the candidate run to the baseline; promote baseline when satisfied.
- **Start run with candidate (override):** The **Start run** API supports optional **`candidateWorkflowId`** in the body for re-running a persisted candidate workflow without re-running the full pipeline.

## Related

- Feature 004: [feature-docs/004-ocr-correction-agentic-sdlc/README.md](../feature-docs/004-ocr-correction-agentic-sdlc/README.md)
- Step 5 (UI): [feature-docs/004-ocr-correction-agentic-sdlc/step-05-ui.md](../feature-docs/004-ocr-correction-agentic-sdlc/step-05-ui.md)
- Requirements: [OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](./OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md)
