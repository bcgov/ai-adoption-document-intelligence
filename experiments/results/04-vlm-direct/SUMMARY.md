# E04 — VLM-direct (gpt-5.4) — Results

**Branch**: `experiment/04-vlm-direct` (chained on `experiment/03-content-understanding`)
**Resource**: `strukalex-8338-resource` (Foundry, eastus2). Model deployment: `gpt-5.4` GlobalStandard cap 100 (= 100K TPM)
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-04-vlm-direct-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-04-vlm-direct-workflow.json)
**Provider doc**: [`docs-md/graph-workflows/04-vlm-direct-OCR.md`](../../../docs-md/graph-workflows/04-vlm-direct-OCR.md)
**Dataset**: `seed-local-samples-mix-private-v1` (40 samples)
**Azure OpenAI API version**: `2024-12-01-preview`

## Scope

Per the user's reduction at session start, E04 implements only **variant 1 (single-pass)** with **gpt-5.4 only** — not the brief's full 3-variant × 2-model matrix. The workflow JSON, provider, tests, iteration kit, and benchmark are all single-variant, single-model. Variants 2 (chain-of-thought) and 3 (self-consistency) and the gpt-4o / gpt-5 / gpt-5.5 axes are deferred.

## What VLM-direct is

A pure VLM extraction path. The activity:

1. Reads the document image as base64.
2. Loads the SDPR template's `field_schema` from the DB.
3. Builds a strict-mode JSON Schema from the schema rows (one property per `field_key` with the right type), plus a sibling `source_quotes` object with one string per field.
4. Sends `messages = [system, user(text + image)]` to the chat-completions endpoint with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
5. Parses `choices[0].message.content` as JSON (strict mode guarantees schema conformance) and maps to canonical `OCRResult`.

No OCR pre-pass. The model's vision encoder reads the image directly.

## Endpoint, auth, request/response shape

| | Azure OpenAI chat completions | This experiment |
|---|---|---|
| Base URL | `https://<resource>.cognitiveservices.azure.com/openai/...` | E04 uses `https://strukalex-8338-resource.cognitiveservices.azure.com/openai/...` (same resource hosting CU) |
| API version | `2024-12-01-preview` (or newer) | same; required for `response_format.json_schema` strict mode |
| Auth | `api-key: <key>` header | same |
| Request | `POST /openai/deployments/{deployment}/chat/completions` | `deployment = gpt-5.4` |
| Vision input | `messages[].content[]` items: `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }` | inline base64 (no public-URL upload) |
| Structured output | `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` | strict mode required |

Response shape (parsed):

```jsonc
{
  "fields": {
    "<field_key>": <value>,           // string | number | null per schema
    ...
  },
  "source_quotes": {
    "<field_key>": "<verbatim quote>" // string; "" if not located on the form
  }
}
```

## Vocabulary mapping deployed

| Our `FieldType` | JSON Schema property | Notes |
|---|---|---|
| `string` | `{ "type": "string" }` | optional `description` overlay |
| `number` | `{ "type": ["number", "null"] }` | always nullable so the prompt's blank-vs-zero rule survives |
| `date` | `{ "type": "string" }` | ISO date, "" if blank |
| `selectionMark` | `{ "type": "string", "enum": ["selected","unselected"] }` | enums are strict-mode-compatible |
| `signature` | `{ "type": "string" }` | VLM has no signature primitive — extracted verbatim |

## Iteration kit

Pattern lifted from E03. Editable artifacts at
[`experiments/results/04-vlm-direct/iteration/`](iteration/):

- `prompt.md` — global instruction text (system message preamble).
- `field-descriptions.json` — per-field description overlay (keyed by `field_key`).
- `README.md` — how to iterate.

Smoke-test script at
[`apps/temporal/src/scripts/iterate-vlm-extraction.ts`](../../../apps/temporal/src/scripts/iterate-vlm-extraction.ts)
calls the chosen Azure OpenAI deployment for one sample (~22-25 s round trip), compares predicted vs ground truth, and writes `last-{request,response,diff}.{json,md}`.

