# VLM-direct OCR provider (E04)

A "VLM-direct" OCR provider for the graph-workflow engine. The activity sends a document image plus a strict-mode JSON Schema `response_format` to an Azure OpenAI chat-completions deployment (vision-capable; `gpt-5.4` by default for E04). The model returns `{ fields, source_quotes }` in a single round-trip — no separate OCR pre-pass.

## Endpoint, auth, request/response shape

| | Azure OpenAI chat completions | This experiment |
|---|---|---|
| Base URL | `https://<resource>.openai.azure.com/openai/...` (or `cognitiveservices.azure.com/openai/...`) | E04 uses `https://strukalex-8338-resource.cognitiveservices.azure.com/openai/...` (same resource hosting CU) |
| API version | `2024-12-01-preview` (or newer) | same; required for `response_format: { type: "json_schema", strict: true }` |
| Auth | `api-key: <key>` header | same (Azure OpenAI canonical convention; **not** `Authorization: Bearer`) |
| Request | `POST /openai/deployments/{deployment}/chat/completions?api-version=...` | same |
| Vision input | `messages[].content[]` with `{ type: "image_url", image_url: { url: "data:<mime>;base64,..." } }` | inline base64 (no public URL upload required) |
| Structured output | `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` | strict mode required; without it the model can return free-form JSON that doesn't match the schema |

## Strict-mode schema we send

```jsonc
{
  "name": "sdpr_vlm_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "fields": {
        "type": "object",
        "properties": { "<field_key>": <per-field-property>, ... },
        "required": [ ...all field keys... ],
        "additionalProperties": false
      },
      "source_quotes": {
        "type": "object",
        "properties": { "<field_key>": { "type": "string" }, ... },
        "required": [ ...all field keys... ],
        "additionalProperties": false
      }
    },
    "required": ["fields", "source_quotes"],
    "additionalProperties": false
  }
}
```

OpenAI strict-mode constraints we honour:
- every property is in the parent's `required` array,
- `additionalProperties: false` on every object,
- no `format` keyword (date is a plain `string`),
- numeric nullability is expressed as `"type": ["number", "null"]`.

## Vocabulary mapping (canonical FieldType → JSON Schema property)

| Our `FieldType` | JSON Schema property | Notes |
|---|---|---|
| `string` | `{ "type": "string" }` | optional `description` overlay |
| `number` | `{ "type": ["number", "null"] }` | always nullable so the prompt's blank-vs-zero rule survives |
| `date` | `{ "type": "string" }` | ISO date, "" if blank |
| `selectionMark` | `{ "type": "string", "enum": ["selected", "unselected"] }` | enums are strict-mode-compatible |
| `signature` | `{ "type": "string" }` | VLM has no signature primitive — extracted verbatim |

## Sibling `source_quotes` (hallucination guard)

Every `<field_key>` in the schema has a sibling `source_quotes.<field_key>` slot of `type: "string"`. The prompt asks the model to populate each quote with verbatim text from the form supporting the value it chose. Empty string when no supporting text exists.

The mapper synthesises per-field confidence from quote presence:

| `source_quote` | confidence |
|---|---|
| Non-empty (after `.trim()`) | **0.95** |
| Empty / whitespace-only | **0.50** |

Page-level confidence is the mean of per-field confidences. The default `ocr.checkConfidence` threshold of 0.95 fires when meaningful evidence is missing across enough fields to drag the mean below 0.95 — surfacing the document for HITL review.

**Empirical note from iteration:** on synth-full(1), gpt-5.4 produced a `source_quote` for *every* field, including ones that turned out to be wrong vs ground truth. The model writes a quote that matches its own answer, not necessarily what's actually on the form. So `source_quote` presence is a weak signal — it filters out total fabrication, but doesn't catch confident OCR misreads. Numeric digit errors (e.g. predicted `981` vs ground truth `9181`) come back at 0.95 confidence and don't trip the HITL gate.

## Image input

The activity:
1. Reads the blob as a Buffer.
2. Encodes it as base64.
3. Sends `messages[1].content[1] = { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`.

Azure OpenAI's vision pipeline applies its own image preprocessing internally (resizing to its native input resolution, etc.); we pass the original-DPI image as-is.

**PDF guard.** The activity throws if `params.fileData.fileType === "pdf"`. The canonical 40-sample dataset is 100% JPEG, so PDF rendering is deferred to a follow-up experiment. Adding it later is a single new activity (`pdf.renderToImages`) plus a render node before `vlmDirect.extract` in the workflow JSON — does not change the activity itself.

## Engine-internal preprocessing

