# Mistral Document AI on Azure AI Foundry (E02 provider doc)

This is the provider-specific reference for the **Foundry**-routed Mistral
Document AI engine added in `experiment/02-mistral-doc-ai-azure`. It runs in
parallel to the existing public-API path
(`apps/temporal/src/activities/mistral-ocr-process.ts`) — both providers share
the request-body shape and the response mapper, but have separate auth,
endpoint, and activity registration.

For the public-API engine see [`MISTRAL_OCR.md`](MISTRAL_OCR.md).

## Provider files

| File | Purpose |
|---|---|
| [`apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts`](../../apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts) | The Temporal activity. Single HTTP call to the Foundry OCR endpoint. |
| [`apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`](../../apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts) | Shared mapper (Mistral OCR JSON → canonical `OCRResult`). Patched in E02 to populate per-word/per-line polygons when bbox data is present. |
| [`apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`](../../apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts) | Shared field-schema → `document_annotation_format` converter. |
| [`docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`](templates/experiment-02-mistral-doc-ai-azure-workflow.json) | The workflow template (`prepareFileData` → `mistralAzureOcr.process` → `ocr.cleanup` → `ocr.checkConfidence` → review-switch → `humanReview`/`storeResults`). |

## Endpoint

The Foundry deployment exposes the same Mistral OCR API contract on a
different URL/auth. The activity composes the URL from
`MISTRAL_DOC_AI_AZURE_ENDPOINT` and the constant path:

```
POST {MISTRAL_DOC_AI_AZURE_ENDPOINT}/providers/mistral/azure/ocr
Authorization: Bearer {MISTRAL_DOC_AI_AZURE_KEY}
Content-Type: application/json
```

Path source: confirmed against the LiteLLM Azure-AI provider implementation
(`get_complete_url` → `f"{api_base}/providers/mistral/azure/ocr"`,
`Authorization: Bearer {api_key}`). No `api-version` query param is required
on this endpoint.

The user's deployment in this experiment is `mistral-document-ai-2512` on
`strukalex-8338-resource` in `eastus2`; the activity defaults `model` to
`mistral-document-ai-2512` when the document's stored `model_id` is not a
Mistral deployment name (see `resolveMistralAzureDeploymentId`).

## Auth header — Bearer, not `api-key`

