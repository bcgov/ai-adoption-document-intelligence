# Mistral Document AI in Workflows — OCR, Schema-Guided Extraction & Benchmarks

> **Status**: Implemented (initial iteration)  
> **Feature**: `mistral-ocr-document-annotation`  
> **Feature docs folder**: `feature-docs/20260417190215-mistral-document-ai-workflows/`  
> **Last Updated**: 2026-04-17

## Document purpose

This specification defines how **Mistral Document AI** (Mistral’s document OCR API plus optional **structured extraction** using a **JSON Schema** sent as `document_annotation_format`) is integrated into the platform’s **DAG graph workflows**, how **`TemplateModel.field_schema`** is mapped to that schema, and how **benchmark runs** execute the **same** `graphWorkflow` path so evaluations can include Mistral **document_annotation** when configured.

**Audience**: engineers implementing or extending Temporal activities, graph templates, backend OCR entrypoints, benchmarking, and QA writing tests against this behavior.

**Cross-reference**: Platform-wide benchmarking lives in [`feature-docs/003-benchmarking-system/REQUIREMENTS.md`](../003-benchmarking-system/REQUIREMENTS.md). This document covers only the **Mistral + template schema + graph context** slice.

---

## 0. Conceptual alignment

| Concept | Meaning in this platform |
|--------|---------------------------|
| **Mistral Document AI in a workflow** | A workflow is a `GraphWorkflowConfig` executed by **`graphWorkflow`**. The **Mistral OCR** activity (`activityType`: **`mistralOcr.process`**) performs a synchronous **`POST https://api.mistral.ai/v1/ocr`**. Without a template, the request omits annotation fields and the response is **markdown/text OCR** (per Mistral). With a **`templateModelId`** in context, the activity loads **`field_schema`**, builds **`document_annotation_format`**, and may add **`document_annotation_prompt`**, so Mistral can return **`document_annotation`** (JSON string) alongside OCR. |
| **Schema for Mistral** | The schema is **not** a user-uploaded file in this iteration. It is **derived at runtime** from **`TemplateModel.field_schema`** (ordered field definitions) and sent as **`document_annotation_format`** with `type: "json_schema"`. The workflow context key **`templateModelId`** (a **`TemplateModel.id`**) selects which template’s fields to use. |
| **Benchmarks with a Mistral workflow** | **`benchmarkExecuteWorkflow`** runs **`graphWorkflow`** as a **child** with the benchmark’s **`workflowConfig`** and an **`initialCtx`** that **spreads `sample.metadata`** from the dataset manifest (see §8). To score structured extraction, the benchmark graph must include **`mistralOcr`** with **`templateModelId`** wired from **`ctx`**, and samples that need annotation must supply **`templateModelId`** on **`metadata`**. |

---

## 1. Goals and scope

### 1.1 Problem statement

Mistral’s OCR API can return **`document_annotation`** (a JSON string) when the request includes **`document_annotation_format`** describing the desired fields. The platform already stores **field definitions** per **`TemplateModel`** (`field_schema`). Without integration, Mistral runs as **OCR-only** for the Mistral path and **`OCRResult.keyValuePairs`** stays empty from annotation—downstream **upsert**, storage, and UI cannot show template-aligned fields from Mistral alone.

**Post-OCR enrichment** (`ocr.enrich`) may use the same logical template via **`documentType`**, but it runs **after** OCR on an existing **`OCRResult`**; it does **not** replace provider-side **`document_annotation`**.

### 1.2 Objectives

1. **Graph node**: Expose Mistral OCR as a **registered activity** (`mistralOcr.process`) with inputs compatible with **`file.prepare`** output and optional **`templateModelId`** / **`documentAnnotationPrompt`**.
2. **Schema wiring**: When **`templateModelId`** resolves to a non-empty **`field_schema`**, include **`document_annotation_format`** on **`POST /v1/ocr`**.
3. **Normalization**: Parse **`document_annotation`** and map into canonical **`OCRResult.keyValuePairs`** (Azure-compatible shape) for **`ocr.storeResults`** / viewer.
4. **Graceful degradation**: Missing template, empty schema, DB errors loading the template, or invalid annotation JSON **must not** fail the whole OCR step solely for that reason—**OCR text path still succeeds** where the API returns pages; annotation may be skipped or yield empty pairs.
5. **Context contract**: **`initialCtx.templateModelId`** must be settable for production runs (document metadata, API overrides, or graph defaults) and for benchmarks (per-sample manifest metadata).
6. **Graph templates**: Shipped Mistral standard workflow declares optional **`ctx.templateModelId`** and binds it into the Mistral node.
7. **UI**: Components consuming **`keyValuePairs`** tolerate **null** / missing objects.

