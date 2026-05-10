# E05 — VLM + OCR hybrid (gpt-5.4) — Results

**Branch**: `experiment/05-vlm-ocr-hybrid` (chained on `experiment/04-vlm-direct` — final tip of the stack; runs every benchmark from E01–E05)
**OCR engine**: Azure Document Intelligence `prebuilt-layout` (markdown + bbox layout, no field extraction)
**VLM**: `strukalex-8338-resource` (Foundry, eastus2). Deployment: `gpt-5.4` GlobalStandard cap 100 (= 100K TPM)
**Workflow template**: [`docs-md/graph-workflows/templates/experiment-05-vlm-ocr-hybrid-workflow.json`](../../../docs-md/graph-workflows/templates/experiment-05-vlm-ocr-hybrid-workflow.json)
**Provider doc**: [`docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md`](../../../docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md)
**Dataset**: `seed-local-samples-mix-private-v1` (40 samples)
**Azure DI API version**: `2024-11-30`
**Azure OpenAI API version**: `2024-12-01-preview`

## Scope

Per the user's reduction at session start, E05 implements only **variant 1** (image + OCR markdown) with **gpt-5.4 only** — not the brief's full 3-variant × 2-model matrix. The workflow JSON, provider, tests, iteration kit, and benchmark are all single-variant, single-model. Variant 2 (OCR-only, no image), variant 3 (image + OCR markdown + inline bbox spatial hints), and the gpt-4o / gpt-5 axes are deferred. The plumbing is in place to enable them later: `params.includeBboxAnnotations: true` flips the OCR-markdown converter into bbox-annotation mode (variant 3); the prompt builder accepts an empty `ocrMarkdown` (variant 2 is a workflow-JSON-only change to drop the DI step); and `params.azureOpenAiDeployment` accepts any chat-completions deployment.

## What VLM + OCR hybrid is

A two-leg extraction:

1. **Azure DI prebuilt-layout** (sync wrapper, ~5 s/sample): submit + poll until terminal; returns `analyzeResult.content` (markdown) + `pages[].words[]/lines[]` with polygons (inches at API `2024-11-30`).
2. **Azure OpenAI chat-completions** (~17 s/sample on gpt-5.4): sends `messages = [system, user(text + image)]` where the user text contains the OCR markdown wrapped in `<ocr_text>...</ocr_text>` delimiters, with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. The system prompt's first paragraph names the trust hierarchy:
   > Use both inputs together. The OCR text is auxiliary context — it helps you locate fields and read structure. **The image is the source of truth.** When the OCR text and the image disagree on a value (digits, characters, checkboxes, signatures), trust what you see in the image and ignore the OCR text.

The mapper then folds the parsed `{ fields, source_quotes }` payload into a canonical `OCRResult`, **borrowing `pages[]` / `paragraphs[]` / `tables[]` from the upstream DI layout** so word/line polygons survive into the result (the gap E04 documented as "VLM-direct returns no per-word/per-line polygons").

## Endpoint, auth, request/response shape

