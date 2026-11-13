# Extraction Provider Architecture

## Current state

OCR/extraction engines plug into the system through Temporal **activities** registered in `apps/temporal/src/activity-registry.ts`. The registry maps activity-type strings (e.g. `azureOcr.submit`, `mistralOcr.process`) to functions and assigns timeouts + retry policies. Graph workflows (`apps/temporal/src/graph-workflow.ts`) reference activities by these type strings.

Two engines are wired today:

| | Azure DI (template models) | Mistral (public API) |
|---|---|---|
| Lifecycle | 3 activities: `azureOcr.submit` / `poll` / `extract` | 1 activity: `mistralOcr.process` |
| API style | Async (poll-based, via SDK long-running operation) | Sync HTTP POST |
| Auth | `api-key` header (`@azure-rest/ai-document-intelligence` SDK) | `Bearer <key>` (axios) |
| Endpoint | `AI_HUB_ENDPOINT` tenant base URL; the SDK appends the Document Intelligence path | Public: hardcoded `https://api.mistral.ai/v1/ocr`; Azure: `AI_HUB_ENDPOINT` plus `/providers/mistral/azure/ocr` |
| Field schema | DB `FieldDefinition[]` → trained model fields (training-time) | DB `FieldDefinition[]` → `document_annotation_format` (request-time) |
| Mock flag | `MOCK_AZURE_OCR=true` | `MOCK_MISTRAL_OCR=true` |
| Result mapper | `extract-ocr-results.ts` (uses SDK response shape) | `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts` |
| Provider folder | None (activities live under `apps/temporal/src/activities/`) | `apps/temporal/src/ocr-providers/mistral/` |

These provider activities do not implement a shared `OcrProvider` interface —
they remain independent activities producing the canonical `OCRResult` type.

The Temporal Document Intelligence, Azure Mistral, and VLM activities share
`AI_HUB_ENDPOINT` and `AI_HUB_API_KEY`, authenticating with the `api-key`
header. Model/deployment and API-version settings remain separate. The native
public Mistral transport remains independent and uses `MISTRAL_API_KEY`.

## Decision: defer formalizing the interface

Each new engine adds a folder under `apps/temporal/src/ocr-providers/<engine>/` following the Mistral pattern (mapper + converter + activity). No abstract base class. We re-evaluate after 2–3 new engines land — the right interface only becomes obvious once we've seen which lifecycle, schema-conversion, and mapper concerns actually generalize across engines that diverge as widely as Azure DI's poll-based lifecycle, Mistral's sync call, CU's analyzer-deploy + analyze flow, and a VLM's chat-completions request.

**Acceptance criterion for revisiting:** if 2 of the new engines (E02–E05) each duplicate ≥30 lines of boilerplate (auth setup, endpoint normalization, error handling, retry/poll loop, mapper scaffolding), extract a base. Until then, copy patterns from Mistral.

## Audit of existing providers against the 12-item checklist

Each item is checked against both Azure DI and Mistral. ✅ = handled correctly today, ⚠️ = gap, 🆕 = item didn't apply when the engine was added but matters now that more engines are joining.

| # | Item | Azure DI | Mistral |
|---|---|---|---|
| 1 | Mapped to canonical `OCRResult` | ✅ via `extract-ocr-results.ts` | ✅ via `mistral-to-ocr-result.ts` |
| 2 | Activity-type registered with timeout + retry | ✅ `azureOcr.submit/poll/extract` | ✅ `mistralOcr.process`, 10m timeout, 2 attempts |
| 3 | Field schema → engine format | ✅ via training-time field definition (no per-call conversion) | ✅ `field-definitions-to-mistral-annotation-format.ts` |
| 4 | Confidence values 0–1 | ✅ DI native 0–1 | ✅ from `word_confidence_scores`; falls back to `average_page_confidence_score` (default 0.95 if missing) |
| 5 | Bounding-box coords | ✅ inches from top-left at API `2024-11-30`, populated on `OCRResult.pages[].words[].polygon` | ⚠️ Mistral mapper sets `polygon: []` for words synthesized from markdown; only word-level scores are populated. Bbox-aware downstream consumers (e.g. layout-aware VLM hybrid in E05) won't get spatial info from Mistral. **Captured as a TODO inside `experiments/integration-checklists/02-mistral-doc-ai-azure.md`** |
| 6 | Page indexing convention | ✅ 1-indexed in `OCRResult.pages[].pageNumber` | ✅ same |
| 7 | Auth & endpoint via env vars | ✅ `AI_HUB_ENDPOINT` + `AI_HUB_API_KEY`; endpoint normalized (trailing slash stripped) | ✅ Public `MISTRAL_API_KEY`; Azure Mistral uses shared `AI_HUB_*` config |
| 8 | Workflow graph definition | ✅ existing template-model workflows in seed | ✅ existing Mistral workflow in seed |
| 9 | Engine-internal preprocessing | ✅ DI handles deskew/rotate/denoise; documented | ⚠️ Mistral's internal preprocessing isn't documented in the codebase. **Captured as a TODO inside `experiments/integration-checklists/02-mistral-doc-ai-azure.md`** |
| 10 | Test coverage | ✅ unit tests for mappers + activity | ✅ unit tests for mappers + activity |
| 11 | Benchmark integration | ✅ runs through `BenchmarkRun` flow today | ✅ runs through `BenchmarkRun` flow today |
| 12 | Cost/usage telemetry | 🆕 Not recorded today — neither provider populates usage on `BenchmarkRun.metrics`. **Each new engine in E02–E05 records its own; revisit cross-engine normalization after E05 lands.** | 🆕 Same. |