### 1.3 Non-goals (this iteration)

- No new **`documents.template_model_id`** FK; use **`documents.metadata.templateModelId`** (string) only.
- No automatic **inference** of **`templateModelId`** from file content or layout.
- No merge of Mistral annotation with **enrich** into a single conceptual step—both may appear in one graph as separate nodes.
- No bespoke per-vendor or per-document-type code paths beyond **`FieldType` → JSON Schema property type** mapping (see §5).

### 1.4 Definitions

| Term | Definition |
|------|------------|
| **`templateModelId`** | Primary key of **`TemplateModel`** (labeling schema). Same id family as enrich **`documentType`**. |
| **`document_annotation_format`** | Mistral request field: wrapper with `type: "json_schema"` and nested JSON Schema for top-level object properties. |
| **`document_annotation`** | Mistral response field: JSON **string** containing an object whose keys align with schema **properties** (when extraction succeeds). |
| **`initialCtx`** | Workflow-scoped context passed into **`graphWorkflow`**; node port bindings read/write **`ctx`** keys. |

---

## 2. Stakeholders and consumers

| Actor | Interest |
|-------|----------|
| **Platform operator** | Configures **`MISTRAL_API_KEY`**, **`MOCK_MISTRAL_OCR`**, timeouts; understands cost/latency of annotation. |
| **Solution developer** | Authors or imports graph JSON; sets **`templateModelId`** on **`ctx`** or document metadata. |
| **Labeling / template admin** | Maintains **`TemplateModel`** and **`field_schema`**; field keys become JSON Schema property names sent to Mistral. |
| **Benchmark author** | Picks a Mistral graph for **`workflowConfig`**; adds **`templateModelId`** to per-sample **`metadata`** when evaluating structured extraction. |
| **Downstream (HITL, review, analytics)** | Consumes normalized **`OCRResult`**; no Mistral-specific types required past **`providerMetadata`**. |

---

## 3. Activity contract (`mistralOcr.process`)

### 3.1 Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **`fileData`** | **`PreparedFileData`** | Yes | Output of **`file.prepare`** (`blobKey`, `fileName`, `fileType`, `contentType`, **`modelId`**, etc.). |
| **`templateModelId`** | `string` | No | If non-empty after trim, activity loads **`TemplateModel`** + **`field_schema`** for **`document_annotation_format`**. |
| **`documentAnnotationPrompt`** | `string` | No | If non-empty after trim, sent as **`document_annotation_prompt`**. Typically from graph node **`parameters`**. |

### 3.2 Outputs

| Field | Type | Description |
|-------|------|-------------|
| **`ocrResult`** | **`OCRResult`** | Canonical result; **`keyValuePairs`** from **`document_annotation`** when parseable; otherwise empty for that path. |

### 3.3 Mistral model resolution

- **`PreparedFileData.modelId`** comes from the document’s **`model_id`** (Azure/trained ids are common).
- Mistral’s OCR endpoint accepts **Mistral OCR model names** (e.g. **`mistral-ocr-latest`**).
- Implementation **SHALL** resolve the model id via a single function (e.g. **`resolveMistralOcrModelId`**): if the stored id **case-insensitively** starts with **`mistral-ocr`**, use it; otherwise use the **default Mistral OCR model** (e.g. **`mistral-ocr-latest`**), and log a **model fallback** event for observability.

### 3.4 HTTP request shape (live calls)

