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
| Run id | `1b97de43-b06d-44da-a3ae-659340ea255f` |
| Definition | `seed-experiment-02-mistral-doc-ai-azure-definition` |
| Tag | `experiment: 02-mistral-doc-ai-azure` |
| Status | `completed` |
| Wallclock | ~290 s for 40 samples (~7.3 s/sample average; 10 RPM Foundry quota throttle still in play) |
| Evaluator | `schema-aware` (default rule fuzzy@0.85; pass threshold 0.8) |
| Dataset | 40 samples (21 real HR + 9 synth-* aligned + 10 manual handwriting samples) |
| Workflow params | `documentAnnotationPrompt` (2.1 KB), `fieldDescriptions` (74 fields), `numericFieldsNullable: true` — embedded in the workflow JSON's `mistralAzureOcr` node, sourced from the iteration kit |

Aggregated metrics ([`experiments/results/02-mistral-doc-ai-azure/benchmark-run.json`](benchmark-run.json)):

| metric | value |
|---|---|
| `pass_rate` | **0.875** (35/40 cleared the 0.8 schema-aware threshold) |
| `f1.mean` | 0.907 |
| `f1.median` | 0.943 |
| `f1.max` | 0.993 |
| `f1.min` | 0.598 |
| `precision.mean` | 0.975 |
| `precision.median` | 1.000 |
| `recall.mean` | 0.864 |
| `recall.median` | 0.919 |
| `matchedFields.median` | 66 (of 74 in schema) |
| `falseNegatives.median` | 6 |
| `falsePositives.mean` | 1.25 |

### Comparison vs E01 (Neural Azure DI)

E01 ran on the original 33-sample dataset before the synth-* alignment fix; E02's canonical run is on the corrected 40-sample dataset (orphans removed, +10 manual handwriting samples). Apples-to-apples requires re-running E01 on the same 40 samples — that hasn't happened yet, so the table below compares each engine's best result on its own dataset shape.

| | E01 (33 samples) | E02 (40 samples, aligned + tuned prompts) |
|---|---|---|
| `pass_rate` | 0.515 (17/33) | **0.875 (35/40)** |
| `f1.median` | 0.806 | **0.943** |
| `f1.mean` | 0.683 | **0.907** |
| `precision.mean` | 0.899 | **0.975** |
| `recall.mean` | 0.587 | **0.864** |
| `matchedFields.median` | 50 (of 74) | **66 (of 74)** |
| `falsePositives.mean` | 0 | 1.25 |
| Wallclock / sample | ~2.5 s | ~7.3 s (gated by 10 RPM Foundry quota) |

Most of the E02 improvement comes from three places: (1) iteration-kit prompts (per-field descriptions + global instructions + nullable numerics), (2) realigned synth-* dataset (the previous comparison was unfairly penalising E02 with a +1 GT/JPG shift), and (3) more samples to average over (the 10 hand-written manual samples Mistral handles cleanly add a chunk of high-f1 mass to the mean).

The remaining `falsePositives.mean` of 1.25 vs E01's 0 is the honest gap — Mistral is a general-purpose engine and over-fills empty rows on a few sample shapes. The full benchmark export shows the pattern concentrates on `synth-no-spouse` and `synth-regular (2,3)` (10 FPs each — Mistral predicts a value in the spouse income column even though the form leaves it blank). Tightening the "must-be-blank-when-blank" instruction in the iteration-kit prompt would close this; not done in this branch (out of scope; flagged for the cross-engine comparison after E05).

### Per-sample breakdown (synth alignment fixed)

`synth-full (1-3)`: f1 0.986–0.993 (essentially perfect after alignment fix). `synth-regular (1)`: f1 0.979. `synth-no-spouse` and `synth-regular (2,3)`: f1 0.870–0.894 with 10 FPs each (the over-fill pattern above). All 10 manual handwriting samples land between 0.862 and 0.979 — substantially better than HR0081 series (which Mistral's underlying OCR doesn't read well due to handwriting density; flagged in earlier section).

### Earlier runs on this branch (for reference)

