# E02 — Mistral Document AI on Azure Foundry

**Branch**: `experiment/02-mistral-doc-ai-azure` — branched from `experiment/01-neural-doc-intelligence` (chained stack)
**Read first**: `experiments/briefs/_shared-rules.md` — establishes the canonical patterns from E01 (test layout, fixture-capture, benchmark-export deliverable, CI-gate for runtime tests, "fix forward" infra rule, no upstream backporting).

## Goal

Add a parallel provider that calls Mistral Document AI through **Azure AI Foundry** (deployment `mistral-document-ai-2512` on the user's `strukalex-8338-resource` in eastus2), alongside the existing public-API provider at `apps/temporal/src/ocr-providers/mistral/`. Public-API path stays intact for fallback comparison.

## Goal of "fork-not-replace"

The existing Mistral provider is paired with a Mistral subscription and the public `api.mistral.ai` endpoint. The Foundry deployment is paid through the Azure subscription, may lag the public model version, has different auth + endpoint shape, and is regionally bound. Keeping both providers lets us benchmark them against each other.

## Tasks

1. **Read the existing Mistral provider thoroughly** — `apps/temporal/src/ocr-providers/mistral/`. Understand request/response shape, mapper, field-definitions converter. Most of the converters and mapper should be reusable; you'll mostly fork the activity (the HTTP call) and the auth handling.

2. **Create `apps/temporal/src/ocr-providers/mistral-azure/`** with:
   - `mistral-azure-ocr-process.ts` (the activity) — calls Foundry endpoint with Foundry auth; on success returns the same `MistralOcrApiResponse` shape so the existing mappers work. **Single HTTP call**, mirroring `mistral-ocr-process.ts`: pass `document_annotation_format` + `document_annotation_prompt` in the body and let Mistral handle the internal OCR-then-annotation chain server-side. There is no two-call orchestration in our code.
   - Re-export or thin-wrap the existing Mistral mapper / converter where possible. Don't fully duplicate them.
   - The Foundry endpoint URL exact path needs to be resolved by reading Microsoft's "Mistral Document AI on Azure AI Foundry" docs (the base is `https://strukalex-8338-resource.services.ai.azure.com`).

3. **Register `mistralAzureOcr.process` in all three activity registries** (per `_shared-rules.md` — missing any one breaks workflow validation or worker resolution):
   - `apps/temporal/src/activity-registry.ts` — runtime function registration with timeout/retry. Mistral Doc AI's annotation step "can be slower and may result in timeouts" per Microsoft docs, so allow generous timeouts (mirror or exceed the existing `mistralOcr.process` settings).
   - `apps/temporal/src/activity-types.ts` — workflow-safe constant.
   - `apps/backend-services/src/workflow/activity-registry.ts` — save-time validation allow-list.
   Also export the new activity from `apps/temporal/src/activities.ts`.

4. **New env vars** are already declared in `.env.sample` on the parent: `MISTRAL_DOC_AI_AZURE_ENDPOINT`, `MISTRAL_DOC_AI_AZURE_KEY`. The user has already populated their override file.

5. **Define a workflow graph** at `docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`. **Start by copying `docs-md/graph-workflows/templates/mistral-standard-ocr-workflow.json`** — same node structure, but swap `activityType: "mistralOcr.process"` → `"mistralAzureOcr.process"` and update `metadata.name` / `metadata.description`. **Set `metadata.targetLocalDataset = "samples-mix-public"`** (now required per `_shared-rules.md`). The auto-discovery seed (`seedExperimentWorkflows()`) will pick up the JSON and create lineage + version + benchmark definition automatically.

6. **Fix the bbox gap in the Mistral mapper** (cross-engine audit item 5 — flagged in `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md`). `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts` currently sets `polygon: []` for words synthesized from markdown. Mistral's OCR response includes per-word/per-line bbox data — populate `OCRResult.pages[].words[].polygon` from it so E05's VLM+OCR hybrid has spatial info. Convert to the canonical convention (8-element flat polygon `[x1,y1,x2,y2,x3,y3,x4,y4]`, top-left origin, same units the rest of the field uses). Update the existing `mistral-to-ocr-result.test.ts` to assert non-empty polygons. This change benefits both the public-API and Foundry providers since they share the mapper.

7. **Document Mistral's internal preprocessing** (cross-engine audit item 9). Mistral's deskew/rotate/denoise behavior isn't documented in the codebase, so we don't know whether to skip our upstream `pdf-normalization.service.ts`. Resolve from Mistral docs and capture in `docs-md/graph-workflows/02-mistral-doc-ai-azure-OCR.md` (provider-specific doc per `_shared-rules.md` MAY-edit list). Same doc covers Foundry-vs-public differences (auth, endpoint, model version, rate limits).

8. **Trigger the benchmark** via `./scripts/run-experiment-benchmarks.sh 02`. The script (fixed in E01) sends `tags` as an object and passes `persistOcrCache: true` by default, so one cached OCR response per sample lands in `benchmark_ocr_cache`. The run is auto-tagged `{"experiment":"02-mistral-doc-ai-azure"}`.

9. **Save the full benchmark export** to `experiments/results/02-mistral-doc-ai-azure/benchmark-run.json` via `GET /api/benchmark/projects/seed-experiments-project/runs/{runId}/download`. Required deliverable per `_shared-rules.md`.

10. **Capture a real Foundry OCR response** to `apps/temporal/src/__fixtures__/experiment-02/mistral-azure-ocr-response-<sampleId>.json`. The exact `psql` snippet to dump from `benchmark_ocr_cache` is in `_shared-rules.md` dev-loop step 3.

11. **Write workflow-level tests** at `apps/temporal/src/experiment-02-mistral-doc-ai-azure.test.ts`. Two layers (canonical pattern: see `experiment-01-neural-doc-intelligence.test.ts`):
    - **Static** — load + assert the JSON template's metadata, scope rules, chain wiring, schema validation, fixture consistency.
    - **Runtime** — connect to local Temporal at `localhost:7233`, run the actual `graphWorkflow` against the JSON template with mocked activities replaying the captured Foundry fixture. Cover both `reviewSwitch` branches (high-confidence path and low-confidence + signal path). The Mistral template uses a sync `mistralOcr.process`-style node so there's no `pollUntil` to shrink — runtime tests should be near-instant.
    - **Gate the runtime suite** on `process.env.CI` (`const describeRuntime = process.env.CI ? describe.skip : describe;`) so CI's `temporal-qa.yml` doesn't try to connect.

12. **Write `experiments/results/02-mistral-doc-ai-azure/SUMMARY.md`** including:
    - Foundry deployment id (`mistral-document-ai-2512`), endpoint shape, auth header, observed model version (if surfaced).
    - Benchmark run id from step 8 + headline metrics from the schema-aware evaluator (`f1.median`, `precision.mean`, `recall.mean`, `pass_rate`, `matchedFields.median`).
    - **Comparison row vs the public-API path**: ideally trigger a second run against the public-API workflow on the same dataset for direct A/B. If not feasible in this session, note it as future work and leave the comparison empty.
    - Confidence-distribution observations (per `_shared-rules.md` runbook on confidence-threshold recalibration).
    - Any infra fixes you applied; any gaps found in `cleanup` / `normalizeFields` / `characterConfusion` against Mistral output.
    - Confirmation that the bbox-population fix from step 6 is exercised end-to-end (the live run should produce non-empty polygons in the persisted `OCRResult`).

## Architecture verification (already confirmed)

Mistral Document AI is a two-stage system per [Mistral docs](https://docs.mistral.ai/capabilities/document_ai/annotations):

> Mistral OCR uses Mistral LLMs to understand content extracted by OCR-ing a document. The OCR endpoint produces markdown + bboxes. The `document_annotation` step runs an LLM over that with a user-provided schema.

E05 explicitly recreates this pattern with our own components.

## Differences vs the public Mistral API to handle

- **Endpoint URL shape** — `https://<resource>.services.ai.azure.com/...` (Foundry pattern), not `https://api.mistral.ai/v1/ocr`.
- **Auth header** — Azure key-based (`api-key` header) instead of `Bearer` token.
- **Possibly lagging model version** — Foundry deployment is `mistral-document-ai-2512` (December 2025); public API may be ahead.
- **Rate limits** are per-deployment on Foundry, not per-account.
- **`document_annotation` requires a schema** — same as public; the existing `field-definitions-to-mistral-annotation-format.ts` converter should work unchanged.

## Watch for

- The mapper currently assumes a specific response shape. If Foundry returns a slightly different shape (extra wrapper, different confidence-scoring fields), the mapper needs to be parameterized or duplicated.
- Cost telemetry differs: Foundry bills per the deployment's pricing; public API has its own pricing.
- The `MOCK_MISTRAL_OCR=true` env flag (existing for public-API path) — decide whether to extend to cover the Azure path or leave separate.

## Cross-engine audit follow-through

`docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` audited the existing public-Mistral provider against the 12-item checklist and flagged two ⚠️ items for E02:

- **Item 5 (bbox)** — addressed by Task 6 above.
- **Item 9 (engine-internal preprocessing)** — addressed by Task 7 above.

Per `_shared-rules.md`'s "no upstream backporting" rule: if you find any other shared-infra issue while implementing E02, fix it on this branch and document in your `SUMMARY.md`. The chained stack carries the fix forward.