- **URL**: `POST /v1/ocr` on Mistral’s API host.
- **Auth**: `Authorization: Bearer <MISTRAL_API_KEY>`.
- **Body** (conceptual): **`model`**, **`document`** (e.g. **`document_url`** data URL from blob bytes), **`confidence_scores_granularity`** (e.g. **`word`**) for downstream confidence checks.
- **Optional**: **`document_annotation_format`**, **`document_annotation_prompt`**—omitted entirely when not applicable.

### 3.5 Mock mode

- When **`MOCK_MISTRAL_OCR=true`**, the activity **SHALL NOT** call the network; it returns a deterministic **`OCRResult`** suitable for CI/wiring tests.
- Mock payloads **may** omit **`document_annotation`** unless tests explicitly extend the mock to cover annotation mapping.

---

## 4. Field schema → Mistral `document_annotation_format`

### 4.1 Source of truth

- Load **`TemplateModel`** by id; include **`field_schema`** ordered by **`display_order`** ascending (stable ordering for **`required`** arrays).

### 4.2 Property rules

- Each **`field_schema`** row with a **non-empty** trimmed **`field_key`** becomes a **property** in the JSON Schema **`properties`** map.
- **`required`** lists **every** included **`field_key`** (all required from Mistral’s perspective in this mapping).
- **`additionalProperties`**: **`false`** at the object schema level.
- Empty field list after filtering **SHALL** yield **no** **`document_annotation_format`** (OCR-only request).

### 4.3 `FieldType` → JSON Schema type

| `FieldType` | JSON Schema `type` for property |
|-------------|----------------------------------|
| **`number`** | **`number`** |
| **`string`**, **`date`**, **`selectionMark`**, **`signature`** | **`string`** |

**Note**: **`field_format`** may be stored for labeling/enrich; this iteration maps types only—no format-specific JSON Schema **`format`** requirement unless explicitly added later.

### 4.4 Template load failures

- **Missing template**, **empty `field_schema`**, **Prisma errors**, or **builder returns null**: log **`annotation_skip`** with reason; continue **without** **`document_annotation_format`** (OCR-only). **Do not** throw solely for annotation prep failure.

---

## 5. Response handling and `OCRResult` mapping

### 5.1 `document_annotation` parsing

- Treat **`document_annotation`** as **`string | null | undefined`**.
- **Null**, empty, or **invalid JSON** → **no** key-value pairs from annotation (empty array).
- Parsed JSON **must** be a **plain object** (not array); otherwise → empty pairs.
- For each **own property** `[fieldKey, rawValue]`, append a **`KeyValuePair`** with:
  - **Key text**: **`fieldKey`**
  - **Value text**: stringified per rules (string/number/boolean → readable string; objects/arrays → **`JSON.stringify`**)
  - **`confidence`**: **`1`** for annotation-sourced rows (no layout boxes; **`boundingRegions`** / **`spans`** empty arrays)

### 5.2 Coexistence with OCR text

- Markdown/pages and word confidence behavior remain defined in the Mistral → **`OCRResult`** mapper.
- **`providerMetadata`** SHOULD identify Mistral (e.g. **`providerId: "mistral"`**) for logs and support.

### 5.3 API errors

- **4xx/5xx** or network failure from Mistral: activity **SHALL** fail the activity (Temporal retry policy applies per graph node). This is distinct from “skip annotation”—the **HTTP call** failed.

---

## 6. Workflow context and backend integration

### 6.1 Graph template

- **`ctx`** schema **SHOULD** declare **`templateModelId`** as optional string with documentation.
- **`mistralOcr`** node **`inputs`** **SHOULD** bind **`templateModelId`** from **`ctx.templateModelId`**.
- **`documentAnnotationPrompt`** **MAY** be supplied via node **`parameters`** if the graph engine merges parameters into activity inputs.

### 6.2 Production OCR entry (`OcrService.requestOcr`)