### Configuration boundary

The current Document Intelligence, Azure Mistral, and VLM clients share the AI
Hub endpoint and subscription key. Older endpoint/key names in experiment
history are not runtime fallbacks. Public Mistral remains separate, using
`MISTRAL_API_KEY`; deployment and API-version settings remain independent.

### Test-tenant smoke evidence

On 2026-11-12 and 2026-11-13, the existing iteration runners sent three
synthetic public samples through each active Hub provider. DI and GPT vision
used `synth-full (1)`, `synth-full (2)`, and `synth-no-spouse (1)`; Azure
Mistral used `synth-full (3)`, `synth-full (2)`, and `synth-no-spouse (1)`.
These direct-provider calls check compatibility, not end-to-end app behavior,
production readiness, or representative accuracy.

| Provider | Samples and results |
|---|---|
| Document Intelligence (`prebuilt-layout`) | All three DI calls in the hybrid runs succeeded. Markdown output was 5,005, 5,041, and 4,799 characters; elapsed times were about 5.3, 6.9, and 6.0 s. The initial Hub operation URL passed origin/tenant-path validation before polling. |
| GPT vision (`gpt-5.6-sol`) | Strict-schema extraction matched 64/76, 61/76, and 67/76 fields on the three samples (192/228 aggregate, 84.2%). Elapsed times were 28.7, 22.8, and 19.5 s. The first call reported 17,309 total tokens. |
| Azure Mistral (`mistral-document-ai-2512`) | All calls returned HTTP 200 with one annotated page. Extraction matched 75/76, 73/76, and 72/76 fields (220/228 aggregate, 96.5%); elapsed times were 12.5, 13.3, and 19.1 s. The runner's score is not a quality estimate: for example, the last sample had two materially incorrect monetary amounts despite matching 72/76 fields. |

GPT requests used API version `2024-10-21` as reported by the process
environment. Existing VLM preflight scripts still require
`2024-12-01-preview`; that minimum is not confirmed against the deployed Hub
contract and should be reconciled before relying on preflight. Mistral
reported `pages_processed_annotation: 1` and `pages_processed: 0`; its
annotation-specific count is the relevant usage signal for these responses.

No live Content Understanding, production, or upload-to-Temporal end-to-end
checks were performed. Mistral's annotation output and the GPT field scores
are small-sample compatibility evidence only; field-level error severity and
workflow behavior need separate validation.

### TODOs propagated to experiment briefs

- **`experiments/integration-checklists/01-neural-doc-intelligence.md`**: APIM-vs-direct DI access (separate concern from this audit, but the same brief carries it).
- **`experiments/integration-checklists/02-mistral-doc-ai-azure.md`**: Item 5 (mapper bbox population), Item 9 (preprocessing documentation).
- **All experiment briefs**: Item 12 (cost/usage telemetry — record per-engine; cross-engine normalization deferred to follow-up after E05).

## How to add a new engine

1. Read `experiments/integration-checklists/_shared-rules.md` for the full 12-item checklist with pointers to the codebase.
2. Create `apps/temporal/src/ocr-providers/<engine>/` with mapper + (if applicable) field-definitions converter + the activity functions.
3. Register activity types in `apps/temporal/src/activity-registry.ts` with appropriate timeout + retry.
4. Define a workflow graph that uses the new activity types alongside the post-processing nodes.
5. Add unit tests (mapper + converter) and an integration test (real-API once during bring-up; mock-replay after stabilization).
6. Fill in the 12-item checklist for your engine in `docs-md/EXTRACTION_EXPERIMENTS.md`.
