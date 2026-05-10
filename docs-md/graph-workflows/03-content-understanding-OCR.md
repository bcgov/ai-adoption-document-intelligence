# Azure AI Content Understanding (CU) provider

E03 lands a new provider folder at
`apps/temporal/src/ocr-providers/azure-content-understanding/` that talks
to Azure AI Content Understanding's REST API. CU is a generative AI
product where you POST a JSON "analyzer" describing your schema, then
submit documents to its analyze endpoint. CU internally:

1. Performs OCR (its own ML-based layout extraction).
2. Sends extracted content + the analyzer schema to a generative model
   (GPT-5.2 / GPT-4.1-mini, configured at the resource level via
   `PATCH /contentunderstanding/defaults`).
3. Returns structured JSON conforming to the schema, with confidence
   scores and grounding citations.

Pricing splits content-extraction charges (OCR layer) from generative-
model token charges (LLM layer).

## Endpoint, auth, request/response shape

| | Public CU REST API | This experiment |
|---|---|---|
| Base URL | `https://<resource>.cognitiveservices.azure.com/contentunderstanding/...` | same |
| API version | `2025-11-01` | same |
| Auth | `Ocp-Apim-Subscription-Key: <AZURE_CU_KEY>` (default) or `Authorization: Bearer <token>` | the activity defaults to `Ocp-Apim-Subscription-Key`; `AZURE_CU_AUTH_MODE=bearer` switches to the Foundry-style header |
| Analyzer upsert | `PUT /analyzers/{analyzerId}?api-version=2025-11-01` | same; the deploy activity skips PUT when an existing analyzer matches the desired body |
| Analyze submit | `POST /analyzers/{analyzerId}:analyze?api-version=2025-11-01` body `{ inputs: [{ url: <data-url> }] }` → `202 + Operation-Location` | same; the activity polls `Operation-Location` every 1.5 s until terminal |
| Analyze poll | `GET /analyzerResults/{request-id}?api-version=2025-11-01` | same |
| **Analyzer ID constraint** | alphanumeric only | **CU rejects `-` in `analyzerId` with HTTP 400 `InvalidAnalyzerId`. We sanitise `${AZURE_CU_ANALYZER_PREFIX}-${templateModelId}` to lowercase alphanumeric, dropping all separators.** |
| **Defaults pre-flight** | required before any analyzer can be deployed | `PATCH /contentunderstanding/defaults` must wire the `gpt-5.2`, `gpt-4.1-mini`, and `text-embedding-3-large` aliases to actual deployment names; without it, PUT analyzer fails with `DefaultsNotSet`. **One-time setup** at the resource level; the iteration script does NOT do this for you. |

## Analyzer JSON schema vocabulary

CU's analyzer body shape (per [Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/tutorial/create-custom-analyzer)):

```json
{
  "description": "<global instruction text — equivalent to Mistral's document_annotation_prompt>",
  "baseAnalyzerId": "prebuilt-document",
  "config": {
    "returnDetails": true,
    "estimateFieldSourceAndConfidence": true
  },
  "fieldSchema": {
    "fields": {
      "<field_key>": {
        "type": "string|number|date|object|array",
        "method": "extract|classify|generate",
        "description": "<per-field disambiguation text>",
        "enum": ["selected", "unselected"]      // when method=classify
      }
    }
  }
}
```

Field-type vocabulary mapping (our `FieldType` → CU `type` + `method`):

| Our `field_type` | CU `type` | CU `method` | Notes |
|---|---|---|---|
| `string` | `string` | `extract` | |
| `number` | `number` | `extract` | nullable via per-field description hint (see below) |
| `date` | `date` | `extract` | |
| `selectionMark` | `string` | `classify` | `enum: ["selected","unselected"]` |
| `signature` | `string` | `extract` | CU has no signature primitive — string field with the prompt explaining "cursive/initial mark" |

