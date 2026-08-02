# E05 — VLM + OCR hybrid provider

The `vlm-ocr-hybrid` provider folder at
[`apps/temporal/src/ocr-providers/vlm-ocr-hybrid/`](../../apps/temporal/src/ocr-providers/vlm-ocr-hybrid/)
implements a two-leg hybrid extraction:

1. **Azure DI prebuilt-layout** (`azureOcr.readPlain`) — markdown +
   per-line/per-word polygons. No template, no field extraction.
2. **Azure OpenAI chat-completions** (`vlmOcrHybrid.extract`) — sends
   the document image AND the OCR markdown with a strict-mode JSON
   Schema response_format. The system prompt instructs the model to
   prefer the image when image and OCR text disagree.

## Why hybrid

E04 (VLM-direct, gpt-5.4 alone) is competitive at the headline
benchmark level but loses ~2 pp on `f1.median` to E03 (Azure CU). The
two-stage architecture used by Mistral and CU internally — OCR layer
producing markdown + bbox layout, then a generative model with the
schema — appears to close that gap. E05 reproduces the pattern with
components we control:

- DI's `prebuilt-layout` model gives us a high-quality OCR markdown +
  word/line polygons per the SDK's `outputContentFormat=markdown` query
  parameter.
- gpt-5.4's vision encoder reads the image directly and corrects OCR
  errors (digit confusion, missed punctuation, misread checkboxes) when
  the OCR markdown disagrees with what's visible.

Per the canonical 40-sample run, the trust hierarchy works: hybrid is
the best (or tied-best) on every aggregate metric, eliminates the
"VLM-direct returns no per-word polygons" gap E04 documented, and runs
in roughly 2× the wallclock of VLM-direct (DI ~5 s + VLM ~17 s).

## Endpoint, auth, request/response shape

### Leg 1 — Azure DI prebuilt-layout