Foundry's "models" data plane supports both `api-key` and
`Authorization: Bearer <key>`. The Mistral Document AI route specifically
uses **Bearer** (matching the public API's auth convention). The brief's
preamble mentioned the `api-key` header as a difference to handle — that
turned out **not to be the difference**; auth is Bearer on both paths. The
real differences are the URL prefix and the resource-scoped key.

## Request body

The Foundry endpoint accepts a **stricter subset** of the public Mistral OCR
API body. The activity sends:

```json
{
  "model": "mistral-document-ai-2512",
  "document": { "type": "document_url", "document_url": "data:application/pdf;base64,..." },
  "document_annotation_format": { /* JSON Schema from labeling template */ },
  "document_annotation_prompt": "..."
}
```

Notable divergence from the public API: `confidence_scores_granularity`
is **not accepted** on Foundry — it's rejected with HTTP 422
(`extra_forbidden`). The Foundry deployment returns `confidence_scores`
with whatever default granularity it chooses, and the mapper handles both
shapes (with or without `word_confidence_scores`). The public-API path
still sends `confidence_scores_granularity: "word"` because that path
accepts it; only the Foundry activity strips the field.

The `document_annotation_format` and `document_annotation_prompt` keys are
forwarded server-side; Mistral runs OCR followed by the schema-aware
annotation step in a single call. No client-side two-call orchestration.

## Response shape

Same as the public API (`MistralOcrApiResponse`):

```ts
{
  model: string;
  pages: [{
    index: number;
    markdown: string;
    dimensions: { dpi, width, height };
    confidence_scores?: {
      word_confidence_scores?: [{ text, confidence, start_index, bbox? }];
      line_confidence_scores?: [{ text, confidence, start_index, bbox? }];
      average_page_confidence_score: number;
      minimum_page_confidence_score: number;
    };
    images?: [{ id, top_left_x, top_left_y, bottom_right_x, bottom_right_y, ... }];
  }];
  document_annotation?: string;  // JSON string when document_annotation_format was sent
  usage_info: { pages_processed, doc_size_bytes? };
}
```

The mapper handles both responses transparently — the only Foundry vs
public-API delta currently observed is the deployment id surfaced in
`response.model`.

## Internal preprocessing — what to skip vs keep

> "Significantly more robust to compression artifacts, skew, distortion,
> low DPI, and background noise." — Mistral OCR 3 release notes

Mistral OCR handles **deskew, rotation correction, denoising, low-DPI
recovery, and background noise** internally. The model is page-image-native
and does not expose preprocessing parameters.

Implication for our pipeline:

- The upstream [`apps/backend-services/src/document/pdf-normalization.service.ts`](../../apps/backend-services/src/document/pdf-normalization.service.ts)
  is fine to **leave on** — its primary jobs are PDF→image rendering, page
  splitting, and consistent DPI. Mistral consumes the data URL we hand it,
  so consistent rendering is still useful.
- We should **not** add a separate deskew/rotate/denoise step in front of
  Mistral; that would be redundant work and risk double-rotation artifacts
  on edge cases.

## Confidence values

`confidence_scores_granularity: "word"` is requested explicitly by the
activity. Per-word scores land in `[0, 1]` and feed directly into
`ocr.checkConfidence`. The mapper falls back to
`average_page_confidence_score` and finally `0.95` when no per-word scores
are returned (matches the public-API mapper's behavior).

## Bounding boxes (E02 mapper fix)

The Mistral mapper used to set `polygon: []` for every word/line synthesized
from markdown. E02 patched the mapper to populate the canonical 8-element
polygon from any `bbox` field that lands on `word_confidence_scores[]` or
`line_confidence_scores[]`. The bbox uses the Mistral corner convention
`{top_left_x, top_left_y, bottom_right_x, bottom_right_y}` in the page's
pixel space; the mapper converts that to
`[x1,y1,x2,y1,x2,y2,x1,y2]` (top-left clockwise) to match the rest of
`OCRResult`.

If Mistral's response for a given page does not include bboxes (older
deployments, or responses where granularity wasn't honored), the mapper
falls back to empty polygons — preserving the previous behavior without
hallucinating positions. Embedded-image bboxes in `pages[].images[]` still
flow through unchanged (those carry their own corners and are not converted
into word polygons).

## Mock mode

`MOCK_MISTRAL_AZURE_OCR=true` short-circuits the activity to a synthetic
`OCRResult` (separate flag from the public-API `MOCK_MISTRAL_OCR=true` so
mock-mode for one path does not silently activate on the other). The mock
fixture exercises the bbox population code path so `__fixtures__` consumers
see non-empty polygons under mock mode too.

## Cost / usage telemetry

`usage_info.pages_processed` (and `doc_size_bytes` when present) are
returned on every Foundry response. Cost is billed per the deployment's
Foundry pricing (separate from Mistral's per-account quota for the public
API).

## Activity registration

The activity is registered as `mistralAzureOcr.process` in all three
registries:

- [`apps/temporal/src/activity-registry.ts`](../../apps/temporal/src/activity-registry.ts) — runtime function map (timeout `20m`, 3 retries to absorb Foundry's longer annotation tail).
- [`apps/temporal/src/activity-types.ts`](../../apps/temporal/src/activity-types.ts) — workflow-safe constant list.
- [`apps/backend-services/src/workflow/activity-registry.ts`](../../apps/backend-services/src/workflow/activity-registry.ts) — save-time validation allow-list.

The activity is also exported from `apps/temporal/src/activities.ts` so
Temporal worker registration picks it up.