**Numeric nullability.** CU's analyzer schema does **not** expose a JSON
Schema-style `["number","null"]` union. Instead, `numericFieldsNullable:
true` on the analyzer-schema-builder appends a normative sentence to each
numeric field's `description`: *"If the cell is completely blank, return
null. Only return 0 if the cell explicitly shows a literal 0 / $0."* The
generative pass interprets the description and emits `null` for blanks —
verified during E03's iteration step.

## Activities

Two activities are registered in all three registries (per
`ADDING_OCR_PROVIDERS.md`):

- **`azureContentUnderstanding.deployAnalyzer`** — idempotent PUT against
  `/analyzers/{id}`. GETs first; skips PUT when the deployed body
  matches. In-memory cache keyed on `analyzerId + bodyHash` short-circuits
  repeats. Default timeout 2 min, 3 retries.

- **`azureContentUnderstanding.analyze`** — submits one document, polls
  the operation, returns `{ ocrResult, cuResponse }`. Calls
  `deployAnalyzer` first when a `templateModelId` is supplied. Default
  timeout 20 min, retry policy **30 attempts × 15 s × 1.5x × 60 s cap**
  (mirrors `mistralAzureOcr.process` because the Foundry RPM quota model
  applies — and the LLM layer can be slower than OCR-only paths).

Mock mode for tests: set `MOCK_AZURE_CU=true` and the activity returns a
canned response without hitting the network.

## Confidence + bounding boxes

CU returns a per-field `confidence` ∈ [0,1] when
`config.estimateFieldSourceAndConfidence: true`. The mapper computes a
page-level confidence as the mean of per-field confidences (falls back to
0.95 when no confidences are present, matching the Mistral fallback so
the default 0.95 threshold in `ocr.checkConfidence` behaves consistently
across providers).

CU does not return per-word/per-line bounding-box polygons in its
`contents[*].fields[*]` shape — the grounding info is a `source`
descriptor + `spans` (offset/length into the markdown). The mapper
synthesises a single Word per page from the markdown with empty polygon,
matching the Mistral fallback pattern. Words with real polygons are
exposed for engines that emit them (E05's hybrid will).

## Confidence-distribution observations

See `experiments/results/03-content-understanding/SUMMARY.md` for the
observed distribution on the 40-sample dataset and how it compares to E01
(Neural DI) and E02 (Mistral on Foundry).

## Production-grade prompts

Bare schemas with `field_keys` only consistently underperform on
generative engines. The canonical pattern (E02 standard, applied here):

- A global instruction string set as the analyzer's top-level
  `description` (the form's structure, blank-vs-zero conventions,
  signature-vs-name distinction, etc.).
- A per-field `description` overlay attached to each property in the
  analyzer's `fieldSchema.fields`.
- Both live in
  [`experiments/results/03-content-understanding/iteration/`](../../experiments/results/03-content-understanding/iteration/)
  (`prompt.md` + `field-descriptions.json`) and are embedded into the
  workflow JSON's activity `parameters` (`documentAnnotationPrompt`,
  `fieldDescriptions`, `numericFieldsNullable: true`) for the benchmark.
- Iteration script:
  [`apps/temporal/src/scripts/iterate-cu-extraction.ts`](../../apps/temporal/src/scripts/iterate-cu-extraction.ts)
  hits CU once for one sample and writes a per-field diff so prompt
  tweaks can be validated without burning a 40-sample run.

## Engine-internal preprocessing

CU's content-extraction layer handles deskew, rotation, and basic image
quality issues internally. The upstream
`apps/backend-services/src/document/pdf-normalization.service.ts` step
(PDF → image rendering, DPI normalisation) stays on; no separate deskew
step is required.

## Cost / usage telemetry

CU's response includes (or can include) usage counters at the
`result.contents[*]` level — pages processed for the OCR layer + token
counts for the generative layer. The activity logs the per-call duration
and the count of populated fields; the cross-engine cost-comparison
deferred to the post-E05 follow-up.

## Cross-engine audit follow-through

Parent-branch
[`docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md`](../EXTRACTION_PROVIDER_ARCHITECTURE.md)
lists gaps in existing engines. CU is the third engine to land; any
shared-concern gaps surfaced during E03 are documented in the SUMMARY.md
retrospective rather than silently fixed.