- **`initialCtx`** **MUST** include standard fields: **`documentId`**, **`blobKey`**, **`fileName`**, **`fileType`**, **`contentType`**, **`modelId`**, then **`ctxOverrides`** (if any) applied so callers can override thresholds or inject **`templateModelId`**.
- **Intended contract**: **`templateModelId`** for Mistral annotation **SHOULD** come from **`document.metadata.templateModelId`** when operators set it on upload/update. **Recommended implementation**: merge a non-empty string **`metadata.templateModelId`** from the loaded document into **`initialCtx`** before applying **`ctxOverrides`**, so **`ctxOverrides`** can still override or clear it.
- If a deployment only passes **`templateModelId`** via **`ctxOverrides`** (caller reads metadata manually), that remains valid; the merge above reduces duplication.

### 6.3 Benchmark integration

- Orchestrator passes **`sampleMetadata: sample.metadata`** into **`benchmarkExecuteWorkflow`**.
- Activity builds **`initialCtx`** approximately as: **`{ ...sampleMetadata, inputPaths, outputBaseDir, sampleId, documentId, blobKey, fileName, fileType, contentType }`** (exact field set per implementation).
- Therefore **`templateModelId`** on **`sample.metadata`** appears on **`ctx`** for the same bindings as production **when** the graph wires **`ctx.templateModelId`** into **`mistralOcr.process`**.

---

## 7. Functional requirements (summary checklist)

| ID | Requirement |
|----|-------------|
| **FR-1** | Read **`field_schema`** via **`TemplateModel`**, ordered by **`display_order`**. |
| **FR-2** | When **`templateModelId`** resolves to a buildable schema, add **`document_annotation_format`** to **`POST /v1/ocr`**. |
| **FR-3** | When **`documentAnnotationPrompt`** is non-empty, add **`document_annotation_prompt`**. |
| **FR-4** | On missing/empty template or schema build failure, log and send **OCR-only** request (no annotation fields). |
| **FR-5** | Type API responses to include optional **`document_annotation`**. |
| **FR-6** | Map parseable **`document_annotation`** object into **`OCRResult.keyValuePairs`**; malformed → empty pairs, OCR unaffected. |
| **FR-7** | **`initialCtx`** MAY include **`templateModelId`** from document metadata merge and/or **`ctxOverrides`** and/or graph defaults. |
| **FR-8** | Mistral standard template allows **`templateModelId`** to be absent without failing validation. |
| **FR-9** | UI tolerates null/missing **`keyValuePairs`** structures. |
| **FR-10** | Benchmark **`initialCtx`** preserves **`sample.metadata`** keys needed for **`templateModelId`** per §6.3. |
| **FR-11** | Resolve Mistral OCR **`model`** per §3.3 when **`modelId`** is not a Mistral OCR name. |
| **FR-12** | Template DB errors during annotation prep **SHALL** be caught, logged, and downgrade to OCR-only (no throw). |

---

## 8. Benchmarks: end-to-end expectations

1. **Define** a benchmark run with **`workflowConfig`** = a graph that includes **`mistralOcr.process`** and downstream steps you want to measure (e.g. cleanup, store).
2. **Per sample**, set **`metadata.templateModelId`** in the dataset manifest when that sample should run **schema-guided** Mistral extraction.
3. **Evaluate** using the platform’s evaluators (schema-aware when ground truth matches template fields); see benchmarking system requirements for metrics.
4. Samples **without** **`templateModelId`** still run OCR (and the rest of the graph); structured field metrics may be empty or N/A depending on evaluator configuration.

---

## 9. Non-functional requirements

| Area | Requirement |
|------|-------------|
| **Latency** | **`mistralOcr`** node timeouts **SHOULD** reflect large PDFs + annotation (e.g. multi-minute **startToClose** where appropriate). |
| **Security** | **`MISTRAL_API_KEY`** only in worker/backend secrets; never logged or returned to clients. |
| **Observability** | Log **`requestId`**, resolved **`model`**, **`annotation_skip`** reasons, **`model_fallback`** when document **`model_id`** is not Mistral. |
| **Reliability** | Annotation prep **never** blocks OCR on recoverable template issues; Mistral HTTP failures fail the activity explicitly. |
| **Testing** | Unit tests for schema builder, annotation → **`KeyValuePair`** mapping, and activity behavior with mocked HTTP/Prisma; integration tests optional per CI policy. |

---

## 10. Configuration and operations

