# Mistral Document AI OCR

This document describes the Temporal activity `mistralOcr.process`, environment configuration, and how Mistral responses map to the canonical `OCRResult` type used by the rest of the pipeline (cleanup, confidence scoring, HITL, storage).

For adding future providers, see [`ADDING_OCR_PROVIDERS.md`](./ADDING_OCR_PROVIDERS.md).

## Activity type

- **Type string**: `mistralOcr.process`
- **Implementation**: [`apps/temporal/src/activities/mistral-ocr-process.ts`](../../apps/temporal/src/activities/mistral-ocr-process.ts)
- **Input**: `{ fileData: PreparedFileData; templateModelId?: string; documentAnnotationPrompt?: string }` — same `file.prepare` output as the Azure workflow; `modelId` should be a Mistral OCR model name (default `mistral-ocr-latest`). Optional **`templateModelId`**: a `TemplateModel.id` (labeling project). When set, the activity loads that model’s `field_schema` from the database and sends Mistral’s `document_annotation_format` (JSON Schema) plus optional **`documentAnnotationPrompt`** on `POST /v1/ocr`. If the template is missing or has no fields, the run continues as OCR-only (no annotation). **`documentAnnotationPrompt`** can be set on the graph node `parameters` (merged after port inputs) for a static instruction string.
- **Output**: `{ ocrResult: OCRResult }`

The Mistral OCR HTTP API is synchronous (`POST /v1/ocr`). There is no separate poll or extract step.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `MISTRAL_API_KEY` | Bearer token for `https://api.mistral.ai/v1/ocr` |
| `MOCK_MISTRAL_OCR` | Set to `true` to return a deterministic mock `OCRResult` without calling Mistral (useful for CI and local wiring tests) |

Add these to the Temporal worker environment (see [`apps/temporal/.env.sample`](../../apps/temporal/.env.sample)). Do not commit real API keys; set the key locally (e.g. a team member’s key for development).

## Upload / document `model_id`

`GET /api/models` lists **Azure Document Intelligence** prebuilts and **trained** model ids (e.g. `prebuilt-layout`, `km-2`). Those values are stored on the document and passed into the graph as `modelId`.

**Mistral’s OCR API only accepts Mistral model names** (e.g. `mistral-ocr-latest`, `mistral-ocr-2505`). The `mistralOcr.process` activity **ignores** non-Mistral ids and uses **`mistral-ocr-latest`** when `model_id` does not start with `mistral-ocr` (see `resolveMistralOcrModelId` in the activity). So you do **not** need a separate upload option for Mistral—any Azure/trained selection still runs Mistral OCR with the default model unless you pass a `mistral-ocr-*` name.

To **force** a specific Mistral OCR variant, ensure the document’s `model_id` is that name (e.g. via API update) or override `modelId` in workflow context when starting OCR.

## Template model id and document metadata

To drive **structured document annotation** (Mistral `document_annotation` → `OCRResult.keyValuePairs`), set **`templateModelId`** on the workflow **initial context**. The backend OCR service copies it from the document’s JSON **`metadata`** when present:

- Upload (or update document) with `metadata: { "templateModelId": "<TemplateModel.id>" }` (see [`upload-document.dto.ts`](../../apps/backend-services/src/upload/dto/upload-document.dto.ts) `metadata`).

The Mistral standard graph template declares **`ctx.templateModelId`** and binds it into the `mistralOcr` node. You can set a workflow-wide default with **`ctx.templateModelId.defaultValue`** in the graph JSON (applied by `initializeContext` before `initialCtx` is merged). If **`metadata.templateModelId`** is present on the document when OCR starts, the backend adds it to **`initialCtx`** and it **overrides** that default.

Annotation is an extra LMM step on Mistral’s side (see Mistral docs); expect additional latency and cost when a schema is sent.

## Sample graph template

[`mistral-standard-ocr-workflow.json`](templates/mistral-standard-ocr-workflow.json) mirrors the Standard OCR workflow after `file.prepare`: Mistral OCR → `ocr.cleanup` → `ocr.checkConfidence` → review switch / `humanGate` → `ocr.storeResults`.

After `npm run db:seed` (from `apps/shared` or your usual seed command), a workflow row is created with id **`seed-workflow-standard-ocr-mistral`** and this config, so you can attach documents to it like the Azure standard seed workflow.

## Normalization and provider metadata

- Raw Mistral JSON is converted in [`apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`](../../apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts). When **`templateModelId`** is set, the activity loads the same **`field_schema`** used for `document_annotation_format` and maps **`document_annotation`** into:
  - **`OCRResult.documents[0].fields`**: Azure custom-model–shaped field objects (`type`, `content`, `valueString`, `valueNumber`, `valueDate`, `valueSelectionMark`, …) per [`mistral-annotation-to-azure-fields.ts`](../../apps/temporal/src/ocr-providers/mistral/mistral-annotation-to-azure-fields.ts). This matches how **`ocr.storeResults`** / the document viewer prefer **`documents[0].fields`** over plain key–value pairs (same path as Azure custom models).
  - **`OCRResult.keyValuePairs`**: derived display strings via [`extractAzureFieldDisplayValue`](../../apps/temporal/src/azure-ocr-field-display-value.ts) so **`ocr.enrich`**, benchmarks (`buildFlatPredictionMapFromCtx`), and LLM merge behave like the Azure pipeline.
- If **`templateModelId`** is omitted or the template has no usable schema, annotation is skipped and those structures are empty from Mistral.
- Without a template, any **`document_annotation`** still maps to string-only **`keyValuePairs`** (legacy path).
- Field schema → Mistral request format is built in [`apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`](../../apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts).

### Optional enrichment (`ocr.enrich`) — same as Azure

To apply **trim / character confusion / date–number normalization** from the labeling **`field_schema`** (same mechanism as [`docs-md/ENRICHMENT.md`](../ENRICHMENT.md)), add an **`ocr.enrich`** node after **`ocr.cleanup`** and set **`parameters.documentType`** to the same **`TemplateModel.id`** as **`templateModelId`**. That reuses the enrichment pipeline used for Azure OCR improvement workflows; correction nodes (`ocr.normalizeFields`, …) also use the same **`documentType`** / `field_schema` contract.

- The canonical shape is [`OCRResult`](../../apps/temporal/src/types.ts). Mistral is **markdown-oriented** per page; Azure is layout-oriented (words, lines, key-value pairs). After normalization, downstream activities stay generic.
- `apimRequestId` on `OCRResult` is reused as an opaque correlation id (`mistral-<uuid>`) for logs and tracing; it is not an Azure APIM header.

### Confidence scores

The activity requests `confidence_scores_granularity: "word"` so `ocr.checkConfidence` can average per-word scores when the API returns `word_confidence_scores`. If word scores are missing, the mapper falls back to page-level averages or a single synthetic word per page.

## Caching

There is no built-in cache of Mistral OCR responses in this repository; Temporal retries may re-invoke the activity. A future optimization could key cache entries by content hash, provider, and model (e.g. object storage or Redis with TTL).

## Human-in-the-loop (HITL)

No new node types are required. The same `switch` + `humanGate` pattern as the Standard OCR template applies once `ocr.checkConfidence` and `requiresReview` are populated from normalized word confidences.
