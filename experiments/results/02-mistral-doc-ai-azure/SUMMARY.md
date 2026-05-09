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
| Per-word `bbox` in response | yes (with granularity=word) | not returned on this deployment |
| Per-word/per-line `confidence_scores` | returned | not returned on this deployment |
| `document_annotation` step | runs server-side when `document_annotation_format` is sent | accepts `document_annotation_format` but skips it (`pages_processed_annotation: 0`) — see "Annotation gap" below |
| Page-level fields beyond markdown | none | `header`, `footer`, `hyperlinks`, `tables` (Foundry-specific) |
| Wrapper | bare body | adds `content_filter_results` (Azure RAI hook) |

The brief's preamble mentioned `api-key` header as the Foundry difference, but the Mistral Document AI route on Foundry uses **`Authorization: Bearer`** (confirmed against the LiteLLM Azure-AI provider source and against live calls on this deployment). The actual Foundry-vs-public differences are the URL prefix and the body schema — auth is identical.

## Foundry deployment quota

The default GlobalStandard deployment is **10 RPM**. The 33-sample benchmark fans out 33 parallel child workflows; with the public-Mistral-style retry policy (3 attempts × short backoff) every sample 429'd before clearing quota. The fix landed in this branch:

- `apps/temporal/src/activity-registry.ts` — `mistralAzureOcr.process` now uses **30 attempts, 15 s initial interval, 1.5x backoff, 60 s cap**, applied via the workflow JSON's `retry` block. With this policy the 33-sample run completes inside the 10 RPM quota in ~2.5 minutes (verified: run `0fd7eef6-caea-4c69-868d-f0038cfd4637`, wallclock 156 s).
- Capacity-bump path: `az resource update --ids /subscriptions/.../deployments/mistral-document-ai-2512 --set sku.capacity=120` was attempted; Microsoft caps quota uplifts behind a separate **support request for the `Requests Per Minute - mistral-document-ai-2512` quota**, so the in-experiment fix was the retry-policy tune, not a capacity change.

## Annotation gap (open follow-up)