When the prompts are good, the same files are embedded into the workflow JSON's `vlmDirect.extract` activity `parameters` (`documentAnnotationPrompt`, `fieldDescriptions`, `numericFieldsNullable: true`).

Iteration on `synth-full (1)` plateaued at **70.3% per-field strict-equality accuracy** (52/74 fields exactly matched ground truth) over three iterations. Targeted improvements that helped:

- **Comma-as-thousands rule** — fixed `8,641` → `8.641` decimal-confusion errors on synth samples.
- **Phone format preservation** — minor effect; gpt-5.4 sometimes drops parens regardless.
- Other prompt tweaks (digit-care exhortation, checkbox visual inspection paragraph) did not move the metric, suggesting the residual errors are vision-encoder-level OCR limitations, not prompt-engineering ones.

The 70.3% iteration metric turned out to be **pessimistic vs the benchmark metric** — the per-field strict-equality test doesn't credit close-but-not-exact matches that the benchmark's fuzzy-0.85 evaluator accepts. The same sample scored ~0.95+ F1 on the canonical run.

## Real-API benchmark run

| field | value |
|---|---|
| Run id | `d5db8a69-c802-49c1-9b71-492586d459fd` |
| Definition | `seed-experiment-04-vlm-direct-definition` |
| Tag | `experiment: 04-vlm-direct` |
| Status | `completed` |
| Wallclock | **~232 s (3 min 52 s)** for 40 samples (~5.8 s/sample wallclock; faster than E03's 22 s/sample because VLM-direct skips CU's content-extraction layer) |
| Evaluator | `schema-aware` (default rule fuzzy@0.85; pass threshold 0.8) |
| Dataset | 40 samples (21 real HR + 9 synth-* aligned + 10 manual handwriting) |
| Workflow params | `documentAnnotationPrompt` (~2.6 KB), `fieldDescriptions` (74 fields), `numericFieldsNullable: true` — embedded in the workflow JSON's `vlmDirectExtract` node |
| Per-sample timeout | 3600 s (the TS trigger script's default; mirrors E03 since gpt-5.x latency is similar) |

Aggregated metrics ([`experiments/results/04-vlm-direct/benchmark-run.json`](benchmark-run.json)):

| metric | value |
|---|---|
| `pass_rate` | **0.925** (37/40 cleared the 0.8 schema-aware threshold) |
| `f1.mean` | 0.911 |
| `f1.median` | **0.943** |
| `f1.max` | 1.000 |
| `f1.min` | 0.739 |
| `f1.stdDev` | 0.069 |
| `precision.mean` | **0.972** |
| `precision.median` | 1.000 |
| `recall.mean` | 0.864 |
| `recall.median` | 0.899 |
| `matchedFields.median` | **66** (of 74 in schema) |
| `matchedFields.min` | 32 |
| `falsePositives.mean` | 1.25 |
| `falsePositives.max` | 10 |
| `truePositives.median` | 66 |

### Comparison vs E01–E03

E01 ran on the original 33-sample dataset before the synth-* alignment fix; E02–E04 ran on the corrected 40-sample dataset.

| | E01 (33s, Neural DI) | E02 (40s, Mistral on Foundry) | E03 (40s, Azure CU + gpt-5.2) | **E04 (40s, gpt-5.4 VLM-direct)** |
|---|---|---|---|---|
| `pass_rate` | 0.515 | 0.875 | **0.95** | 0.925 |
| `f1.median` | 0.806 | 0.943 | **0.965** | 0.943 |
| `f1.mean` | 0.683 | 0.907 | **0.927** | 0.911 |
| `precision.mean` | 0.899 | 0.975 | **0.975** | 0.972 |
| `recall.mean` | 0.587 | 0.864 | **0.903** | 0.864 |
| `matchedFields.median` | 50 (of 74) | 66 (of 74) | **69 (of 74)** | 66 (of 74) |
| `falsePositives.mean` | 0 | 1.25 | 1.25 | 1.25 |
| Wallclock / sample | ~2.5 s | ~7.3 s | ~22 s | **~5.8 s** |

E04 is roughly tied with E02 on accuracy (`f1.median` 0.943 = 0.943; matchedFields.median 66 = 66) and slightly behind E03 (`f1.median` 0.943 vs 0.965; matchedFields.median 66 vs 69, recall.mean 0.864 vs 0.903). Precision is tied across the top three (~0.97). The 3 failing samples are the same kind of edge cases: blank/obscured forms (`81 coffee` blackout, `81 blank`-style empties) and one synth sample.

E04's headline finding: **a single vision call can compete with a two-stage OCR + generative pipeline on this dataset.** The accuracy gap to CU is ~2 pp on f1 and ~3 of 74 fields on matchedFields — not nothing, but smaller than the iteration result on synth-full(1) suggested.

The latency story flips: **E04 is ~3.8× faster per sample than E03** (5.8 s vs 22 s) because VLM-direct skips CU's content-extraction layer and runs the generative model once instead of after OCR. For workloads where CU's extra recall isn't worth the extra latency / per-page billing, VLM-direct is a genuine alternative.

### Per-sample breakdown

`f1` distribution buckets across the 40 samples:

- **19 samples ≥ 0.95** — `2 81` (1.000), `3 81` (1.000), `Fake 1` (0.986), `HR0081 (2)` (0.979), `manual sample (10)` (0.972), `manual sample (4)` (0.965), and 13 others.
- **12 samples 0.85–0.95** — most of the synth-* set + several real HR forms.
- **9 samples 0.70–0.85** — including 3 failing samples (below 0.8 pass threshold): `81 coffee` (0.739), `synth-no-spouse (1)` (0.762), `synth-regular (2)` (0.776).
- **0 samples < 0.70** — every sample produces a usable extraction at the bucket level.

The failure modes match what iteration revealed:

- **Numeric digit misreads** (3-digit vs 4-digit ambiguity, single-digit confusion `9↔4`, `8↔3`, `5↔6`) — gpt-5.4's vision encoder operates at a lower effective resolution than CU's dedicated OCR layer.
- **Spouse-row checkbox confusion** — gpt-5.4 sometimes mis-attributes spouse-column checkbox marks vs applicant-column. The model writes a `source_quote` that matches its (wrong) answer, so the evidence-based confidence guard does not catch this — see "Confidence semantics" below.
- **Handwriting edge cases** (`81 coffee`) — same as E02/E03; the dataset's "obscured" samples challenge every engine.

## Confidence semantics

Chat-completions does not return per-field confidence natively. The mapper synthesises:

- **0.95** when `source_quotes[field_key]` is non-empty after `.trim()` (the model produced supporting evidence for its answer).
- **0.50** when the source_quote is empty / whitespace-only (no evidence; the field's value is at risk of fabrication).

Page-level confidence is the mean of per-field confidences, so the default 0.95 threshold in `ocr.checkConfidence` fires when the unevidenced fraction of the page is large enough to drag the mean below 0.95.

**Empirical observation (potentially significant):** on the canonical run, gpt-5.4 produced a non-empty `source_quote` for **every** populated field, including ones it got wrong. The model writes the quote that matches its own answer, not necessarily what's actually on the form. So `source_quote` presence is a weak hallucination guard — it would catch total fabrication (where the model returns a value with no quote at all) but does not catch confident OCR misreads. The bimodal 0.95/0.50 distribution means the page-level mean lives near 0.95 in practice and the HITL gate fires rarely.

A stronger confidence signal would require token-logprob-based confidence (not exposed through the chat-completions structured-output path on this API version) or a self-consistency variant (E04's deferred variant 3). Documented but not addressed here.

## What the implementation delivers

- **New provider folder** `apps/temporal/src/ocr-providers/vlm-direct/`:
  - `vlm-types.ts` — TypeScript types for the parsed `{ fields, source_quotes }` payload + the wrapped `VlmDirectRawResponse` we persist in `benchmark_ocr_cache`.
  - `vlm-prompt-builder.ts` — `FieldDefinition[]` → strict-mode JSON Schema + system/user messages.
  - `vlm-direct-extract.ts` — the chat-completions activity (PDF guard, env-var resolution, blob read, image base64, call, parse, map).
  - `vlm-to-ocr-result.ts` — VLM payload → canonical `OCRResult` (with evidence-based confidence synthesis).
- **Activity registered** as `vlmDirect.extract` in all three registries (runtime function, workflow-safe constant, backend allow-list). Retry policy: 30 attempts × 15 s × 1.5x × 60 s cap, mirroring CU + Mistral on Foundry.
- **Workflow template** at `docs-md/graph-workflows/templates/experiment-04-vlm-direct-workflow.json` — sync chain (`prepareFileData → vlmDirectExtract → cleanup → checkConfidence → reviewSwitch → humanReview/storeResults`). Auto-discovered by `seedExperimentWorkflows()`. `templateModelId` defaults to `seed-sdpr-monthly-report-template`. `azureOpenAiDeployment` defaults to `gpt-5.4`.
- **Sync-provider cache emission** — the activity returns `{ ocrResult, ocrResponse }`; the workflow declares `ocrResponse` in `ctx` and adds the second `outputs` mapping, so `benchmark-sample-workflow.ts`'s `persistOcrCache` step writes a row to `benchmark_ocr_cache` per sample. Verified end-to-end: 40 cache rows for the canonical run (matches `total_samples`).
- **Provider doc** at `docs-md/graph-workflows/04-vlm-direct-OCR.md` covers endpoint shape, strict-mode schema we send, vocabulary mapping, source_quotes hallucination guard, confidence + bbox notes, env vars, and the iteration kit.

## Tests

[`apps/temporal/src/experiment-04-vlm-direct.test.ts`](../../../apps/temporal/src/experiment-04-vlm-direct.test.ts):

**Static (16 tests, no Temporal):** template metadata + scope rules (uses `vlmDirect.extract`, no Mistral / Azure DI / CU activities; no LLM enrichment; no pollUntil; no `pdf.renderToImages`) + chain wiring (sync-shape order) + retry shape (≥ 20 attempts; matches Foundry quota mode) + ctx wiring (incl. `ocrResult` AND `ocrResponse`, plus `azureOpenAiDeployment` ctx default) + parameter shape on the extract node + graph-schema validation.

**Fixture-aware (4 tests):** asserts the captured VLM response is well-formed, the structured-field pass actually ran (≥ 70 of 74 keys present per strict mode), the mapper turns it into a usable `OCRResult`, and source_quotes evidence rate is significant.

**Runtime (2 tests against local dev-stack Temporal at `localhost:7233`):** high-confidence sample skips humanReview; low-confidence sample routes through humanReview + `humanApproval` signal. Both replay the captured VLM fixture through mocked activities. CI-gated and fixture-gated.

Plus 16 unit tests in [`apps/temporal/src/ocr-providers/vlm-direct/vlm-prompt-builder.test.ts`](../../../apps/temporal/src/ocr-providers/vlm-direct/vlm-prompt-builder.test.ts) (vocabulary mapping, strict-mode shape, descriptions overlay, nullable-numeric hint, schema-name pattern, deterministic hash) and 16 in [`vlm-to-ocr-result.test.ts`](../../../apps/temporal/src/ocr-providers/vlm-direct/vlm-to-ocr-result.test.ts) (per-type mapping, evidence-based confidence, page synthesis, no-fieldDefs fallback).

`cd apps/temporal && CI=true npx jest src/experiment-04-vlm-direct.test.ts src/ocr-providers/vlm-direct/`

## Smoke-test helper

[`apps/temporal/src/scripts/iterate-vlm-extraction.ts`](../../../apps/temporal/src/scripts/iterate-vlm-extraction.ts) builds the JSON Schema from the iteration kit, sends one sample to the chosen Azure OpenAI deployment, and writes a per-field diff.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-vlm-extraction.ts "synth-full (1)" gpt-5.4
```

## Pre-flight helper

[`apps/temporal/src/scripts/preflight-vlm.ts`](../../../apps/temporal/src/scripts/preflight-vlm.ts) asserts every precondition needed before the first paid call: env vars, deployment reachability + vision capability + strict-mode round-trip on a 1×1 PNG, dataset registration, and the seeded SDPR template's `field_schema`. Exits non-zero on any failure.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/preflight-vlm.ts gpt-5.4
```

## Gaps (out-of-scope or deferred)

- **PDF support** — the activity throws on `fileType === "pdf"`. The canonical 40-sample dataset is 100% JPEG; PDF rendering (`pdf.renderToImages` activity + render node before `vlmDirect.extract`) is a single follow-up addition, deferred until a workload requires it (or until E05's hybrid pulls it in).
- **Variant 2 (chain-of-thought)** and **Variant 3 (self-consistency)** — out-of-scope per the user's session-start scope reduction.
- **gpt-4o, gpt-5, gpt-5.5 axes** — out-of-scope for the same reason. The activity already accepts `azureOpenAiDeployment` as a workflow parameter, so adding a second variant is a workflow-JSON-only change once the credentials for those deployments are wired up. (Note: E04's env file flips `AZURE_OPENAI_ENDPOINT` from westus → eastus2; running against gpt-4o/gpt-5 would require flipping back or threading endpoint+key through workflow params.)
- **Hallucination guard upgrade** — `source_quotes` non-empty is a weak signal because gpt-5.4 emits a quote even for wrong answers (see "Confidence semantics"). A token-logprob-based confidence or a self-consistency variant would be stronger, but both are out-of-scope.
- **Cost telemetry** — the activity logs `usage.{prompt_tokens, completion_tokens, total_tokens}` per call but the run's `metrics` JSON does not yet aggregate cost. Cross-engine cost normalisation is deferred to the post-E05 follow-up.
- **Confidence-threshold recalibration** — the bimodal 0.95/0.50 evidence-based confidence is structurally different from CU's per-field native confidence. The default 0.95 threshold in `ocr.checkConfidence` will rarely fire on E04 because gpt-5.4 quotes liberally. Re-calibrating per-engine is a workflow-template change.

## Parent-shared infra fixes applied

None. E03's stack of fixes (sync-provider cache emission convention, `runtimeSettingsOverride` trigger, `poll-experiment-run.ts` helper, env-loading order for `TEST_API_KEY`, idempotent deploy pattern, iteration kit standard) all apply unchanged. The `cuResponse → ocrResponse` rename E03 codified means E04's activity got the cache-emission convention right on the first try (zero cache rows would have been a silent bug; we explicitly verified 40/40).

## Reproducing this run

```bash
# 1. (One-time, Azure-side) deploy gpt-5.4 on the Foundry resource.
az cognitiveservices account deployment create \
  --resource-group rg-strukalex-8338 --name strukalex-8338-resource \
  --deployment-name gpt-5.4 --model-name gpt-5.4 --model-version 2026-03-05 \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 100

# 2. Update ~/.config/bcgov-di/temporal.env to point Azure OpenAI at the
#    eastus2 resource (where gpt-5.4 lives):
#       AZURE_OPENAI_ENDPOINT=https://strukalex-8338-resource.cognitiveservices.azure.com
#       AZURE_OPENAI_API_KEY=<key for strukalex-8338-resource>
#       AZURE_OPENAI_DEPLOYMENT=gpt-5.4
#       AZURE_OPENAI_API_VERSION=2024-12-01-preview

# 3. Restart the Temporal worker so it picks up the new env values:
cd apps/temporal && npm run dev

# 4. Run preflight to verify every precondition.
cd apps/temporal && npx tsx -r tsconfig-paths/register src/scripts/preflight-vlm.ts gpt-5.4

# 5. (Optional) iterate prompts on synth-full (1).
npx tsx -r tsconfig-paths/register src/scripts/iterate-vlm-extraction.ts "synth-full (1)" gpt-5.4
# Edit experiments/results/04-vlm-direct/iteration/{prompt.md,field-descriptions.json}
# and re-run; ~22 s per iteration.

# 6. Once happy, copy prompt + descriptions into the workflow JSON's
#    vlmDirect.extract `parameters` and re-seed:
cd ../.. && npm run test:db:reset

# 7. Trigger the run via the TS wrapper.
cd apps/temporal && npx tsx -r tsconfig-paths/register src/scripts/trigger-experiment-benchmark.ts 04

# 8. Poll until terminal; the helper saves the export automatically.
npx tsx -r tsconfig-paths/register src/scripts/poll-experiment-run.ts <runId> 04-vlm-direct

# 9. Capture the VLM fixture (any sample id; "1 81" is the canonical one).
docker exec ai-doc-intelligence-postgres psql -U postgres -d ai_doc_intelligence -t -A \
  -c "SELECT \"ocrResponse\"::text FROM benchmark_ocr_cache WHERE \"sourceRunId\" = '<runId>' AND \"sampleId\" = '1 81';" \
  | python3 -m json.tool \
  > apps/temporal/src/__fixtures__/experiment-04/vlm-response-1-81.json
```

## Retrospective — what we learned setting up E04

Candid record of the surprises and patterns that worked / didn't.

### Surprises

1. **gpt-5.4 vision is competitive with CU on benchmark metrics, despite poor iteration accuracy.** Iteration on `synth-full (1)` plateaued at 70.3% per-field strict-equality accuracy — this looked grim. The actual benchmark f1.median is 0.943 (matches E02; 2 pp behind E03). The iteration metric was overly strict: the benchmark's `schema-aware` evaluator with fuzzy@0.85 matching credits close-but-not-exact values (e.g. `2326.4` vs `2326.47`) that strict equality drops. Conclusion: **don't gate progression to the benchmark on per-field strict accuracy on a single sample.** Run the iteration to verify the model is plumbed correctly + producing structured output, then trigger the benchmark for the real signal. Saved a lot of unnecessary prompt iteration once we accepted this.
2. **OpenAI strict-mode requires every field in `required` AND `additionalProperties: false`.** Initially mis-shaped the schema with optional properties; first call returned a 200 but the response had missing fields. The fix is mechanical: list every key in `required` and add `additionalProperties: false` on every object. The error message from OpenAI's validator is "schema not strict-compatible," not "field missing," so the failure mode is silent in the eyes of the application code — it just gets back fields it didn't ask for or fewer fields than expected. **Static tests for "every property is in required" + "additionalProperties is false" caught this; both should be in the canonical brief for any future structured-output engine.**
3. **Content-filter rejection on a probe-style prompt.** Our first preflight probe used "You are a JSON-emitting probe. Reply exactly per schema. Set ok=true. Empty quote." — gpt-5.4 returned 400 with `jailbreak.detected: true`. Rephrasing to a natural "describe the image in one sentence" with a `description` field passed immediately. Lesson: **probe prompts that look like instruction-injection get filtered.** Use a benign, descriptive prompt for the preflight round-trip.
4. **`source_quotes` is a useful structural signal but a weak hallucination signal.** Every field came back with a non-empty quote on the canonical run, including the wrong-value fields. The model writes the quote that matches its own answer; it doesn't audit itself. So `source_quotes` is great for verifying strict-mode is on (a sibling required key with type=string is a tight static contract) but does not catch confident OCR misreads. The mapper's bimodal 0.95/0.50 confidence based on quote presence reflects this — useful for catching catastrophic failure modes (no quote = no answer) but not for catching the actual mistakes gpt-5.4 makes.
5. **Default capacity-100 + the Foundry retry policy is enough for 40 samples without throttling.** No 429s observed in the canonical run. Wallclock was 3:52 for 40 samples — gpt-5.4 itself took ~5.8 s/sample — well within the 100K TPM cap given ~10K input tokens/call. The 30-attempt × 15 s × 1.5x retry shape inherited from E03 was untouched but unused. The retry shape is still the right default for E05's hybrid where multi-engine fan-out can re-introduce bursts.

### What worked

6. **Iteration kit copy from E03 — instant 70.3% baseline.** The SDPR-form quirks (column conventions, blank-vs-zero, signature-vs-name, etc.) port verbatim from CU to VLM-direct because they describe the form, not the engine. Only the schema wrapper changes (CU's analyzer schema → OpenAI's `response_format.json_schema`). Confirms the meta-process lesson from E03: future experiments should always start by `cp -r ../<previous>/iteration ../<current>/iteration`.
7. **Preflight script as a runnable preflight (not a checklist) saved real time.** The session hit two preflight failures (env-var name `AZURE_OPENAI_KEY` vs `AZURE_OPENAI_API_KEY`; westus endpoint vs eastus2 deployment) that would have surfaced as runtime errors during iteration. Both were caught and fixed in the preflight phase before any paid calls. **Future experiments: always write `preflight-<engine>.ts` first.**
8. **Sync-provider cache emission convention worked silently this time.** The activity returns `{ ocrResult, ocrResponse }`; the workflow has both `ocrResult` and `ocrResponse` ports + ctx keys; `persistOcrCache` writes a row per sample. Verified end-to-end: 40 cache rows for 40 samples. E03's `cuResponse → ocrResponse` rename gave us the convention; E04 inherited it and didn't trip the silent-empty-cache bug.
9. **TS-based trigger + poll scripts are now stable across engines.** `trigger-experiment-benchmark.ts` accepts `04` as the slug prefix and routes to `seed-experiment-04-vlm-direct-definition` automatically. `poll-experiment-run.ts` saved the export to `experiments/results/04-vlm-direct/benchmark-run.json` without per-experiment wiring. **Don't fork these scripts per experiment** — they're generic.

### What didn't work

10. **Aggressive prompt iteration past iteration #1 didn't help.** Three iterations on `synth-full (1)` produced 67.6% → 64.9% → 70.3%, suggesting non-determinism dominates over prompt tweaks at this scale. The targeted comma-thousands rule helped 2 fields; everything else (digit-care exhortation, checkbox visual inspection paragraph, date format reminder) was either neutral or regressed. **Don't iterate beyond 3 rounds without a clearly identifiable systematic error.** Burning calls on noise is the failure mode here.
11. **Phone-format preservation prompt instruction did not survive the model.** The form shows `(227) 837-843`; gpt-5.4 returned `227 837 843` in 100% of iterations despite explicit instruction to preserve formatting. Likely the vision encoder doesn't reliably see the parens at its operating resolution. Format normalization must happen post-hoc (in `ocr.normalizeFields` or a per-engine cleanup step) — not via prompt for VLM-direct.

## Implications for E05 (VLM + OCR hybrid)

E05 should pull in:

- **VLM-direct as one branch** of the hybrid — already implemented here as `vlmDirect.extract`. Reusable as-is.
- **OCR pre-pass for spatial layout signals** — the dedicated OCR layer (CU's content-extraction or Azure DI) provides per-word polygons and a markdown layout dump that gpt-5.4 vision lacks. Feeding that as auxiliary text alongside the image (the brief calls this "layout-aware VLM") may close the 2 pp gap on f1.median vs CU.
- **Confidence calibration** — both E03 (CU's native confidence) and E04 (evidence-based 0.95/0.50) produce signals, but they're scaled differently. E05 will need a per-branch threshold or a unified confidence-scoring activity to make the HITL gate fire consistently.

A couple of things E04 surfaced that should change in `_shared-rules.md` before E05:

12. **Iteration metric vs benchmark metric divergence.** The brief currently says "iterate to ≥95% per-field accuracy" (strict equality, single sample) before triggering. For VLM-direct that target was unachievable but the benchmark result was good. Add a note: "if the iteration metric plateaus below the gate but the structured-output is being produced cleanly, trigger the benchmark — the schema-aware evaluator may be more forgiving than strict equality."
13. **Probe prompts must be benign.** The preflight probe is the first paid call any experiment makes. Use `"describe the image in one sentence"` not `"reply exactly per schema"` — the latter trips Azure's content-management filter on `gpt-5.x` deployments. Already updated in `preflight-vlm.ts`; suggest adding to the canonical preflight pattern in `_shared-rules.md`.