| Item | Description |
|------|-------------|
| **`MISTRAL_API_KEY`** | Required for live Mistral calls on workers executing **`mistralOcr.process`**. |
| **`MOCK_MISTRAL_OCR`** | **`true`** disables HTTP for local/CI. |
| **Document metadata** | **`metadata.templateModelId`**: string id of **`TemplateModel`**. |
| **Cost / latency** | Annotation increases Mistral-side work; expect higher cost and duration vs OCR-only. |

---

## 11. Relationship to enrichment (`ocr.enrich`)

| Aspect | Mistral `document_annotation` | **`ocr.enrich`** |
|--------|------------------------------|------------------|
| **Phase** | Inside Mistral **`POST /v1/ocr`** | After OCR on **`OCRResult`** |
| **Selector** | **`templateModelId`** / **`ctx`** | **`documentType`** (template id on node) |
| **Output** | Populates **`keyValuePairs`** from provider | Transforms / validates existing result |

Both may reference the same **`field_schema`**; they are **complementary**.

---

## 12. Acceptance criteria (high level)

1. **OCR-only path**: Document with no **`templateModelId`** completes Mistral OCR; **`keyValuePairs`** from annotation empty or absent as designed.
2. **Annotated path**: Document + template with fields yields non-empty **`document_annotation_format`** on request and **`keyValuePairs`** when Mistral returns valid JSON.
3. **Bad template id**: Unknown id → OCR completes without annotation (logged skip).
4. **Bad annotation JSON**: Unparseable **`document_annotation`** → empty pairs; workflow continues if OCR succeeded.
5. **Benchmark**: Sample with **`metadata.templateModelId`** and Mistral graph produces same annotation behavior as production context wiring.

---

## 13. Follow-ups (out of scope here)

- Structured logging / trace flag when **`document_annotation_format`** was attached (support dashboards).
- **`documents.template_model_id`** FK and referential integrity with **`TemplateModel`**.
- Contract tests against live Mistral API for schema rejection (**400**) and error body shapes.
- Caching Mistral responses by content hash (cost/latency optimization).

---

## 14. References (implementation and docs)

| Area | Location |
|------|----------|
| Schema builder | `apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts` |
| Annotation mapper | `apps/temporal/src/ocr-providers/mistral/mistral-annotation-to-key-value-pairs.ts` |
| Response mapping | `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts` |
| Activity | `apps/temporal/src/activities/mistral-ocr-process.ts` |
| API types | `apps/temporal/src/ocr-providers/mistral/mistral-ocr-types.ts` |
| OCR entry / `initialCtx` | `apps/backend-services/src/ocr/ocr.service.ts` |
| Temporal graph start | `apps/backend-services/src/temporal/temporal-client.service.ts` |
| Graph template (example) | `docs-md/graph-workflows/templates/mistral-standard-ocr-workflow.json` |
| Operator docs | `docs-md/graph-workflows/MISTRAL_OCR.md` |
| Benchmark child ctx | `apps/temporal/src/activities/benchmark-execute.ts`, `apps/temporal/src/benchmark-workflow.ts` |
| Enrichment (related) | `docs-md/ENRICHMENT.md`, `apps/temporal/src/activities/enrich-results.ts` |

---

## 15. Feature summary table (legacy quick index)

| # | Feature | Summary |
|---|---------|---------|
| F1 | **Schema builder** | **`field_schema`** → **`document_annotation_format`** (`json_schema` wrapper). |
| F2 | **Annotation → KVP** | **`document_annotation`** string → **`KeyValuePair[]`**. |
| F3 | **Mistral activity** | Load template, optional prompt, Mistral HTTP, normalize **`OCRResult`**. |
| F4 | **Context** | **`templateModelId`** on **`initialCtx`** via metadata merge and/or **`ctxOverrides`** / benchmarks. |
| F5 | **Graph template** | Optional **`ctx.templateModelId`** → Mistral node. |
| F6 | **Viewer** | Defensive null handling for **`keyValuePairs`**. |
| F7 | **Docs & tests** | Operator doc + unit tests for mapper/builder/activity. |