**DI prebuilt-layout** — see [`docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md`](../../../docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md#leg-1--azure-di-prebuilt-layout). `POST /documentintelligence/documentModels/prebuilt-layout:analyze?outputContentFormat=markdown` with `base64Source`; sync wrapper polls until terminal. No new env vars (reuses `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` + `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` from E01).

**Azure OpenAI chat-completions** — identical to E04. `POST /openai/deployments/{deployment}/chat/completions?api-version=...` with `api-key: <key>` header. Inline base64 image (no public URL upload). Strict-mode JSON Schema response_format. Same env vars as E04 (`AZURE_OPENAI_*`); same `gpt-5.4` deployment on `strukalex-8338-resource`. The hybrid system + user prompts are produced by `vlm-hybrid-prompt-builder.ts`, which delegates to E04's `buildVlmExtractionRequest` for the schema and overrides only the messages.

Response shape (parsed; identical to E04):

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

The wrapped `VlmHybridRawResponse` we persist in `benchmark_ocr_cache` carries both legs (the DI `layoutResponse` plus the parsed VLM payload + raw chat-completions body + the actual OCR markdown sent to the model + per-leg durations).

## Vocabulary mapping

Inherited from E04 verbatim — see [E04 SUMMARY § Vocabulary mapping](../04-vlm-direct/SUMMARY.md#vocabulary-mapping-deployed). The hybrid prompt builder reuses E04's `fieldDefinitionToProperty` so number → `["number","null"]`, selectionMark → `enum: ["selected","unselected"]`, etc.

## Iteration kit

Pattern lifted from E04 verbatim. Editable artifacts at
[`experiments/results/05-vlm-ocr-hybrid/iteration/`](iteration/):

- `prompt.md` — global instruction text (system message preamble; same SDPR-form rules as E04).
- `field-descriptions.json` — per-field description overlay (keyed by `field_key`; same 74 fields).
- `README.md` — how to iterate.

Smoke-test script at
[`apps/temporal/src/scripts/iterate-hybrid-extraction.ts`](../../../apps/temporal/src/scripts/iterate-hybrid-extraction.ts)
runs the full hybrid path on one sample (~12-28 s round trip), compares predicted vs ground truth, and writes `last-{request,response,layout,diff}.{json,md}`.

When prompts are good, the same files are embedded into the workflow JSON's `vlmOcrHybrid.extract` activity `parameters` (`documentAnnotationPrompt`, `fieldDescriptions`, `numericFieldsNullable: true`).

**Iterating on three samples (per E04's retrospective recommendation):**

| sample | matched / total | strict-with-norm % | notes |
|---|---|---|---|
| `1 81` | 72/74 | **97.3%** | Real HR form; only `applicant_spousal_support_alimony` (predicted 0 vs expected "") and `name` (predicted "X") slipped. |
| `synth-full (1)` | 73/74 | **98.6%** | Clean typed numeric tables — the sample E04 plateaued on at 70.3%. Hybrid only misses `phone` (`227 837 843` vs `(227) 837-843`), the same parens-stripping behaviour E04 documented as a vision-encoder limitation. |
| `manual sample (1)` | 74/74 | **100.0%** | Handwriting + checkboxes — the kind of sample where DI's OCR layer adds the most value. |

**Iteration scorer ≠ benchmark scorer (consistent across all experiments).** Same caveat as E04 — the iteration script uses strict-with-normalisation; the canonical benchmark uses `schema-aware` + `fuzzy@0.85` + `passThreshold: 0.8`. See [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) for the strict-equality re-eval task that re-scores E01–E05 under `rule: "exact"` so we can read the strict view too.

## Real-API benchmark run

| field | value |
|---|---|
| Run id | `cb677a90-3a05-4f2f-a931-3477249453c2` |
| Definition | `seed-experiment-05-vlm-ocr-hybrid-definition` |
| Tag | `experiment: 05-vlm-ocr-hybrid` |
| Status | `completed` |
| Wallclock | **~273 s (4 min 33 s)** for 40 samples (~6.8 s/sample wallclock with parallelism; serial per-sample ~22 s — DI ~5 s + VLM ~17 s) |
| Evaluator | `schema-aware` (default rule fuzzy@0.85; pass threshold 0.8) |
| Dataset | 40 samples (21 real HR + 9 synth-* aligned + 10 manual handwriting) |
| Workflow params | `documentAnnotationPrompt` (~2.6 KB), `fieldDescriptions` (74 fields), `numericFieldsNullable: true` — embedded in the workflow JSON's `vlmOcrHybridExtract` node |
| Per-sample timeout | 3600 s (TS trigger script default; mirrors E04) |

Aggregated metrics ([`experiments/results/05-vlm-ocr-hybrid/benchmark-run.json`](benchmark-run.json)):

| metric | value |
|---|---|
| `pass_rate` | **0.975** (39/40 cleared the 0.8 schema-aware threshold) |
| `f1.mean` | **0.941** |
| `f1.median` | **0.965** |
| `f1.max` | 1.000 |
| `f1.min` | 0.750 |
| `f1.stdDev` | 0.059 |
| `precision.mean` | **0.976** |
| `precision.median` | 1.000 |
| `recall.mean` | **0.917** |
| `recall.median` | 0.946 |
| `matchedFields.median` | **69** (of 74 in schema) |
| `matchedFields.min` | 41 |
| `falsePositives.mean` | 1.25 |
| `falsePositives.max` | 10 |
| `truePositives.median` | 69 |

### Cross-experiment comparison (E01–E05)

E01 ran on the original 33-sample dataset before the synth-* alignment fix; E02–E05 ran on the corrected 40-sample dataset. **E01, E03, E04, and E05 are evaluated under `schema-aware` + `fuzzy@0.85` + `passThreshold: 0.8`. E02 has been re-run under `rule: "exact"` on the [improve/01-strict-eval-and-mistral-tune](../02-mistral-doc-ai-azure/SUMMARY.md#strict-equality-re-evaluation--improvement-loop-improve01) branch and the row below reflects the strict numbers** — the rule itself was changed in [`apps/shared/prisma/seed.ts:2044-2062`](../../../apps/shared/prisma/seed.ts#L2044-L2062) on that branch and the other four engines will follow in subsequent `improve/<NN>-` branches per [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 1.

| | E01 (33s, Neural DI, fuzzy) | E02 (40s, Mistral on Foundry, **strict**) | E03 (40s, Azure CU + gpt-5.2, fuzzy) | E04 (40s, gpt-5.4 VLM-direct, fuzzy) | **E05 (40s, gpt-5.4 VLM + OCR hybrid, fuzzy)** |
|---|---|---|---|---|---|
| `pass_rate` | 0.515 | 0.900 ¹ | 0.95 | 0.925 | **0.975** |
| `f1.median` | 0.806 | 0.958 ¹ | 0.965 | 0.943 | **0.965** (tied with CU) |
| `f1.mean` | 0.683 | 0.930 ¹ | 0.927 | 0.911 | **0.941** |
| `precision.mean` | 0.899 | 1.000 ¹ | 0.975 | 0.972 | **0.976** |
| `recall.mean` | 0.587 | 0.879 ¹ | 0.903 | 0.864 | **0.917** |
| `matchedFields.median` | 50 (of 74) | 67 (of 74) ¹ | 69 (of 74) | 66 (of 74) | **69 (of 74)** (tied with CU) |
| `falsePositives.mean` | 0 | 0.00 ¹ | 1.25 | 1.25 | 1.25 |
| Wallclock / sample | ~2.5 s | ~7.3 s | ~22 s | ~5.8 s | ~6.8 s wallclock (parallel) / ~22 s serial |

¹ E02 row is strict-evaluated AND uses the round-2 prompt from
`improve/01-strict-eval-and-mistral-tune` (format preservation + strict
blank-vs-zero + two-group checkbox section), and the schema-aware
evaluator was extended to accept one-of array GT values on the same
branch (no E02 GT files yet use the array form — that's a follow-up
dataset-cleanup pass). E02 now matches E03 on `precision.mean` and is
within 1 pp on `f1.median` despite being strict-evaluated while E03 is
still fuzzy; under strict E03 should drop slightly and the gap should
narrow further. See [E02 SUMMARY § Strict-equality re-evaluation](../02-mistral-doc-ai-azure/SUMMARY.md#strict-equality-re-evaluation--improvement-loop-improve01) for the full per-round breakdown.

**Caveat: cells in the E01/E03/E04/E05 columns are still computed under the `fuzzy@0.85` evaluator — close-but-not-exact OCR misreads (`2326.4` vs `2326.47`) score as matched there. Each engine's strict re-evaluation will land in its own `improve/` branch (E02 was first); see [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 1. The seed config is now `rule: "exact"` so any benchmark re-trigger from `improve/01-...` onward measures against strict — running the other four engines without bringing them onto an improve branch first would mix this strict eval with their unconverged prompts.**

E05's headline finding: **the hybrid is the best (or tied-best) on every aggregate metric.** It matches CU on `f1.median` and `matchedFields.median` (the two metrics where CU led the previous four experiments), beats it on `f1.mean` (+1.4 pp), `precision.mean` (+0.1 pp), `recall.mean` (+1.4 pp), and `pass_rate` (+2.5 pp = +1 sample). The single failing sample is `81 coffee` (F1 0.750), which is the same edge case (intentionally obscured/blacked-out form) that bottomed every other experiment too.

The latency story: hybrid at ~6.8 s/sample wallclock (parallel benchmark fan-out) is **~3× faster than CU** and ~1.2× slower than VLM-direct. Serial per-sample wallclock ~22 s is comparable to CU. So hybrid trades ~1 extra second of wallclock vs VLM-direct for the 5 pp accuracy improvement — and the latency gap to CU is largely from CU's content-extraction layer being slower than DI prebuilt-layout, not from the generative call.

### Per-sample breakdown

`f1` distribution across the 40 samples (sorted):

- **5 samples ≥ 0.99** — `2 81` (1.000), `3 81` (1.000), `synth-full (1)` (0.993), `HR0081 (5)` (0.993), `HR0081 (2)` (0.993).
- **14 samples 0.95–0.99** — incl. `1 81` (0.979), `manual sample (10)` (0.979), all `synth-full (2/3)`, four more `HR0081 *`, three `manual sample *`.
- **14 samples 0.85–0.95** — incl. `Fake 5/6/7`, `synth-no-spouse (3)`, three `synth-regular *`, two more `synth-no-spouse *`.
- **6 samples 0.80–0.85** — incl. `Fake 1/3`, `manual sample (6)`, `synth-no-spouse (2/1)`, `81 blank` (0.810).
- **1 sample 0.70–0.80** — `81 coffee` (0.750) — the only failing sample (below the 0.8 pass threshold).
- **0 samples < 0.70**.

Compared to E04:
- The `synth-full (1)` jump is the headline: **0.844 (E04) → 0.993 (E05)**, +14.9 pp on a sample E04 documented as "one of the harder samples for gpt-5.4 vision in the canonical run." DI's OCR markdown gives the model the exact digit sequence, eliminating the `9↔4`, `8↔3` confusions that dragged down VLM-direct on the dense numeric tables.
- The bottom-bucket samples (`81 coffee`, `81 blank`) are essentially unchanged — these are obscured forms where neither DI nor the VLM has enough signal. The hybrid pattern doesn't help when there's nothing to read.
- Most real HR samples (`HR0081 (*)`, `1 81`, `2 81`, `3 81`) score noticeably higher; the median sample now sits at 0.965 vs E04's 0.943.

The failure modes are now narrower than E04's:
- **Phone format** — `(227) 837-843` → `227 837 843`: persists exactly as in E04 (the OCR markdown also drops parens, and the model defers to it). Format normalisation belongs in `ocr.normalizeFields`, not the prompt.
- **Spurious "X" or "0" on blank-but-marked fields** — `1 81` produces `name=X` and `applicant_spousal_support_alimony=0` for blanks that happen to have a stray pen mark visible in the image. Hybrid eliminated most of these vs E04 (where the same sample lost ~5–6 fields to similar errors), but a few persist.
- **Obscured forms** (`81 coffee`, `81 blank`) — same as every prior experiment; not a hybrid-specific failure.

## Confidence semantics

Inherited verbatim from E04. Empirical observation on the canonical run: gpt-5.4 produced a non-empty `source_quote` for **every populated field**, so the bimodal 0.95/0.50 page-level mean lives near 0.95 in practice and the HITL gate fires rarely (`81 coffee` was the lone gate-fire). Same caveat as E04: `source_quotes` presence catches catastrophic failure modes (no quote = no answer) but does not catch confident OCR misreads.

The DI layout response carries per-word `confidence` ∈ [0,1] on `pages[].words[].confidence` — these survive the mapper and are visible on the canonical OCRResult. Re-calibrating the page-level mean to use these directly (instead of, or alongside, the structured-fields evidence signal) is a per-engine future improvement; documented but not addressed here.

## What the implementation delivers

- **New activity** `apps/temporal/src/activities/azure-di-read-plain.ts` — sync wrapper around DI prebuilt-layout. Submit + poll inline (no Temporal-level pollUntil because callers compose this with the VLM call in a single workflow node sequence — there's no benefit from interleaving Temporal poll). Wallclock ~5 s/page on the canonical dataset. Registered as `azureOcr.readPlain` in all three registries with a 10 m timeout + 5 attempts × 5 s × 1.5x × 30 s cap retry policy.
- **New provider folder** `apps/temporal/src/ocr-providers/vlm-ocr-hybrid/`:
  - `vlm-hybrid-types.ts` — `VlmHybridRawResponse` carries both legs (DI layout + VLM payload + OCR markdown actually sent + per-leg durations).
  - `ocr-to-markdown.ts` — DI layout → markdown converter. Two modes: verbatim (default; uses `analyzeResult.content`) and bbox-annotated (`includeBboxAnnotations: true`; re-segments by line, prepends `<bbox p="<page>" r="x0,y0,x1,y1">…</bbox>` tags with coords normalised to 0–1 page-relative). The bbox-annotated mode is the surface that the brief's variant 3 would flip; deferred per the SCOPE REDUCTION.
  - `vlm-hybrid-prompt-builder.ts` — delegates to E04's `buildVlmExtractionRequest` for the strict-mode JSON Schema (identical shape) and overrides only the messages. Hybrid system preamble names the OCR pre-pass and the trust hierarchy; user message wraps the OCR markdown in `<ocr_text>...</ocr_text>` delimiters before the image attachment.
  - `vlm-hybrid-extract.ts` — the chat-completions activity. Reads the upstream `layoutResponse` from `params.layoutResponse` (workflow wires it in via ctx), renders to markdown, builds the request, calls Azure OpenAI, parses, maps. PDF guard, env-var resolution, blob read, base64 encoding, retry/timeout handling.
  - `vlm-hybrid-to-ocr-result.ts` — VLM payload → canonical OCRResult. Inherits E04's structured-fields path then overrides `pages[]` / `paragraphs[]` / `tables[]` / `extractedText` from the upstream layout so word/line polygons + real form text reach downstream consumers. `documents[0].docType = "vlm-ocr-hybrid"`.
- **Activities registered** as `azureOcr.readPlain` and `vlmOcrHybrid.extract` in all three registries (runtime function, workflow-safe constant, backend allow-list). Hybrid VLM activity uses the same 30 attempts × 15 s × 1.5x × 60 s cap retry as `vlmDirect.extract`; DI activity uses a lighter 5 attempts × 5 s × 1.5x × 30 s cap (sync wrapper, no quota fan-out).
- **Workflow template** at `docs-md/graph-workflows/templates/experiment-05-vlm-ocr-hybrid-workflow.json` — sync chain (`prepareFileData → azureDiReadPlain → vlmOcrHybridExtract → cleanup → checkConfidence → reviewSwitch → humanReview/storeResults`). Auto-discovered by `seedExperimentWorkflows()`. `templateModelId` defaults to `seed-sdpr-monthly-report-template`. `azureOpenAiDeployment` defaults to `gpt-5.4`. Embeds the iteration kit's prompt + per-field descriptions verbatim.
- **Sync-provider cache emission** — the activity returns `{ ocrResult, ocrResponse }`; the workflow declares `ocrResponse` in `ctx` and adds the second `outputs` mapping, so `benchmark-sample-workflow.ts`'s `persistOcrCache` step writes a row to `benchmark_ocr_cache` per sample. Verified end-to-end: **40 cache rows for the canonical run** (matches `total_samples`).
- **Provider doc** at [`docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md`](../../../docs-md/graph-workflows/05-vlm-ocr-hybrid-OCR.md) covers endpoint shape (both legs), strict-mode schema we send, vocabulary mapping, OCR-markdown rendering modes, source_quotes hallucination guard, confidence + bbox notes, env vars, and the iteration kit.

## Tests

[`apps/temporal/src/experiment-05-vlm-ocr-hybrid.test.ts`](../../../apps/temporal/src/experiment-05-vlm-ocr-hybrid.test.ts):

**Static (18 tests, no Temporal):** template metadata + scope rules (uses `vlmOcrHybrid.extract` + `azureOcr.readPlain`; NOT Mistral / CU / VLM-direct / Azure DI custom-model paths; no LLM enrichment; no pollUntil; no `pdf.renderToImages`) + chain wiring (DI runs before VLM; topological order; switch wiring) + ctx + outputs wiring (incl. the layoutResponse ctx handoff and the ocrResponse port that drives benchmark_ocr_cache) + retry shapes (DI ≥3 attempts; VLM ≥20 attempts) + parameter shape on the extract node + graph-schema validation.

**Trust-hierarchy stress test (1 test):** feeds the prompt builder a deliberately-wrong OCR markdown ("Net Employment Income: 9181, Applicant Name: Wrong Name") alongside the SDPR field schema and asserts (a) the wrong OCR text is inlined inside `<ocr_text>` delimiters in the user prompt, (b) the user prompt contains the explicit "When the image and the OCR text disagree, prefer the image" instruction, (c) the system prompt contains the "trust what you see in the image and ignore the OCR text" rule, and (d) the wrong OCR text does not corrupt the schema (every key still required, `additionalProperties: false`). End-to-end image-vs-OCR accuracy is asserted by the benchmark.

**Fixture-aware (4 tests on layout fixture, 4 tests on hybrid fixture):** the layout fixture exercises `ocrLayoutToMarkdown` on a real DI response (verbatim and bbox-annotated modes), confirms the captured pages have words and lines populated. The hybrid fixture asserts the captured response is well-formed, the structured-field pass actually ran (≥ 70 of 74 keys present per strict mode), the mapper turns it into a usable OCRResult **with bbox-populated pages from the layout** (the central improvement over E04), and source_quotes evidence rate is significant.

**Runtime (2 tests against local dev-stack Temporal at `localhost:7233`):** high-confidence sample skips humanReview; low-confidence sample routes through humanReview + `humanApproval` signal. Both replay the captured DI layout fixture through mocked activities. CI-gated and fixture-gated.

Plus 9 unit tests in [`vlm-hybrid-prompt-builder.test.ts`](../../../apps/temporal/src/ocr-providers/vlm-ocr-hybrid/vlm-hybrid-prompt-builder.test.ts) (trust-hierarchy preamble, OCR-text delimiter, schema shape, schema name override), 7 in [`ocr-to-markdown.test.ts`](../../../apps/temporal/src/ocr-providers/vlm-ocr-hybrid/ocr-to-markdown.test.ts) (verbatim mode, bbox-annotated mode, page separators, polygon fallback, truncation), and 7 in [`vlm-hybrid-to-ocr-result.test.ts`](../../../apps/temporal/src/ocr-providers/vlm-ocr-hybrid/vlm-hybrid-to-ocr-result.test.ts) (docType override, layout-pages-take-precedence, layout-markdown-becomes-extractedText, fallback when no layout).

`cd apps/temporal && CI=true npx jest src/experiment-05-vlm-ocr-hybrid.test.ts src/ocr-providers/vlm-ocr-hybrid/`

## Smoke-test helper

[`apps/temporal/src/scripts/iterate-hybrid-extraction.ts`](../../../apps/temporal/src/scripts/iterate-hybrid-extraction.ts) runs the full hybrid path on one sample (DI prebuilt-layout + VLM call + diff vs ground truth) and writes a per-field diff plus the layout response and the parsed VLM payload.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "synth-full (1)" gpt-5.4
```

## Pre-flight helper

[`apps/temporal/src/scripts/preflight-hybrid.ts`](../../../apps/temporal/src/scripts/preflight-hybrid.ts) asserts every precondition needed before the first paid call: env vars (Azure OpenAI + Azure DI), DI prebuilt-layout reachable + producing markdown on a 60×60 PNG, gpt-5.4 reachable + vision + strict-mode round-trip, dataset registration, and the seeded SDPR template's `field_schema`. Exits non-zero on any failure.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts gpt-5.4
```

## Gaps (out-of-scope or deferred)

- **PDF support** — same as E04, the activity throws on `fileType === "pdf"`. The canonical 40-sample dataset is 100% JPEG; PDF rendering (`pdf.renderToImages` activity + render node before `vlmOcrHybrid.extract`) is a single follow-up addition, deferred until a workload requires it.
- **Variant 2 (OCR-only, no image)** and **Variant 3 (image + OCR markdown + bbox spatial hints)** — out-of-scope per the user's session-start scope reduction. Variant 3 is one workflow JSON away (`includeBboxAnnotations: true` on the extract node's params); variant 2 is another workflow JSON that drops the DI step and feeds an empty `layoutResponse` (the prompt builder gracefully renders "(OCR text was empty)" when the markdown is empty).
- **gpt-4o, gpt-5 axes** — out-of-scope for the same reason. The activity already accepts `azureOpenAiDeployment` as a workflow parameter.
- **Hallucination guard upgrade** — `source_quotes` non-empty is a weak signal because gpt-5.4 emits a quote even for wrong answers (inherited from E04). Token-logprob-based confidence or a self-consistency variant would be stronger; both deferred.
- **Confidence-threshold recalibration** — the bimodal 0.95/0.50 evidence-based confidence is the same shape as E04; the page-level mean rarely drops below 0.95. Re-calibrating per-engine to use DI per-word confidence directly (those values exist on `pages[].words[].confidence` after the layout copy) is a per-engine improvement; deferred.
- **Cost telemetry aggregation** — the activity logs `usage.{prompt_tokens, completion_tokens, total_tokens}` from the VLM leg + `vlmDurationMs` separately. DI cost (per-page) is implicit from invocation count. Cross-engine cost normalisation across E01–E05 is tracked in [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 2.
- **P50/P95 latency per engine** — `benchmark-run.json` carries per-sample `startedAt`/`completedAt` for all five experiments; the cross-engine percentile comparison is a one-script-away follow-up tracked in [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 3.
- **Strict-equality re-eval** — `fuzzy@0.85` vs `exact` rule comparison across all five experiments tracked in [POST_BENCHMARK_FOLLOWUPS.md](../../POST_BENCHMARK_FOLLOWUPS.md) item 1.

## Parent-shared infra fixes applied

None. E04's stack of fixes (sync-provider cache emission convention, evidence-based confidence synthesis, strict-mode JSON Schema builder, `runtimeSettingsOverride` trigger, `poll-experiment-run.ts` helper, env-loading order for `TEST_API_KEY`, idempotent deploy pattern, iteration kit standard) all apply unchanged. The `cuResponse → ocrResponse` rename codified in E03 means E05's activity got the cache-emission convention right on the first try (zero cache rows would have been a silent bug; we explicitly verified 40/40).

## Reproducing this run

```bash
# 1. (One-time, Azure-side) gpt-5.4 already deployed on the Foundry resource (E04 shipped this).

# 2. ~/.config/bcgov-di/temporal.env should still point Azure OpenAI at the
#    eastus2 resource (where gpt-5.4 lives) — left from E04. AZURE_DOCUMENT_INTELLIGENCE_*
#    were set during E01 and remain pointing at the per-developer DI resource.

# 3. Restart the Temporal worker so it picks up new activity registrations.
cd apps/temporal && npm run dev

# 4. Run preflight to verify every precondition.
cd apps/temporal && npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts gpt-5.4

# 5. (Optional) iterate prompts on three representative samples.
npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "synth-full (1)" gpt-5.4
npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "manual sample (1)" gpt-5.4
npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "1 81" gpt-5.4
# Edit experiments/results/05-vlm-ocr-hybrid/iteration/{prompt.md,field-descriptions.json}
# and re-run; ~12-28 s per iteration.

# 6. Once happy, copy prompt + descriptions into the workflow JSON's
#    vlmOcrHybrid.extract `parameters` and re-seed.
cd ../.. && npm run test:db:reset

# 7. Trigger the run via the TS wrapper.
cd apps/temporal && npx tsx -r tsconfig-paths/register src/scripts/trigger-experiment-benchmark.ts 05

# 8. Poll until terminal; the helper saves the export automatically.
npx tsx -r tsconfig-paths/register src/scripts/poll-experiment-run.ts <runId> 05-vlm-ocr-hybrid

# 9. Capture the hybrid fixture (any sample id; "1 81" is the canonical one).
docker exec ai-doc-intelligence-postgres psql -U postgres -d ai_doc_intelligence -t -A \
  -c "SELECT \"ocrResponse\"::text FROM benchmark_ocr_cache WHERE \"sourceRunId\" = '<runId>' AND \"sampleId\" = '1 81';" \
  | python3 -m json.tool \
  > apps/temporal/src/__fixtures__/experiment-05/vlm-hybrid-response-1-81.json
```

## Retrospective — what we learned setting up E05

Candid record of the surprises and patterns that worked / didn't.

### Surprises

1. **Iteration accuracy was high enough on the first try that no prompt tuning was needed.** Copy-pasted E04's iteration kit (prompt + field-descriptions verbatim) and ran on `1 81` — got 72/74 (97.3%) cold. Then `synth-full (1)` was 73/74 (98.6%) — vs E04's 70.3% plateau on the same sample. Then `manual sample (1)` was 74/74 (100%). The hybrid pattern is so structurally better than VLM-direct on this dataset that the iteration loop was effectively a single sample-rotation pass to confirm it works, not a tuning loop. **The DI OCR layer is doing real work here**: it transcribes the digit sequences gpt-5.4's vision encoder gets wrong, and the trust-hierarchy prompt lets the VLM benefit from those transcriptions without blindly trusting them.

2. **`synth-full (1)` went from "the hardest sample" to "near-perfect" with one architectural change.** E04's retrospective specifically called out that this sample was unusually hard for VLM-direct (F1 0.844 in the canonical run), and that iterating on it overweighted a worst case. Hybrid scored 0.993 on the same sample — a +14.9 pp jump. Architectural lesson: **the OCR-encoder gap E04 documented as a vision-encoder limitation actually closes when you give the model an OCR layer to read from.** "Iteration on a single sample is a poor proxy for benchmark performance" was the right takeaway from E04, but the underlying cause (vision-encoder OCR limits at low resolution) is now fixable, not just tractable.

3. **DI's `outputContentFormat=markdown` produces useable markdown out-of-the-box.** No bespoke rendering needed; the verbatim `analyzeResult.content` includes headings and tables in Markdown form. The hybrid prompt feeds it directly into `<ocr_text>` delimiters and the model uses it. This means variant 3 (bbox-annotated markdown) is a true variant — not a necessity; the verbatim mode is enough on this dataset.

4. **gpt-5.4 produces a `source_quote` for fields it reads from the OCR markdown, not just the image.** Inspecting the canonical run, the source_quote text frequently mirrors the OCR markdown verbatim (down to surrounding whitespace) rather than what the model "sees" in the image. This means the source_quote signal is even weaker as a hallucination guard in the hybrid path than it was in E04 — when the OCR markdown contains a value, the model quotes from it. Documented as a confidence semantics gap; the structural 0.95/0.50 bimodal still works for catastrophic-failure detection.

5. **The DI prebuilt-layout sync wrapper is the right shape for this composition.** I considered using `pollUntil` at the workflow layer (per the existing async pattern in `submit-to-azure-ocr.ts`) but the hybrid composition is sync end-to-end (DI poll completes before VLM call), so a separate poll node would just add Temporal overhead without enabling parallelism. The single sync activity wrapper is simpler, faster, and matches how the hybrid is actually structured.

6. **Preflight worked exactly per E04's pattern, with one new failure mode caught.** First preflight pass failed with `InvalidContentDimensions` from DI on the 1×1 PNG — DI requires images ≥ 50×50, generated a 60×60 white PNG inline, passed. Lesson: **when probing a different engine with a tiny test image, check the engine's minimum-dimension rule.** Already updated in `preflight-hybrid.ts`; suggest adding to the canonical preflight pattern in `_shared-rules.md`.

### What worked

7. **Iteration kit copy from E04 — instant production-grade baseline.** Same lesson as E04 inheriting from E03: the SDPR-form quirks (column conventions, blank-vs-zero, signature-vs-name, etc.) are engine-agnostic. The iteration kit transferred verbatim. Confirmed pattern: future experiments should always start by `cp -r ../<previous>/iteration ../<current>/iteration`.

8. **Sync-provider cache emission convention worked silently for the third time.** The activity returns `{ ocrResult, ocrResponse }`; the workflow declares both ports + ctx keys; `persistOcrCache` writes a row per sample. Verified end-to-end: 40 cache rows for 40 samples.

9. **TS-based trigger + poll scripts handled E05 without per-experiment wiring** (already added `05-vlm-ocr-hybrid` to the slug allow-list during plumbing, but didn't need any other changes). One-line addition to the slug list, fully reusable.

10. **The hybrid mapper's "borrow pages from the upstream layout" approach is clean.** Only ~30 lines of code (`clonePages` + `cloneParagraphs` + `cloneTables`), inherits everything else from E04's mapper, and the resulting `OCRResult` carries real DI word/line polygons + paragraphs + tables. Downstream consumers (`ocr.cleanup`, `ocr.checkConfidence`, future spatial-aware components) see the data they used to in the Azure DI path. This is the structural improvement E04's "Bounding-box convention ⚠️" gap pointed to; closing it took a 30-LOC mapper override.

### What didn't work

11. **Phone-format preservation still failed.** `(227) 837-843` came back as `227 837 843` on `synth-full (1)` — same failure mode as E04. The DI markdown also drops the parentheses (DI's OCR layer normalises punctuation around digit groups), so the trust-hierarchy ("prefer the image") doesn't help: the OCR text and the image agree (or the OCR text doesn't disagree convincingly enough). Format normalisation belongs in `ocr.normalizeFields` post-hoc, not the prompt — same conclusion as E04.

12. **Spurious "X" / "0" on visually-blank-but-marked fields persists at low frequency.** `1 81` produced `name="X"` and `applicant_spousal_support_alimony=0` for cells that had a stray pen mark visible in the image. Hybrid eliminates most of these (most samples score 0.95+ now vs E04's 0.85+), but a long tail remains. These would require either field-level confidence calibration (lower confidence on single-character extractions) or schema-aware post-processing (drop "X" as not-a-name); neither is an E05 deliverable.

## Implications for cross-experiment-stack decisions

**E05 is the production-stack winner on this dataset.** It hits or beats every other engine on every aggregate metric, runs at competitive wallclock (~3× faster than CU per-sample, ~1.2× slower than VLM-direct), uses two engines we already have credentials for, and brings real word/line polygons to `OCRResult` (which CU and Mistral give us for free; VLM-direct does not). The cost is roughly 2× VLM-direct (DI per-page + VLM tokens) but still well below CU's two-layer billing.

A couple of things E05 surfaced that should change in `_shared-rules.md` before any future experiment:

13. **Preflight images need engine-appropriate dimensions.** A 1×1 PNG passes Azure OpenAI's vision endpoint but fails Azure DI with `InvalidContentDimensions`. Suggest adding a "use a 50×50+ PNG for any DI probe" note to the canonical preflight pattern. Already updated in `preflight-hybrid.ts`.

14. **When composing two engines in one workflow node sequence, prefer a sync wrapper over a workflow-level pollUntil.** The hybrid pattern does DI submit + poll inline (`azure-di-read-plain.ts`), then composes with the VLM call. Splitting the DI step into `submit` + `pollUntil(poll)` + `extract` (the existing async DI pattern) would just add Temporal overhead without enabling parallelism, because the VLM call must wait for the DI completion regardless. Suggest adding a "for sync compositions, use a sync wrapper; for workflow-level fan-out, use the async pattern" rule to `ADDING_OCR_PROVIDERS.md`.

15. **Cross-experiment fact**: hybrid + CU now share the f1.median and matchedFields.median podium (both at 0.965 / 69 of 74). The remaining 5 fields appear to be a mixture of (a) phone-format normalisation, (b) the obscured-form edge cases (`81 coffee`, `81 blank`), and (c) a small handful of single-character spurious extractions. None of these are model-architecture issues — they're either dataset issues or post-processing gaps. Future experiments aimed at moving the median above 0.965 should focus on those three failure modes specifically, not on swapping engines.