Live Foundry responses on this deployment carry `document_annotation: null` and `usage_info.pages_processed_annotation: 0` even when the request includes a valid `document_annotation_format` JSON Schema (auto-generated from the SDPR template's 74-field `field_schema`). The activity sends the field; Foundry accepts it (no 422); the annotation simply doesn't run.

Effect on the benchmark: `OCRResult.documents` and `OCRResult.keyValuePairs` come back empty for every sample. The evaluator scores fields by string-fuzzy comparison; with no predicted values, only the **ground-truth-empty** fields trivially "match," producing the artificial precision=1.0 / recall=0.26 spread reported below. No real extraction happened on this run.

Possible causes (none confirmed without raising a Foundry support ticket):

1. The `mistral-document-ai-2512` deployment may not have the annotation step enabled (deployment-tier difference vs. public `mistral-ocr-latest`).
2. The Foundry route may require a different annotation-format key (e.g. `bbox_annotation_format` or a Foundry-specific name).
3. Some other quota/feature flag on the deployment may suppress annotation.

The activity's request body is correct against the documented shape (LiteLLM source + public Mistral API). **This is captured as a follow-up** rather than fixed in E02; the implementation, mapper, and benchmark-cache plumbing are all verified end-to-end against a real Foundry response.

## Real-API benchmark run

| field | value |
|---|---|
| Run id | `0fd7eef6-caea-4c69-868d-f0038cfd4637` |
| Definition | `seed-experiment-02-mistral-doc-ai-azure-definition` |
| Tag | `experiment: 02-mistral-doc-ai-azure` |
| Status | `completed` |
| Wallclock | ~156 s for 33 samples (~4.7 s/sample average; tightly bound by the 10 RPM Foundry quota) |
| Evaluator | `schema-aware` (default rule fuzzy@0.85; pass threshold 0.8) |

Aggregated metrics (`experiments/results/02-mistral-doc-ai-azure/benchmark-run.json`):

| metric | value |
|---|---|
| `pass_rate` | 0.000 (0/33 cleared the 0.8 schema-aware threshold) |
| `f1.mean` | 0.363 |
| `f1.median` | 0.454 |
| `f1.max` | 0.767 |
| `f1.min` | 0.000 |
| `precision.mean` | 0.758 |
| `precision.median` | 1.000 |
| `recall.mean` | 0.255 |
| `recall.median` | 0.293 |
| `matchedFields.median` | 22 (of 74 in schema) |
| `falseNegatives.median` | 48 |
| `falsePositives.median` | 0 |

These numbers are dominated by the **annotation gap** above: with `document_annotation == null`, the mapper produces empty `documents`/`keyValuePairs` and every match recorded by the evaluator is a trivial empty-vs-empty match on optional fields. The "0 false positives" line is the giveaway — Mistral on Foundry isn't extracting anything; it's just not extracting wrong things either. **Direct comparison against E01 (f1.median 0.806) is therefore not meaningful for this run** — it would compare a working extractor against a no-op extractor on the same dataset. Once the annotation gap is resolved on Foundry, re-run E02 and revisit.

## Cross-engine comparison vs E01 (placeholder)

Per the brief's task 12, ideally A/B against the public-Mistral path on the same dataset. **Deferred to follow-up** — the public-Mistral path requires `MISTRAL_API_KEY` (separate Mistral-account secret, not provisioned for this experiment), and the more pressing apples-to-apples comparison is *Foundry-with-annotation-working* vs *Foundry-as-currently-deployed*, which depends on the open Foundry follow-up above. Public-API row, when populated, should sit alongside the E02 row in the consolidated comparison at the end of the chained stack.

## Confidence-distribution observations

Foundry's response on this deployment **does not include `confidence_scores`** (the field is absent entirely; the request can't ask for it because `confidence_scores_granularity` is rejected with HTTP 422). The mapper's documented fallback kicks in and assigns the default page confidence of 0.95 to every synthesized word; `ocr.checkConfidence` therefore reports `averageConfidence ≈ 0.95` on every sample and `requiresReview = false` on every sample under the workflow's default 0.95 threshold. HITL was not exercised on any production sample.

Because the confidence value is canned (no per-word distribution), the per-experiment `confidenceThreshold` knob is **effectively a binary toggle** for this provider — set it to ≤ 0.95 and HITL never fires; set it to > 0.95 and HITL always fires. This matches the runbook caveat in `_shared-rules.md` ("engines that emit a single canned confidence value... need a different gating strategy"). Flagged here rather than worked around in code.

## What the implementation delivers

- **New provider folder** `apps/temporal/src/ocr-providers/mistral-azure/` with the activity + unit tests. Reuses the shared mapper (`ocr-providers/mistral/mistral-to-ocr-result.ts`) and field-definitions converter; only the auth, URL, body, and model-id-resolution differ from the public path.
- **Activity registered** as `mistralAzureOcr.process` in all three registries (runtime function, workflow-safe constant, backend allow-list). Timeout 20 m, 30 attempts with the long-backoff policy described above.
- **Workflow template** at `docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json` — sync chain (`prepareFileData → mistralAzureOcr → cleanup → checkConfidence → reviewSwitch → humanReview/storeResults`). Auto-discovered by `seedExperimentWorkflows()`.
- **Mapper bbox fix** (cross-engine audit item 5): `mistral-to-ocr-result.ts` now populates word/line `polygon` from any `bbox` corners present on `word_confidence_scores`/`line_confidence_scores`. Verified by mapper-level unit tests with synthetic bbox input. *On the Foundry deployment we tested, no bbox data is returned*, so polygons stay empty there; the public-API path (E01-and-later branches) benefits from the fix on responses that do carry bbox data.
- **Cache-persistence fix** for sync providers: the activity emits `ocrResponse` (raw Foundry JSON) alongside `ocrResult` so `benchmark-sample-workflow.ts`'s `persistOcrCache` step writes a row per sample to `benchmark_ocr_cache`. The same gap exists in the public-Mistral path (`mistralOcrProcess` only returns `ocrResult`) but per the brief's "fork-not-replace" rule the public file isn't modified here; the gap is documented for the eventual unified-interface refactor (`docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` § "Decision: defer formalizing the interface" — re-evaluate after E05).
- **Provider doc** at `docs-md/graph-workflows/02-mistral-doc-ai-azure-OCR.md` covers endpoint shape, auth, request-body divergence, internal preprocessing (Mistral OCR 3 handles deskew/rotate/denoise/low-DPI internally — keep upstream `pdf-normalization.service.ts` as-is), and the bbox/confidence/annotation gaps documented above.

