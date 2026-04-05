# OCR Improvement Pipeline (Feature 008)

The OCR improvement pipeline extracts field mismatches from the baseline benchmark run, runs AI tool recommendations, and creates a candidate workflow with suggested correction nodes. The candidate is then reviewed in the workflow editor, used to start a benchmark run for comparison, and optionally applied back to the base workflow. It is used to evaluate workflow changes before promoting a new baseline.

## Benchmark OCR cache (Azure replay)

To avoid repeat **Azure Document Intelligence** submit/poll when only **downstream** graph nodes change (same dataset, same upstream OCR path), the benchmark API and worker support a small OCR cache:

1. **Populate cache:** Start a benchmark run with `POST .../definitions/:definitionId/runs`. **`persistOcrCache` defaults to `true`** when omitted (set `false` to skip storage). **From the definition UI**, the **Persist OCR cache** switch is on by default. After each **successful** sample, the worker upserts a row in **`benchmark_ocr_cache`** keyed by **`(sourceRunId, sampleId)`** with the **`ctx.ocrResponse`** value from the graph (post–Azure poll).
2. **Replay:** Start a run with **`"ocrCacheBaselineRunId": "<uuid of a completed run>"`** (same project and definition; that run must have cache rows for every sample in the split, or the benchmark workflow **fails fast** on the first miss). The orchestrator loads the JSON and passes **`__benchmarkOcrCache`** in the graph `initialCtx`. The graph runner injects it into **`azureOcr.submit`**, **`azureOcr.poll`**, and **`azureOcr.extract`** so submit/poll short-circuit and extract uses the cached **`ocrResponse`**.
3. **Validity:** Safe only when the **upstream OCR path** (everything before downstream correction) is unchanged vs the source run. Changing model, file prep, or nodes before the cached segment invalidates the cache for that comparison—run a new full OCR benchmark with **`persistOcrCache: true`**.
4. **Mutually exclusive flags:** Do not send both **`persistOcrCache: true`** and **`ocrCacheBaselineRunId`** in the same request.

**Candidate runs:** When a candidate run is started (manually via **Start run** on the definition page), pass **`ocrCacheBaselineRunId`** set to the latest completed baseline run for that definition (when one exists) so the candidate reuses OCR from the baseline when cache rows are present. If there is no baseline or no cache, the candidate run performs full Azure OCR.

**`CreateRunDto`** fields: `runtimeSettingsOverride`, `tags`, `workflowConfigOverride`, `candidateWorkflowVersionId`, **`persistOcrCache`**, **`ocrCacheBaselineRunId`** — see `apps/backend-services/src/benchmark/dto/create-run.dto.ts`.

**Schema / migrations:** The table `benchmark_ocr_cache` must expose the JSON column as **`"ocrResponse"`** (matches `BenchmarkOcrCache.ocrResponse` in Prisma). If Temporal logs show `benchmark.loadOcrCache` failing with a missing column (sometimes reported as `` `(not available)` ``), check `information_schema.columns` for that table: a legacy column named **`payload`** must be renamed. Apply migrations from `apps/shared/prisma/migrations` (e.g. `npx prisma migrate deploy` from `apps/backend-services`, which loads `prisma.config.ts`), including **`20260321120000_benchmark_ocr_cache_rename_payload_to_ocr_response`**.

## Backend

- **Orchestration:** `OcrImprovementPipelineService` in `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`
- **Generate candidate:** `POST /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/generate`
  - **Body (optional):** `{ "normalizeFieldsEmptyValueCoercion"?: "none" | "blank" | "null" }` — when **`normalizeFieldsEmptyValueCoercion`** is set, the candidate workflow forces that value on **every** **`ocr.normalizeFields`** node (overrides the definition graph and any AI-suggested `emptyValueCoercion`). Omit it to leave coercion as configured in the graph / AI output.
  - **Data source:** The pipeline automatically looks up the **baseline run** for the definition and extracts field-level mismatches from `perSampleResults[].evaluationDetails`. A promoted baseline run is required.
  - **Response (`OcrImprovementGenerateResponseDto`):** `{ candidateLineageId, candidateWorkflowVersionId?, recommendationsSummary, analysis?, pipelineMessage?, rejectionDetails?, status, error? }`
  - **Status values:**
    - **`candidate_created`** — a candidate workflow version was created; response includes `candidateWorkflowVersionId` and `candidateLineageId`.
    - **`no_recommendations`** — baseline run had no field mismatches or no applicable tool recommendations; `pipelineMessage` explains why. No candidate workflow was created.
    - **`error`** — an unexpected error occurred (including "No completed baseline run found"); `error` contains the message.