Azure OpenAI vision performs internal image preprocessing (resizing, normalisation) before its own vision encoder. We do **not** know the exact resolution it operates at; it appears to be lower than the native form resolution, which contributes to the digit-misread errors we see vs CU's dedicated OCR layer. The upstream `pdf-normalization.service.ts` (which would handle PDF→image rendering for the workflow engine) does not run for E04 because we skip PDF inputs entirely.

## Confidence semantics

VLM-direct does not produce a per-field confidence natively (chat-completions doesn't expose token logprobs in a structured way through this path). The mapper's evidence-based synthesis (above) is the only confidence signal, and the bimodal 0.95/0.50 distribution means the page-level mean lives in [0.50, 0.95]:

- **0.95 page-mean** = every field has a non-empty source_quote.
- **0.50 page-mean** = every field is unevidenced (extreme; unlikely in practice).
- Real samples cluster near 0.95 because the model usually populates quotes liberally.

Because gpt-5.4 emits a quote for fields it gets wrong (see "Empirical note" above), the HITL gate in E04 fires less often than its CU counterpart in E03 (which uses native CU per-field confidences distributed in [0.40, 0.99]). Re-calibrating the threshold would require a token-logprob-based confidence — out of scope for E04.

## Page indexing

VLMs return no per-page metadata. The mapper synthesises a single canonical page (`pageNumber: 1`, default `612 × 792 pixel`) carrying the synthesised summary text in `extractedText` so downstream `ocr.cleanup` and `ocr.checkConfidence` have something to consume. Multi-page support would need per-page calls; the canonical dataset is single-page so this is moot for E04.

## Bounding boxes

Not produced. `pages[].words[].polygon` and `pages[].lines[].polygon` are emitted as empty arrays. `keyValuePairs[].key.boundingRegions` and `value.boundingRegions` are also empty. E05's hybrid will need to source bounding boxes from an OCR pre-pass if it depends on them.

## Auth & endpoint env vars

| Var | Required | Notes |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | yes | resource hostname; for E04 must point at the eastus2 `strukalex-8338-resource` (the resource hosting `gpt-5.4`). |
| `AZURE_OPENAI_API_KEY` | yes | API key for the same resource. |
| `AZURE_OPENAI_DEPLOYMENT` | yes (or pass `params.azureOpenAiDeployment`) | deployment name. E04 default: `gpt-5.4`. |
| `AZURE_OPENAI_API_VERSION` | no | defaults to `2024-12-01-preview` (December 2024 strict-mode-capable preview). |
| `MOCK_VLM_DIRECT` | no | when `true`, returns a canned all-empty response without making HTTP calls (useful for tests). |

**Quota.** The Foundry deployment of `gpt-5.4` defaults to GlobalStandard SKU; capacity 100 = 100K TPM. A 200-DPI form image plus the 74-field schema + prompt is ~10K input tokens; with ~1K output tokens that's ~10–15 calls/min throughput per deployment. The activity's retry policy mirrors the other Foundry-quota-gated activities: 30 attempts × 15 s × 1.5x backoff × 60 s cap. Capacity bumps via `az resource update --set sku.capacity=N` are reversible and only cap throughput — not a reservation.

## Cost telemetry

The chat-completions response carries a `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`). The activity logs these on the `complete` event. The benchmark run's `metrics` JSON does not yet aggregate per-sample cost — cross-engine cost normalisation is deferred to the post-E05 follow-up.

## Comparison to E03 (Azure Content Understanding)

E04 and E03 ultimately call the same family of generative models (`gpt-5.4` ≈ `gpt-5.2`), but the path is different:

| | E03 (CU) | E04 (VLM-direct) |
|---|---|---|
| Pipeline | CU's OCR layer + generative gpt-5.2 pass over OCR output | gpt-5.4 vision encoder reading the image directly |
| Strict-mode schema | CU analyzer's `fieldSchema.fields` | OpenAI `response_format.json_schema` |
| Confidence | per-field, native, ∈ [0, 1] | synthesised from `source_quotes` presence (0.95/0.50 bimodal) |
| Bounding boxes | none (empty polygon fallback) | none |
| Idempotent setup | PUT analyzer (skipped if body matches) | none — chat-completions is fully stateless |
| First-call latency | ~22 s/sample @ capacity 100 | ~25 s/sample @ capacity 100 (similar; gpt-5 dominates both) |

E03 outperforms E04 on synth-full(1) iteration accuracy (97.3% vs 70.3%) — the dedicated CU OCR layer reads digits more reliably than gpt-5.4's vision encoder at this resolution. Full benchmark numbers in `experiments/results/04-vlm-direct/SUMMARY.md`.