- `9868a1f7-...` — first end-to-end run after the `strict: true` fix, but `templateModelId` default was stale → annotation was skipped. pass_rate 0.0.
- `0fd7eef6-...` / `3b4baeaf-...` — cleared up the templateModelId default; auto-generated `field_key`-only schema (no descriptions, no nullable numerics). pass_rate 0.273.
- `21ce5b11-...` — iteration-kit prompts embedded in the workflow JSON. pass_rate 0.485 on the misaligned 33-sample set.
- **`1b97de43-b06d-44da-a3ae-659340ea255f`** — current canonical run on the **aligned 40-sample dataset** (synth-* renames pushed to cloud via force-resync, +10 manual samples). pass_rate **0.875**, f1.median **0.943**. This is the run referenced everywhere else in this document.

### Iteration kit

The prompt and per-field description text used by this run live as editable artifacts in [`experiments/results/02-mistral-doc-ai-azure/iteration/`](iteration/):

- `prompt.md` — global `document_annotation_prompt` text.
- `field-descriptions.json` — per-field description overlay (keyed by `field_key`).
- `README.md` — how to iterate.

The same files are embedded into [`docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json) as parameters on the `mistralAzureOcr` node. To iterate: edit the iteration files, run [`apps/temporal/src/scripts/iterate-mistral-extraction.ts`](../../../apps/temporal/src/scripts/iterate-mistral-extraction.ts) for a single-document smoke test (~14 s, no benchmark), then re-copy the tuned content into the workflow JSON and re-seed before triggering the full benchmark.

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

## Retrospective — what we learned setting up E02

This is a candid record of the things that surprised us, the workarounds we built, and what should change in the spec / `_shared-rules.md` and downstream experiments so the next one goes smoother.

### Schema-level Foundry quirks that were not in any documentation we found

1. **`json_schema.strict: true` is mandatory on the Foundry route.** Without it, Foundry returns 200 OK, the OCR markdown comes back, but `document_annotation` is silently `null` and `usage_info.pages_processed_annotation` is 0 — i.e. no extraction happens but no error is raised. We chased "annotation gap" symptoms for two runs before finding [Microsoft Q&A 5767943](https://learn.microsoft.com/en-au/answers/questions/5767943/) which spelled it out. The public Mistral OCR API ignores the flag.

2. **`confidence_scores_granularity` is rejected by Foundry with HTTP 422 (`extra_forbidden`).** The public Mistral OCR API accepts it. Same body shape, different acceptance — Foundry's stricter request schema isn't documented as a delta.

3. **Foundry's response shape is a superset of the public API.** It adds `header`, `footer`, `hyperlinks`, `tables` per page, plus a `content_filter_results` Azure RAI hook at the top level. Confidence scores were absent on the deployment we hit, even when requested per the public-API convention.

4. **Numeric fields with `"type": "number"` cannot represent "blank".** Mistral has to return *some* number, so blanks become 0 — the blank-vs-zero distinction is lost. Making each numeric field `["number", "null"]` with strict mode fixed it.

5. **Bare `field_key`s as the only schema signal undersells the engine.** Going from "schema with field_keys only" → "schema with per-field `description` strings + a global `documentAnnotationPrompt`" lifted f1.median from 0.563 to 0.770 on the same data. The extraction quality is gated by how much the engine knows about the form, not by raw OCR capability.

### Operational gotchas that cost us time

6. **The `LocalDatasetSyncService` skips files that already exist on blob storage**, so any *local rename* or *content edit* never propagates to cloud. The benchmark reads from cloud (via the materializer activity), so misaligned ground-truth on disk looked fixed locally but produced unchanged metrics on the next run. We added a `FORCE_RESYNC_LOCAL_DATASETS=true` env-var mode that wipes the dataset prefix before re-uploading.

7. **The `templateModelId` default in the workflow JSON is a stale UUID copied from the public-Mistral template.** The seed creates the SDPR template with id `seed-sdpr-monthly-report-template`, so the copy points at a non-existent record and the activity logs `template_not_found` and skips sending `document_annotation_format` entirely. Easy to miss because OCR markdown still came back fine.

8. **Sync providers don't populate `benchmark_ocr_cache` by default.** The benchmark sample workflow's `persistOcrCache` step looks for `ctx.ocrResponse` specifically; a workflow that only emits `ctx.ocrResult` leaves the cache empty. This breaks fixture capture and the OCR-replay path. We made the activity emit both.

9. **Foundry deployments default to 10 RPM** (per `Requests Per Minute - mistral-document-ai-2512` quota). 33 parallel child workflows with the public-API-style 3-attempt retry policy got blanket-429'd. The fix is provider-specific retry tuning (we landed on 30 attempts × 15 s/1.5x/60 s cap) — *not* a default that fits all engines.

10. **Capacity bumps via `az resource update --set sku.capacity=N` are gated on the per-deployment quota.** Even with a fix-forward retry policy, you can't paper over the bottleneck if you're below the floor. Plan to either request an Azure quota uplift (support ticket) up-front or accept the latency cost and tune the retry policy.

11. **Phone numbers and SINs come back with normalized punctuation.** Mistral re-formats `(575) 115-597` as `575.115.597`. Ground-truth fields keep the original formatting; matching either needs a lenient evaluator (digits-only) or post-processing.

12. **Mistral OCR doesn't return per-word/per-line bbox data.** The brief stated otherwise. Only embedded-image bboxes (`pages[].images[]`) are returned, and only on responses where embedded images are present (rare on form documents). Code that relies on word polygons for downstream layout reasoning will get empty arrays from Mistral. The bbox-fix in the mapper is still correct — it populates polygons when they exist — but they don't exist in production traffic against Mistral.

13. **Mistral's underlying OCR is weaker on dense handwriting** than custom-trained models. The HR0081 series (real handwritten samples) have entire bottom-of-form rows that Mistral's OCR pass doesn't read at all — so no amount of prompt tuning recovers fields like signature/name/SIN/date that aren't in the markdown to begin with. The 10 newly-added `manual sample (*)` files are clean enough that Mistral handles them well (f1 0.86–0.98); the HR0081 cluster is the floor of what Mistral can do.

### Process improvements built into this branch

- **Iteration kit pattern** — [`experiments/results/02-mistral-doc-ai-azure/iteration/`](iteration/) (prompt.md + field-descriptions.json + last-{request,response,diff}). One-shot smoke-test script at [`apps/temporal/src/scripts/iterate-mistral-extraction.ts`](../../../apps/temporal/src/scripts/iterate-mistral-extraction.ts) hits the engine for one sample (~14 s) so prompt tweaks can be validated without burning a 33+ sample run. The same prompt + descriptions are then embedded into the workflow JSON for benchmarks.
- **Force-resync mode** — `FORCE_RESYNC_LOCAL_DATASETS=true` on the backend triggers a wipe-then-reupload of the dataset's blob prefix on next start, so local renames propagate to cloud.
- **Real-fixture deliverable** — the canonical run dumps one sample's full Foundry response into `__fixtures__/experiment-02/` for replay tests; same pattern in E01.

### What should change in `_shared-rules.md` and the spec

These rules were learned the hard way on E02 and should be in the canonical brief before E03 starts:

1. **Add a "production-grade prompt" subsection to checklist item 8 (workflow graph definition).** Bare schemas with field_keys-only are not enough on general-purpose engines; per-field descriptions and a global prompt are part of the deliverable, not a future iteration. Recommend the iteration-kit pattern (prompt.md + field-descriptions.json) as canonical. Document that engine schemas may need flags like `strict: true` (Foundry/OpenAI structured outputs) or equivalent (CU's analyzer config) to make the structured pass actually run.
2. **Add a "schema-flag pre-flight" troubleshooting line to the runbook.** "If `pages_processed_annotation: 0` (or the equivalent on your engine) but the request returned 200 OK, the engine is silently skipping the structured pass — check provider-specific schema strictness flags before debugging anything else."
3. **Expand item 7 (auth & endpoint via env vars).** The brief's "Auth" delta-callout for Foundry should not pre-judge `api-key` vs `Authorization: Bearer`; spell out that the actual header for Mistral on Foundry is `Authorization: Bearer` (matching the public API), and engines may have a stricter request body than their public-API counterpart (the `confidence_scores_granularity` 422 here).
4. **Add a "blank vs zero" callout to item 1 (canonical OCRResult mapping).** Numeric fields' nullability is engine-dependent; default to nullable and document.
5. **Add a "force-resync after dataset edits" pattern.** When local files are renamed/edited, the standard `LocalDatasetSyncService` doesn't propagate. Document the `FORCE_RESYNC_LOCAL_DATASETS=true` env-var workaround under the dev-loop section.
6. **Standardize the iteration folder layout.** Make `experiments/results/<slug>/iteration/{prompt.md, field-descriptions.json, README.md}` part of the per-experiment scaffolding so prompt tuning has a consistent home.
7. **Update item 11 (benchmark integration).** Sync providers must emit a raw-response output port for `benchmark_ocr_cache` to populate (otherwise fixture capture and replay break). Make this mandatory.
8. **Add a "deployment quota check" pre-flight to item 7.** For Foundry/Azure deployments, document the default RPM and the retry-policy tuning required (vs the generic "3 attempts" default). The activity-registry default for `mistralAzureOcr.process` is the canonical example: 30 × 15 s / 1.5x / 60 s cap.
9. **Drop the "bbox" claim from any future Mistral-derivative brief.** Mistral OCR doesn't return per-word/per-line bboxes. The mapper change in this branch is forward-looking but the field is empty in practice; downstream consumers (E05) shouldn't plan on Mistral providing spatial info.
10. **Document the `templateModelId` gotcha.** When forking an existing template (`mistral-standard-ocr-workflow.json` → `experiment-02-...`), the `defaultValue` for `templateModelId` is a stale UUID; replace with the canonical seeded id (`seed-sdpr-monthly-report-template`) or add a "verify defaults" step to the brief.

### Implications for E03 (Azure AI Content Understanding)

E03's brief should bake in the lessons above. Specifically:

- **CU has its own annotator config** (the analyzer JSON is a richer schema than `document_annotation_format`). Apply the same iteration-kit pattern: per-field descriptions + a global instruction. Don't ship with bare field_keys.
- **CU has both content-extraction and generative components.** Each may need its own prompt; treat them as separate tunable surfaces.
- **CU is also Foundry-deployed** — same quota model. Build the retry policy in from the start (30 × 15 s / 1.5x / 60 s cap is a reasonable starting point) and request a quota uplift up-front if the dataset is bigger than ~30 samples.
- **CU likely has its own "annotation silently skipped" failure mode.** Pre-flight check: after the first benchmark run, inspect ONE cached response to confirm the structured pass actually ran (look at usage counters / `documents` length). If something looks empty, search MSFT Q&A for the analyzer-config strictness flag — there will be one.
- **Use `FORCE_RESYNC_LOCAL_DATASETS=true` after any local dataset edits** before triggering CU's first benchmark. The materialized cache is also worth clearing (`rm -rf /tmp/benchmark-cache/<datasetId>-*`).
- **Reuse the iteration kit pattern.** Copy `experiments/results/02-mistral-doc-ai-azure/iteration/` to `experiments/results/03-content-understanding/iteration/` as a starting point, edit prompt.md / field-descriptions.json for CU's idioms, smoke-test on `synth-full (1)` (~14 s per call), only then trigger the full benchmark.
- **Plan for nullable numerics.** CU may need its own equivalent of `numericFieldsNullable` or it may default-handle blanks correctly — confirm against one sample before running 33+.
- **Plan for cost / sample.** Foundry deployments bill per-request; running multiple 33-sample iterations during prompt tuning compounds. The single-sample iteration script is the cheap loop; bulk runs are for baseline + final.
- **Don't trust the brief's preamble on engine response shape until you've inspected one real response.** Capture a fixture early. The "Mistral returns per-word bboxes" claim in E02's brief was wrong; equivalent wrong claims may exist in E03's preamble too.