| | Azure DI prebuilt-layout | E05 hybrid |
|---|---|---|
| Base URL | `https://<resource>.cognitiveservices.azure.com/documentintelligence/...` | E05 reuses `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (per-developer; APIM or direct) |
| API version | `2024-11-30` | same |
| Auth | `api-key: <key>` header | same |
| Request | `POST /documentModels/prebuilt-layout:analyze?outputContentFormat=markdown` | base64-inlined body |
| Response | 202 + `operation-location` header | sync wrapper polls until terminal |
| Markdown surface | `analyzeResult.content` (markdown string) | fed verbatim into the VLM prompt |
| Bbox surface | `analyzeResult.pages[*].words[*].polygon` (inches, top-left origin) | re-emitted on `OCRResult.pages[*].words[*].polygon` |

### Leg 2 — Azure OpenAI chat-completions

Identical to E04 — see [E04's provider doc](04-vlm-direct-OCR.md) for
endpoint shape. The only differences are:

- The `user` content array includes a text part containing the OCR
  markdown wrapped in `<ocr_text>...</ocr_text>` delimiters before the
  `image_url` part.
- The system prompt's first paragraph names the OCR pre-pass and the
  trust-hierarchy rule:
  > Use both inputs together. The OCR text is auxiliary context — it
  > helps you locate fields and read structure. **The image is the
  > source of truth.** When the OCR text and the image disagree on a
  > value (digits, characters, checkboxes, signatures), trust what you
  > see in the image and ignore the OCR text.

The strict-mode JSON Schema (`{ fields, source_quotes }`, every
property in `required`, `additionalProperties: false`) is verbatim from
E04 — `buildVlmHybridExtractionRequest` delegates to E04's
`buildVlmExtractionRequest` for the response_format and overrides only
the messages.

## Vocabulary mapping

Identical to E04 (inherited from `vlm-prompt-builder.ts`):

| Our `FieldType` | JSON Schema property | Notes |
|---|---|---|
| `string` | `{ "type": "string" }` | optional `description` overlay |
| `number` | `{ "type": ["number", "null"] }` | always nullable so the prompt's blank-vs-zero rule survives |
| `date` | `{ "type": "string" }` | ISO date, "" if blank |
| `selectionMark` | `{ "type": "string", "enum": ["selected","unselected"] }` | enums are strict-mode-compatible |
| `signature` | `{ "type": "string" }` | VLM has no signature primitive — extracted verbatim |

## OCR markdown rendering

[`ocr-to-markdown.ts`](../../apps/temporal/src/ocr-providers/vlm-ocr-hybrid/ocr-to-markdown.ts)
ships with two modes:

- **Default (verbatim)** — `analyzeResult.content` is passed through
  unchanged. DI's `outputContentFormat=markdown` already produces clean
  rendering with headings, paragraphs, and tables. The canonical E05
  benchmark uses this mode.
- **Bbox-annotated** (`includeBboxAnnotations: true`) — re-segments by
  line, prepending each non-empty line with a normalised bbox tag
  `<bbox p="<page>" r="x0,y0,x1,y1">…</bbox>`. Coords are 0–1
  page-relative (resolution-independent). This is the surface that the
  brief's variant 3 ("image + OCR markdown + inline bbox spatial
  hints") would flip; per the SCOPE REDUCTION, variant 3 is deferred.

For multi-page documents, mode 2 inserts `--- page N ---` separators
between page-scoped segments. The canonical 40-sample dataset is
single-page, so this is mostly defensive.

A `maxChars` budget (default 50 000) caps the markdown sent to the
model; if exceeded the trailing portion is dropped with a marker. On
the canonical dataset every sample's markdown fits comfortably (the
median is ~4 000 chars).

## Confidence semantics

Inherited from E04 — see
[E04's provider doc](04-vlm-direct-OCR.md#confidence-semantics):

- 0.95 when `source_quotes[field_key]` is non-empty after `.trim()`.
- 0.50 when the source_quote is empty / whitespace-only.

Page-level confidence is the mean of per-field confidences. The default
0.95 threshold in `ocr.checkConfidence` fires when the unevidenced
fraction of the page is large enough to drag the mean below 0.95.

The DI prebuilt-layout response carries per-word `confidence` ∈ [0,1]
on `pages[].words[].confidence`, and the mapper preserves these values
when copying the layout pages. The canonical aggregate confidence
remains the structured-fields evidence signal — re-calibration to use
DI per-word confidence directly is deferred.

## Bounding boxes

DI prebuilt-layout returns polygons as flat number arrays:
`[x0, y0, x1, y1, x2, y2, x3, y3]` (top-left, top-right, bottom-right,
bottom-left), with coords in inches at API `2024-11-30`. The mapper
copies them verbatim onto `OCRResult.pages[*].words[*].polygon` and
`OCRResult.pages[*].lines[*].polygon`. The `ocr-to-markdown.ts`
converter normalises to 0–1 page-relative when bbox annotations are
on.

This is the gap E04 documented as "VLM-direct returns no per-word/per-
line polygons; `pages[].words[].polygon` and
`keyValuePairs[].boundingRegions` are emitted as empty arrays. E05's
hybrid needs to source bboxes from an OCR pre-pass if it depends on
them." E05 closes that gap.

## Env vars

- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (DI; reused from E01)
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` (DI; reused from E01)
- `AZURE_OPENAI_ENDPOINT` (Azure OpenAI; reused from E04)
- `AZURE_OPENAI_API_KEY` (Azure OpenAI; reused from E04)
- `AZURE_OPENAI_DEPLOYMENT` (defaults to `gpt-5.4`; overrideable per-run via `params.azureOpenAiDeployment`)
- `AZURE_OPENAI_API_VERSION` (defaults to `2024-12-01-preview`; required for strict-mode structured outputs)

No new env vars introduced by E05.

## Iteration kit

- `experiments/results/05-vlm-ocr-hybrid/iteration/prompt.md` — global
  instruction text (system message preamble after the hybrid trust-
  hierarchy paragraph).
- `experiments/results/05-vlm-ocr-hybrid/iteration/field-descriptions.json`
  — per-field description overlay (keyed by `field_key`).
- [`apps/temporal/scripts/iterate-hybrid-extraction.ts`](../../apps/temporal/scripts/iterate-hybrid-extraction.ts)
  — end-to-end smoke test: DI read-plain + VLM call on one sample,
  diff vs ground truth, dumps `last-{request,response,layout,diff}.{json,md}`.
- [`apps/temporal/scripts/preflight-hybrid.ts`](../../apps/temporal/scripts/preflight-hybrid.ts)
  — env + DI markdown round-trip + Azure OpenAI strict-mode round-trip
  + dataset/template DB checks. Run this once at the start of any
  session.

When prompts are good, copy `prompt.md` content + `field-descriptions.json`
content into the workflow JSON's `vlmOcrHybrid.extract` activity
`parameters` (`documentAnnotationPrompt`, `fieldDescriptions`,
`numericFieldsNullable: true`). Re-seed and trigger the benchmark.
