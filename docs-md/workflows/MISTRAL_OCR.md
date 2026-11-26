# Mistral Document AI OCR

This document describes the Temporal activity `mistralOcr.process`, environment configuration, and how Mistral responses map to the canonical `OCRResult` type used by the rest of the pipeline (cleanup, confidence scoring, HITL, storage).

For adding future providers, see [`ADDING_OCR_PROVIDERS.md`](./ADDING_OCR_PROVIDERS.md).

## Activity type

- **Type string**: `mistralOcr.process`
- **Implementation**: [`apps/temporal/src/activities/mistral-ocr-process.ts`](../../apps/temporal/src/activities/mistral-ocr-process.ts)
- **Input**: `{ fileData: PreparedFileData; templateModelId?: string; documentAnnotationPrompt?: string }`. The optional template ID selects a group-scoped labeling schema for structured annotation; the optional prompt provides a static instruction. `modelId` selects a `mistral-document-ai-*` deployment.
- **Output**: `{ ocrResult: OCRResult }`

The Hub API is synchronous: `POST {endpoint}/providers/mistral/azure/ocr`. There is no separate poll or extract step.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `MISTRAL_DOC_AI_AZURE_ENDPOINT` | AI Hub tenant root URL |
| `MISTRAL_DOC_AI_AZURE_KEY` | AI Hub tenant APIM subscription key |
| `MOCK_MISTRAL_AZURE_OCR` | Set to `true` for deterministic mock OCR without a service call |

Set these in the Temporal worker environment. The subscription key is sent in both the `api-key` and authorization headers. Compose passes both settings to the worker. In OpenShift, use the worker ConfigMap for the endpoint and the worker Secret for the key. Instance deployment accepts the same names; the GitHub deployment workflow reads them from Actions secrets. Do not commit keys.

## Upload / document `model_id`

The activity accepts `mistral-document-ai-*` deployment IDs and otherwise defaults to `mistral-document-ai-2512`, including for older public Mistral and Azure model IDs. Override `modelId` in the workflow context or document to select a different deployment. Existing `variant` values no longer select a different transport: all Mistral workflows use the Hub.

## Template model id and document metadata

To drive **structured document annotation** (Mistral `document_annotation` → `OCRResult.keyValuePairs`), set **`templateModelId`** on the workflow **initial context**. The backend OCR service copies it from the document’s JSON **`metadata`** when present:

- Upload (or update document) with `metadata: { "templateModelId": "<TemplateModel.id>" }` (see [`upload-document.dto.ts`](../../apps/backend-services/src/upload/dto/upload-document.dto.ts) `metadata`).

The Mistral standard graph template declares **`ctx.templateModelId`** and binds it into the `mistralOcr` node. You can set a workflow-wide default with **`ctx.templateModelId.defaultValue`** in the graph JSON (applied by `initializeContext` before `initialCtx` is merged). If **`metadata.templateModelId`** is present on the document when OCR starts, the backend adds it to **`initialCtx`** and it **overrides** that default.

Annotation is an extra LMM step on Mistral’s side (see Mistral docs); expect additional latency and cost when a schema is sent.

## Sample graph template

[`mistral-standard-ocr-workflow.json`](../../packages/graph-workflow/templates/mistral-standard-ocr-workflow.json) mirrors the Standard OCR workflow after `file.prepare`: Mistral OCR → `ocr.cleanup` → `ocr.checkConfidence` → review switch / `humanGate` → `ocr.storeResults`.

After `npm run db:seed` (from `apps/shared` or your usual seed command), a workflow row is created with id **`seed-workflow-standard-ocr-mistral`** and this config, so you can attach documents to it like the Azure standard seed workflow.

## Normalization and provider metadata

- Raw Mistral JSON is converted in [`apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`](../../apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts). When **`templateModelId`** is set, the activity loads the same **`field_schema`** used for `document_annotation_format` and maps **`document_annotation`** into:
  - **`OCRResult.documents[0].fields`**: Azure custom-model–shaped field objects (`type`, `content`, `valueString`, `valueNumber`, `valueDate`, `valueSelectionMark`, …) per [`mistral-annotation-to-azure-fields.ts`](../../apps/temporal/src/ocr-providers/mistral/mistral-annotation-to-azure-fields.ts). This matches how **`ocr.storeResults`** / the document viewer prefer **`documents[0].fields`** over plain key–value pairs (same path as Azure custom models).
  - **`OCRResult.keyValuePairs`**: derived display strings via [`extractAzureFieldDisplayValue`](../../apps/temporal/src/azure-ocr-field-display-value.ts) so **`ocr.enrich`**, benchmarks (`buildFlatPredictionMapFromCtx`), and LLM merge behave like the Azure pipeline.
- For `selectionMark` fields, annotation mapping normalizes common checkbox outputs to Azure-compatible values (`selected` / `unselected`). This includes booleans (`true`/`false`), textual variants (`checked`, `unchecked`, `yes`, `no`, `on`, `off`, `1`, `0`), and common glyphs (`☑`, `☐`, `✓`, `✔`, `✗`, `✘`).
- If **`templateModelId`** is omitted or the template has no usable schema, annotation is skipped and those structures are empty from Mistral.
- Without a template, any **`document_annotation`** still maps to string-only **`keyValuePairs`** (legacy path).
- Field schema → Mistral request format is built in [`apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`](../../apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts).
  - `selectionMark` fields are emitted as JSON Schema string enums: `["selected", "unselected"]` so annotation output is constrained at schema level.

### Optional enrichment (`ocr.enrich`) — same as Azure

To apply **trim / character confusion / date–number normalization** from the labeling **`field_schema`** (same mechanism as [`docs-md/extraction/ENRICHMENT.md`](../extraction/ENRICHMENT.md)), add an **`ocr.enrich`** node after **`ocr.cleanup`** and set **`parameters.documentType`** to the same **`TemplateModel.id`** as **`templateModelId`**. That reuses the enrichment pipeline used for Azure OCR improvement workflows; correction nodes (`ocr.normalizeFields`, …) also use the same **`documentType`** / `field_schema` contract.

- The canonical shape is [`OCRResult`](../../apps/temporal/src/types.ts). Mistral is **markdown-oriented** per page; Azure is layout-oriented (words, lines, key-value pairs). After normalization, downstream activities stay generic.
- `apimRequestId` on `OCRResult` is reused as an opaque correlation id (`mistral-<uuid>`) for logs and tracing; it is not an Azure APIM header.

### Confidence scores

The Hub does not accept `confidence_scores_granularity`. If word scores are missing, the mapper falls back to page-level averages or a single synthetic word per page.

## Caching

There is no built-in cache of Mistral OCR responses in this repository; Temporal retries may re-invoke the activity. A future optimization could key cache entries by content hash, provider, and model (e.g. object storage or Redis with TTL).

## Human-in-the-loop (HITL)

No new node types are required. The same `switch` + `humanGate` pattern as the Standard OCR template applies once `ocr.checkConfidence` and `requiresReview` are populated from normalized word confidences.