## Tests

[`apps/temporal/src/experiment-02-mistral-doc-ai-azure.test.ts`](../../../apps/temporal/src/experiment-02-mistral-doc-ai-azure.test.ts) — two layers, canonical pattern from E01:

**Static (19 tests, no Temporal connection):** template metadata + scope rules + chain wiring (sync, no `pollUntil`) + retry policy shape + graph-schema validation + ctx wiring (incl. `ocrResult` AND `ocrResponse`) + recorded-fixture-shape assertions (Foundry-specific shape: no `confidence_scores`, `document_annotation: null`, `pages_processed_annotation: 0`).

**Runtime (2 tests against local dev-stack Temporal at `localhost:7233`):** high-confidence sample skips humanReview; low-confidence sample routes through humanReview and `humanApproval` signal. Both replay the captured Foundry fixture through mocked activities. CI gate via `process.env.CI ? describe.skip : describe`.

Plus 9 unit tests in `apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.test.ts` (URL construction, auth header, mock mode, request-body shape, error paths) and 4 mapper tests in `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.test.ts` (bbox population for word + line; preserves prior behavior when bbox absent).

`cd apps/temporal && npx jest src/experiment-02-mistral-doc-ai-azure.test.ts` → 21/21 pass (~5 s with runtime; ~3 s with `CI=true`).

## Parent-shared infra fixes applied (per `_shared-rules.md`'s "fix forward" rule)

1. **Activity-retry policy schema in graph-runner**: confirmed via the active workflow trace that `node.retry.{initialInterval,backoffCoefficient,maximumInterval}` are actually honored end-to-end (the graph engine passes them straight to `proxyActivities`). No code change needed; just exercised these fields for the first time.
2. **Sync-provider cache-persistence path**: only the Foundry activity was patched (per "DO NOT touch `apps/temporal/src/activities/mistral-ocr-process.ts`"). The fix pattern — "emit raw response on a separate output port; declare it in ctx; map it through the workflow JSON" — applies cleanly to the public-Mistral activity if/when the unified-provider refactor (`EXTRACTION_PROVIDER_ARCHITECTURE.md`) takes it on.
3. **Test inventory lists**: added `mistralAzureOcr.process` to the activity-type expected-list in `apps/temporal/src/activity-registry.test.ts` and `apps/backend-services/src/workflow/activity-registry.spec.ts`. These lists are constants the tests cross-check against the runtime registry; missing the addition would have broken the suite.

## Gaps in `cleanup` / `normalizeFields` / `characterConfusion` against Foundry output

Per the brief's prompt: with `document_annotation == null` on every sample, none of the post-OCR enrichment activities had structured fields to operate on. The chain ran (cleanup → checkConfidence → store), but only on `extractedText` (the markdown). Until the annotation gap is resolved, this provider exercises `ocr.cleanup` only — the field-level `normalizeFields` and `characterConfusion` activities are no-ops here. **Not a code defect**; just a downstream effect of the annotation gap. Re-evaluate after Foundry annotation works.

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

# 4. Wait ~3 minutes (33 samples through the 10 RPM quota with 15 s/1.5x retries).

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