- **Apply candidate to base:** `POST /api/benchmark/projects/:projectId/apply-candidate-to-base`
  - **Body:** `{ "candidateWorkflowVersionId": "<uuid>", "cleanupCandidateArtifacts"?: boolean }`
  - The backend creates a new `WorkflowVersion` on the base `WorkflowLineage` and updates the lineage head. When `cleanupCandidateArtifacts` is `true`, the candidate lineage, its versions, and any definitions/runs pointing to them are deleted.
- **Confusion matrix (HITL-derived):** `POST /api/benchmark/projects/:projectId/confusion-matrix/derive` — JSON body with optional `startDate`, `endDate`, `groupIds`, `fieldKeys` (defaults `groupIds` to the project's group). Returns the `ConfusionMatrixService` result. See [OCR_CONFUSION_MATRICES.md](./OCR_CONFUSION_MATRICES.md).
- **Candidate runs:** `POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs` accepts optional `candidateWorkflowVersionId` (same definition; workflow must belong to the project's group). Run `params` store `candidateWorkflowVersionId` and `workflowConfigHash` when set.
- **Dependencies:** Azure OpenAI (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`) for the AI recommendation step. A completed baseline run with field mismatches must exist for the pipeline to produce recommendations.
- **Auth and candidate workflow ownership:** The pipeline creates a new workflow lineage for the candidate; `actor_id` is taken directly from the caller's **`Actor.id`** (`request.resolvedIdentity.actorId` from `IdentityGuard`). This works for both user-based and API-key-based actors. Requests with no resolved actor (e.g. some API-key-only shapes in tests) fall back to the **definition's source workflow owner** as the acting actor.
- **Override vs stored candidate config:** `BenchmarkRunService.startRun` compares `workflowConfigOverride` to the row in `workflow_version` using **`computeConfigHash`** (`apps/backend-services/src/workflow/config-hash.ts`) — the same canonical normalization (defaults, sorted keys) used for definition `workflowConfigHash`. Raw `JSON.stringify` would often disagree after a DB round-trip even when the graph is unchanged.

## Troubleshooting "no recommendations"

- **No completed baseline run:** The pipeline requires a promoted baseline run on the definition. If no baseline exists or it hasn't completed, the pipeline returns `status: "error"` with `"No completed baseline run found for this definition. Promote a run to baseline first."` Promote a completed run to baseline via `POST .../runs/:runId/baseline`.
- **Baseline has no mismatches:** If the baseline run's `evaluationDetails` show all fields matched, there are no corrections to recommend. Check the run drill-down to verify field errors exist.
- **Analysis text but `no_recommendations`:** The AI returns **`characterConfusion`** and **`spellcheck`** blocks with **`include`** and **`parameters`** (see `AiRecommendationService` / Temporal `ai-toolRecommendation`). The service turns enabled tools into recommendations in fixed order and assigns insertion to the **first edge after `azureOcr.extract`** (from `insertionSlots`). If that edge is missing (no extract node in the graph summary), recommendations are empty. If every recommendation fails graph insertion, the API returns `rejectionDetails` with per-tool reasons.

## Troubleshooting "candidate run results identical to baseline"

If the improvement pipeline created a candidate workflow and started a run, but the run's metrics (e.g. F1, pass rate) are the same as the baseline:

1. **Confirm the run used the candidate config:** Query the run's `params` in the database. When a run was started with a workflow override, `params` includes `candidateWorkflowVersionId` and `workflowConfigHash`. If present, the Temporal workflow was started with the candidate config; the worker executed the graph (including any inserted correction nodes) with that config.
2. **Identical metrics are expected when corrections don't affect evaluated output:** The improvement pipeline inserts **`ocr.characterConfusion`**, **`ocr.normalizeFields`**, and **`ocr.spellcheck`** (in that order) on the first edge after `azureOcr.extract`. If the base graph already had **`ocr.enrich`**, it still runs unchanged. If the benchmark dataset has no errors in the fields those tools target, or the evaluator compares fields that were not modified, aggregate metrics will match the baseline. The correction activities still run; they just do not change the values that feed into the evaluator. To see metric changes, use a dataset/split where the baseline run shows real field mismatches in the fields the correction tools target, or run with an evaluator that compares the same fields the correction tools are scoped to.

### Checking whether any values should have changed

The run's stored **prediction** data is the OCR result after all correction activities. It lives in the run's `metrics` JSON: `metrics.perSampleResults[].prediction` (flat key–value per sample). You can query it to see field values that passed through the tools. Flattening uses `buildFlatPredictionMapFromCtx` (`apps/temporal/src/azure-ocr-field-display-value.ts`), which preserves Azure "empty" as JSON **`null`** unless you coerce. For empty-string ground truth, set **`emptyValueCoercion: "blank"`** on **`ocr.normalizeFields`** in the candidate workflow so empty fields become **`""`** before evaluation.

- **ocr.characterConfusion:** By default, applies only when the value **contains a digit** (numeric/money OCR) or the field key is **identifier- or date-like** (`sin`/`phone`/`date` patterns), or when **`applyToAllFields`** is explicitly true. This avoids substituting letters such as `S`→`5` or `o`→`0` in plain names (e.g. "Scott") merely because those characters appear in the confusion map. **Built-in rules** are split into stable IDs: `oToZero`, `ilToOne`, `ssToFive`, `bToEight`, `gToSix`, `zToTwo`, `qToNine`, `slashToOne`. Use **`enabledRules`** / **`disabledRules`** to toggle them (same pattern as `ocr.normalizeFields`). The default map includes `/` → `1` (`slashToOne`) so values like `6/91.12` can become `6191.12`; for valid slash-separated dates (`MM/DD/YYYY`-style), that substitution is suppressed so separators stay, while other substitutions (e.g. `O`→`0`) can still apply. **`confusionMapOverride`** replaces the entire built-in map (enabled/disabled are ignored); **`documentType`** (LabelingProject id, same as `ocr.enrich`) loads **`field_schema`**: per **`field_type`**, the worker intersects enabled rules (e.g. **`string`** fields omit **`slashToOne`**; **`selectionMark`** / **`signature`** apply no substitutions). Fields not present in the schema keep the previous "all enabled rules" set for that field. Metadata includes **`schemaAware`**, **`enabledRules`** (resolved ids), and **`useOverride`**.
- **ocr.spellcheck:** Only corrects misspellings in scoped text fields (dictionary-based). Null or numeric values are skipped. If scoped fields are null or numbers, no changes.
- **ocr.normalizeFields:** Uses a composable rule pipeline with rule IDs (`unicode`, `whitespace`, `dehyphenation`, `digitGrouping`, `commaThousands`, `dateSeparators`, `currencySpacing`). Parameters `enabledRules` / `disabledRules` control which rules run, and `normalizeFullResult` controls whether full OCR text regions are normalized in addition to field values. Optional **`emptyValueCoercion`**: `none` (default), `blank` (empty display values → `content: ""` and cleared typed slots), or `null` (empty → JSON `null` content). Coercion runs on **all** fields present in the OCR result (not limited by **`fieldScope`**); **`fieldScope`** still limits which fields receive normalization **rules**. Numeric/money-like values can still have numeric rules applied via heuristics even when outside `fieldScope`. **Field-key-aware** steps (shared with the schema-aware evaluator) canonicalize values for common keys: `sin` / `*_sin` and `phone` / `*_phone` → digits-only; `date` / `*_date` → `YYYY-Mmm-DD` when parseable, otherwise **clear** short symbol-only debris (e.g. a lone `$`) so blank date lines align with empty ground truth. See `apps/temporal/src/form-field-normalization.ts`. For **custom model** `documents[0].fields`, Azure often sets both `content` and `valueString`; `extractAzureFieldDisplayValue` prefers typed fields (`valueNumber`, etc.) and `valueString` over `content`, so this activity updates **`valueString`** (and `valueNumber` / `valueInteger` when present on identifier-like fields) in sync with `content` so the final extracted prediction matches the canonicalized form. **Schema-aware mode:** pass **`documentType`** (same as `ocr.enrich` / LabelingProject id). The worker loads `field_schema` and, per field, intersects rules with **`field_type`**: `string` / `signature` → unicode/whitespace/dehyphenation only; `number` → adds digit/currency/date-separator rules; `date` → adds date-separator/currency spacing plus calendar canonicalization even when `field_key` is not `*_date`; `selectionMark` → minimal rules. Fields not in the schema keep the previous "all rules" behavior for that field.
- **ocr.enrich:** Uses the labeling project's `field_schema` (parameter `documentType` = project id). If the project is missing or has an empty schema, the activity returns the input OCR unchanged (`summary: null`). LLM enrichment only runs when `enableLlmEnrichment` is true and fields are below `confidenceThreshold`. Optional **`llmPromptAppend`** (string) is appended to the enrichment LLM user prompt so the correction agent can steer the model (e.g. recurring HITL patterns); it is ignored when empty and only affects the LLM path.

If, after comparing the tool logic to the per-sample predictions, no values qualify for correction, identical metrics are expected.

### Current intended correction order (AI-suggested nodes)

For candidate workflows generated by the improvement pipeline, the AI may only enable **`ocr.characterConfusion`** and **`ocr.spellcheck`**, in that order. Both are inserted on the **first normal edge after `azureOcr.extract`** (immediately downstream of structured OCR). The model does not choose insertion slots; it only sets `include` and tool parameters. Other activities (e.g. `ocr.enrich`, `ocr.normalizeFields`) remain as in the base workflow and are not inserted or modified by the AI recommendation step.

For `ocr.characterConfusion`, the AI selects a **`confusionProfileId`** from the available confusion profiles loaded for the group (see [CONFUSION_PROFILES.md](./CONFUSION_PROFILES.md)). The profile provides the character substitution matrix. If no profiles exist for the group, the AI omits character confusion.

## Evaluation Details vs aggregate metrics

After a run completes, **baseline comparison** can show "no regression" while many fields still fail. Use **run drill-down** (`GET .../runs/:runId/drill-down`) or the UI **Evaluation Details** to inspect **`worstSamples`**, **`mismatchedFields`**, and **`missingFields`** before concluding work is done. Operational checklists for agents: `OCR-TASK.md` §3b and §6.

## Pipeline Debug Log

Each run of the "Generate candidate workflow" button captures a structured debug log with timing and full details of each pipeline step. The log is stored on the `BenchmarkDefinition` record (`pipeline_debug_log` column) and overwritten on each generation run.

### Viewing the Debug Log

In the OCR improvement card on the definition detail view, click **"View debug log"** to expand the debug log accordion. Each step is shown as a collapsible section with:

- **Step name** — human-readable label (e.g., "LLM Prompt", "Baseline Mismatch Extraction")
- **Duration** — how long the step took
- **Timestamp** — when the step started
- **Data** — step-specific payload shown as formatted JSON

The "LLM Prompt" step has nested collapsible sections for the system message and user message, since these can be large.

### API Access

```
GET /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/debug-log
```

Returns `{ entries: PipelineLogEntry[] }` where each entry has `step`, `timestamp`, `durationMs`, and `data` fields.

### Debug Log Steps

| Step | What it captures |
|------|-----------------|
| `baseline_mismatch_extraction` | Baseline run ID, total mismatches, sample corrections |
| `tool_manifest` | Available tool IDs and their parameter names |
| `workflow_load` | Graph node IDs, edges, insertion slots |
| `prompt_build` | Full system and user messages sent to the LLM |
| `llm_request` | Model deployment, API version, max tokens |
| `llm_response` | Raw model response content, token usage stats |
| `recommendation_parse` | Parsed tool recommendations with rationale |
| `apply_recommendations` | Which tools were applied/rejected and why |
| `candidate_creation` | New candidate lineage and version IDs |
| `error` | Error message and stack trace (on failure) |

## UI

- **Location:** Benchmarking → Project → Definition detail. The **OCR improvement pipeline** card has a **Generate candidate workflow** button.
- **Flow:**
  1. Click **Generate candidate workflow**. On success (`candidate_created`), the candidate workflow version is created and linked to a new lineage.
  2. Open the candidate in the **workflow editor** to review the AI-suggested correction nodes. Adjust parameters or structure as needed.
  3. From the definition page, create a **benchmark definition** targeting the candidate workflow version and **start a run**. The run compares the candidate against the baseline metrics.
  4. Review metrics on the **run detail** page. Use **Evaluation Details** for per-sample inspection.
  5. If the candidate improves results, click **Apply candidate to base** on the run detail page to promote it.
- **Apply candidate to base:** On the **benchmark run detail** page, when the run **`status` is `completed`** and the run's definition workflow is a **`benchmark_candidate`** lineage, the UI shows **Apply candidate to base workflow** with an optional **Clean up candidate artifacts** checkbox. That calls `POST /api/benchmark/projects/:projectId/apply-candidate-to-base` with `candidateWorkflowVersionId` and `cleanupCandidateArtifacts`. The backend creates a new `WorkflowVersion` on the base `WorkflowLineage` and updates the lineage head. When `cleanupCandidateArtifacts` is `true`, the candidate lineage, its versions, and any definitions/runs pointing to them are deleted. No baseline metric gate — only completion and a `benchmark_candidate` workflow are required.
- **Start run with candidate (override):** The **Start run** API supports optional **`candidateWorkflowVersionId`** in the body for re-running a persisted candidate workflow without re-running the full pipeline.

## Related

- Feature 008: [feature-docs/008-ocr-correction-agentic-sdlc/README.md](../feature-docs/008-ocr-correction-agentic-sdlc/README.md)
- Step 5 (UI): [feature-docs/008-ocr-correction-agentic-sdlc/step-05-ui.md](../feature-docs/008-ocr-correction-agentic-sdlc/step-05-ui.md)
- Requirements: [OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](./OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md)
