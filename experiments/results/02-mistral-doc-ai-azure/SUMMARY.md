# E02 — Mistral Document AI on Azure AI Foundry — Results

**Branch**: `experiment/02-mistral-doc-ai-azure` (chained on `experiment/01-neural-doc-intelligence`)
**Foundry deployment**: `mistral-document-ai-2512` on `strukalex-8338-resource` (eastus2), GlobalStandard SKU
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json)
**Provider doc**: [`docs-md/graph-workflows/02-mistral-doc-ai-azure-OCR.md`](../../../docs-md/graph-workflows/02-mistral-doc-ai-azure-OCR.md)
**Dataset**: `seed-local-samples-mix-private-v1` (33 samples)

## Endpoint, auth, request/response shape

| | Public Mistral API | Foundry deployment (this experiment) |
|---|---|---|
| URL | `POST https://api.mistral.ai/v1/ocr` | `POST https://<resource>.services.ai.azure.com/providers/mistral/azure/ocr` |
| Auth | `Authorization: Bearer <MISTRAL_API_KEY>` | `Authorization: Bearer <MISTRAL_DOC_AI_AZURE_KEY>` |
| Model param | `mistral-ocr-latest` (or pinned date) | Foundry deployment id, `mistral-document-ai-2512` |
| `confidence_scores_granularity` | accepted | **rejected with HTTP 422** (`extra_forbidden`) |
| Per-word `bbox` / `confidence_scores` in response | not returned by Mistral OCR at any level (only `pages[].images[]` bboxes for embedded charts/figures, per [Mistral docs](https://docs.mistral.ai/capabilities/document_ai/annotations)) | same — not a Mistral feature |
| `document_annotation` step | runs server-side when `document_annotation_format` is sent | **runs only when `json_schema.strict: true` is set** (see "Annotation: required schema flag") |
| Page-level fields beyond markdown | none | `header`, `footer`, `hyperlinks`, `tables` (Foundry-specific) |
| Wrapper | bare body | adds `content_filter_results` (Azure RAI hook) |

The brief's preamble called out `api-key` header as a difference; in practice the Mistral Document AI route on Foundry uses **`Authorization: Bearer`** (confirmed against the LiteLLM Azure-AI provider source and against live calls). The actual Foundry-vs-public differences are the URL prefix, the body schema (no `confidence_scores_granularity`; `strict: true` required for annotation), and the Azure-tenant-scoped key.

## Annotation: required schema flag

The Foundry deployment **silently skips the annotation step** unless the JSON-schema wrapper includes `strict: true` at the `json_schema` level. Without it, requests succeed (HTTP 200), `document_annotation` comes back `null`, and `usage_info.pages_processed_annotation` is 0 — i.e. you get OCR markdown with no structured field extraction. This is a documented quirk of the Foundry route only ([Microsoft Q&A 5767943](https://learn.microsoft.com/en-au/answers/questions/5767943/)); the public Mistral OCR API doesn't require the flag.

The shared converter at [`apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`](../../../apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts) now emits `strict: true`. With it set:

```
pages_processed_annotation: 1
document_annotation: 2790-char JSON, 67 of 74 fields populated on sample "1 81"
```

Asserted in `experiment-02-mistral-doc-ai-azure.test.ts` against the recorded fixture.

## Foundry deployment quota

The default GlobalStandard deployment is **10 RPM**. The 33-sample benchmark fans out 33 parallel child workflows; with the public-Mistral-style retry policy (3 attempts × short backoff) every sample 429'd before clearing quota. The retry policy on `mistralAzureOcr.process` is therefore tuned for Foundry: **30 attempts, 15 s initial interval, 1.5x backoff, 60 s cap**. A 33-sample run completes inside the 10 RPM quota in **~2.5 minutes** wallclock. A capacity bump beyond 10 RPM requires a Microsoft support quota request (the `az resource update --set sku.capacity=...` path is gated on `Requests Per Minute - mistral-document-ai-2512` quota); not pursued here.

## Bounding boxes — not a Mistral feature

The brief asked us to populate per-word/per-line polygons in the canonical mapper. **Mistral OCR does not return per-word or per-line bounding boxes** — only embedded-image bboxes via `pages[].images[]` (charts/figures). This holds on both the public API and the Foundry deployment. The mapper change in this branch is still correct: it now populates polygons from any per-word `bbox` corners *if present*, with the existing behavior (empty polygons synthesized from markdown) as the documented fallback. Verified by mapper-level unit tests with synthetic bbox input. **In production traffic against Mistral, polygons stay empty** — this isn't a deployment misconfiguration, it's the engine's actual response shape. The brief's preamble overstated what Mistral returns.

## Real-API benchmark run

| field | value |
|---|---|
| Run id | `3b4baeaf-8a0a-48f6-a49d-4f265205a672` |
| Definition | `seed-experiment-02-mistral-doc-ai-azure-definition` |
| Tag | `experiment: 02-mistral-doc-ai-azure` |
| Status | `completed` |
| Wallclock | ~149 s for 33 samples (annotation ran on every sample, ~14 s/call median; 10 RPM Foundry quota is the bottleneck) |
| Evaluator | `schema-aware` (default rule fuzzy@0.85; pass threshold 0.8) |

Aggregated metrics ([`experiments/results/02-mistral-doc-ai-azure/benchmark-run.json`](benchmark-run.json)):

| metric | value |
|---|---|
| `pass_rate` | **0.273** (9/33 cleared the 0.8 schema-aware threshold) |
| `f1.mean` | 0.559 |
| `f1.median` | 0.563 |
| `f1.max` | 0.965 (1 sample, near-perfect extraction) |
| `f1.min` | 0.110 |
| `precision.mean` | 0.840 |
| `precision.median` | 1.000 |
| `recall.mean` | 0.454 |
| `recall.median` | 0.392 |
| `matchedFields.median` | 29 (of 74 in schema) |
| `falseNegatives.median` | 36 |
| `falsePositives.mean` | 5.88 (Mistral does over-fill some fields with hallucinated values) |

Mistral Document AI on Foundry is a working extractor on this dataset, but trails the E01 trained-neural baseline — which is expected (E01's `sdpr_synth_test` is a custom-trained model on the SDPR field set, while Mistral is a general-purpose document AI). Comparison:

| | E01 (Neural Azure DI) | E02 (Mistral on Foundry) |
|---|---|---|
| `pass_rate` | 0.515 (17/33) | 0.273 (9/33) |
| `f1.median` | 0.806 | 0.563 |
| `precision.mean` | 0.899 | 0.840 |
| `recall.mean` | 0.587 | 0.454 |
| `falsePositives.mean` | 0 | 5.88 |
| Wallclock / 33 samples | ~83 s | ~149 s |

E01 is the better extractor on this dataset; E02 is precision-leaning but with substantially more hallucinated false positives and lower recall. Both engines are now running real extraction and produce comparable cross-engine metrics for the consolidated comparison at the end of the chained stack.

## Confidence-distribution observations

Foundry's response on this deployment **does not include `confidence_scores`** (the field is absent entirely; the request can't ask for it because `confidence_scores_granularity` is rejected with HTTP 422). The mapper's documented fallback assigns the default page confidence of 0.95 to every synthesized word; `ocr.checkConfidence` therefore reports `averageConfidence ≈ 0.95` on every sample and `requiresReview = false` on every sample under the workflow's default 0.95 threshold. HITL was not exercised on any production sample.

Because the confidence value is canned (no per-word distribution), the per-experiment `confidenceThreshold` knob is **effectively a binary toggle** for this provider — set it to ≤ 0.95 and HITL never fires; set it to > 0.95 and HITL always fires. This matches the runbook caveat in `_shared-rules.md` ("engines that emit a single canned confidence value... need a different gating strategy"). Flagged here rather than worked around in code.

## What the implementation delivers

- **New provider folder** `apps/temporal/src/ocr-providers/mistral-azure/` with the activity + unit tests. Reuses the shared mapper (`ocr-providers/mistral/mistral-to-ocr-result.ts`) and field-definitions converter; only the auth, URL, body, and model-id-resolution differ from the public path.
- **Activity registered** as `mistralAzureOcr.process` in all three registries (runtime function, workflow-safe constant, backend allow-list). Timeout 20 m, 30 attempts × (15 s / 1.5x / 60 s cap) retry policy.
- **Workflow template** at `docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json` — sync chain (`prepareFileData → mistralAzureOcr → cleanup → checkConfidence → reviewSwitch → humanReview/storeResults`). Auto-discovered by `seedExperimentWorkflows()`. `templateModelId` defaults to `seed-sdpr-monthly-report-template` (the seeded SDPR template that ships with the dataset; was originally a stale id copied from the public-Mistral workflow).
- **`strict: true` annotation flag** added to the shared schema converter so the Foundry deployment actually runs the `document_annotation` step (was the root cause of "OCR works but extracts nothing"). Public-API path is unaffected — the public API ignores the flag.
- **Mapper bbox fix** (cross-engine audit item 5): `mistral-to-ocr-result.ts` populates word/line `polygon` from any `bbox` corners present on the response. Verified by mapper-level unit tests with synthetic bbox input. Mistral itself doesn't return per-word bboxes, so polygons stay empty in production traffic against Mistral — the fix is positioned for any future Mistral feature update, and benefits engines on E03–E05 that route through this mapper if/when applicable.
- **Cache-persistence fix** for sync providers: the activity emits `ocrResponse` (raw Foundry JSON) alongside `ocrResult` so `benchmark-sample-workflow.ts`'s `persistOcrCache` step writes a row per sample to `benchmark_ocr_cache`. The same gap exists in the public-Mistral path (`mistralOcrProcess` only returns `ocrResult`) but per the brief's "fork-not-replace" rule the public file isn't modified here.
- **Provider doc** at `docs-md/graph-workflows/02-mistral-doc-ai-azure-OCR.md` covers endpoint shape, auth, request-body divergence, internal preprocessing (Mistral OCR 3 handles deskew/rotate/denoise/low-DPI internally — keep upstream `pdf-normalization.service.ts` as-is), and the bbox/confidence/annotation gaps documented above.

## Tests

[`apps/temporal/src/experiment-02-mistral-doc-ai-azure.test.ts`](../../../apps/temporal/src/experiment-02-mistral-doc-ai-azure.test.ts) — two layers, canonical pattern from E01:

**Static (20 tests, no Temporal connection):** template metadata + scope rules + chain wiring (sync, no `pollUntil`) + retry policy shape + graph-schema validation + ctx wiring (incl. `ocrResult` AND `ocrResponse`) + recorded-fixture-shape assertions (Foundry shape: no `confidence_scores`, populated `document_annotation` with ≥ half non-empty fields, `pages_processed_annotation: 1`).

**Runtime (2 tests against local dev-stack Temporal at `localhost:7233`):** high-confidence sample skips humanReview; low-confidence sample routes through humanReview and `humanApproval` signal. Both replay the captured Foundry fixture through mocked activities. CI gate via `process.env.CI ? describe.skip : describe`.

Plus 9 unit tests in `apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.test.ts` (URL construction, auth header, mock mode, request-body shape, error paths), 4 mapper tests in `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.test.ts` (bbox population for word + line; preserves prior behavior when bbox absent), and converter tests asserting `strict: true` is emitted.

`cd apps/temporal && npx jest src/experiment-02-mistral-doc-ai-azure.test.ts` → 22/22 pass (~5 s with runtime; ~3 s with `CI=true`).

## Smoke-test helper

A standalone Node script lives at [`apps/temporal/src/scripts/test-mistral-foundry-single.ts`](../../../apps/temporal/src/scripts/test-mistral-foundry-single.ts) and hits Foundry once for a single sample, prints whether annotation is populated, and saves the raw response. Useful for verifying schema fixes (e.g. `strict: true`) without burning a 33-sample run.

```bash
cd apps/temporal && npx tsx -r tsconfig-paths/register src/scripts/test-mistral-foundry-single.ts "1 81"
```

## Parent-shared infra fixes applied (per `_shared-rules.md`'s "fix forward" rule)

1. **`strict: true` in the Mistral document-annotation schema** — fixed in the shared converter `field-definitions-to-mistral-annotation-format.ts`. Required for the Foundry deployment to run the annotation step at all. Public-API path unaffected.
2. **Workflow template `templateModelId` default** — corrected from a stale UUID to the seeded `seed-sdpr-monthly-report-template`. Without this, the activity logged "template_not_found_or_empty_schema" and skipped annotation regardless of the `strict` flag.
3. **Sync-provider cache-persistence path** — only the Foundry activity was patched (per "DO NOT touch `apps/temporal/src/activities/mistral-ocr-process.ts`"). The fix pattern — "emit raw response on a separate output port; declare it in ctx; map it through the workflow JSON" — applies cleanly to the public-Mistral activity if/when the unified-provider refactor (`EXTRACTION_PROVIDER_ARCHITECTURE.md`) takes it on.
4. **Test inventory lists**: added `mistralAzureOcr.process` to the activity-type expected-list in `apps/temporal/src/activity-registry.test.ts` and `apps/backend-services/src/workflow/activity-registry.spec.ts`.

## Gaps in `cleanup` / `normalizeFields` / `characterConfusion` against Foundry output

With annotation populated, all three post-processors now have structured fields to operate on. The current E02 workflow only chains `ocr.cleanup` (intentionally — the brief's chain mirrors `mistral-standard-ocr-workflow.json` which is OCR-only post-processing, not the full E01 corrector chain). `normalizeFields` and `characterConfusion` would benefit Mistral output but are not yet wired into this template; adding them would let E02 plausibly close some of the recall gap vs E01. **Not in scope for the E02 brief** — flagged as a future iteration once the cross-engine comparison after E05 lands.

## Reproducing this run

```bash
# 1. Reset DB + auto-seed E02 workflow + benchmark definition.
npm run test:db:reset

# 2. Bring up backend + temporal worker (in two shells).
cd apps/backend-services && npm run start:dev
cd apps/temporal         && npm run dev

# 3. Source the regenerated TEST_API_KEY and trigger.
export TEST_API_KEY=$(grep '^TEST_API_KEY=' ~/.config/bcgov-di/backend-services.env | cut -d= -f2)
./scripts/run-experiment-benchmarks.sh 02

# 4. Wait ~3 minutes (33 samples through the 10 RPM Foundry quota).

# 5. Save the export.
curl -sf -H "x-api-key: $TEST_API_KEY" \
  "http://localhost:3002/api/benchmark/projects/seed-experiments-project/runs/<runId>/download" \
  > experiments/results/02-mistral-doc-ai-azure/benchmark-run.json

# 6. Capture the OCR fixture (any sample id; "1 81" is the canonical one for replay tests).
docker exec ai-doc-intelligence-postgres psql -U postgres -d ai_doc_intelligence -t -A \
  -c "SELECT \"ocrResponse\"::text FROM benchmark_ocr_cache WHERE \"sourceRunId\" = '<runId>' AND \"sampleId\" = '1 81';" \
  | python3 -m json.tool \
  > apps/temporal/src/__fixtures__/experiment-02/mistral-azure-ocr-response-1-81.json
```
