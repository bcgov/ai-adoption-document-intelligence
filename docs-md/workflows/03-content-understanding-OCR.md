# Azure AI Content Understanding (CU) provider

E03 lands a new provider folder at
`apps/temporal/src/ocr-providers/azure-content-understanding/` that talks
to Azure AI Content Understanding's REST API. CU is a generative AI
product where you POST a JSON "analyzer" describing your schema, then
submit documents to its analyze endpoint. CU internally:

1. Performs OCR (its own ML-based layout extraction).
2. Sends extracted content + the analyzer schema to the tenant's configured
   generative model (configured at the resource level via
   `PATCH /contentunderstanding/defaults`).
3. Returns structured JSON conforming to the schema, with confidence
   scores and grounding citations.

Pricing splits content-extraction charges (OCR layer) from generative-
model token charges (LLM layer).

## AI Hub configuration and request flow

Set `AZURE_CU_ENDPOINT` to the AI Hub tenant root, such as
`https://test.aihub.gov.bc.ca/sdpr-invoice-automation`, and `AZURE_CU_KEY` to
that tenant's APIM subscription key in the Temporal worker. Compose forwards
these settings; OpenShift uses the worker ConfigMap and Secret, while the
instance deployment workflow reads the same names from GitHub Actions secrets.
Restart the worker after changing them. Set `MOCK_AZURE_CU=true` only for mock
runs. Do not commit credentials.

The client sends `api-key` to APIM (alongside the selected CU authentication
header). APIM uses its managed identity for the CU backend. Requests use API
version `2025-11-01`, under `/contentunderstanding`: analyzer GET/PUT/DELETE,
POST `/analyzers/{id}:analyze`, and GET `/analyzerResults/{id}`. The Hub
returns the `Operation-Location` header on the gateway; some responses omit
the tenant path. Polling validates the gateway and result path and applies the
configured tenant prefix exactly once.

Custom analyzers use the CU account's model defaults. Enabling the tenant in
infrastructure does not prove those defaults have been applied. Check
`/internal/tenant-info` and `/contentunderstanding/defaults`, and if needed
apply the tenant's published `services.content_understanding.model_deployments`
using a merge-patch request. The existing `scripts/setup-cu-defaults.ts`
reads that published map before PATCH; its optional deployment overrides
still apply. This changes shared tenant configuration, so coordinate with the
Hub owner before running it. Prebuilt layout/read analyzers need no defaults.

Analyzer IDs are sanitized to lowercase alphanumeric and include the group
prefix. See [AI Hub CU documentation](https://bcgov.github.io/ai-hub-tracking/services.html)
for current setup and service details.

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

One activity is registered in all three registries (per
`ADDING_OCR_PROVIDERS.md`), and the step catalog describes it, so the
workflow builder offers it as **Analyze with Content Understanding**:

- **`azureContentUnderstanding.analyze`** — submits one document, polls
  the operation, persists the mapped result and raw response in group-scoped
  blob storage, and returns `{ ocrResult, ocrResponse }` references. When a
  `templateModelId` is supplied, it first deploys the analyzer built from the
  template's fields (below). An explicit `analyzerId` parameter must be an
  Azure `prebuilt-*` analyzer or one of the group's own analyzers. Default
  timeout 20 min, retry policy **30 attempts × 15 s × 1.5x × 60 s cap**
  (the LLM layer can be slower than OCR-only paths).

Deploying is a helper the analyze activity calls directly
(`azureCuDeployAnalyzer` in `azure-cu-deploy-analyzer.ts`), not an activity a
workflow can use: an idempotent PUT against `/analyzers/{id}`. It GETs first
and skips the PUT when the deployed body matches, and an in-memory cache keyed
on `analyzerId + bodyHash` short-circuits repeats. The CU resource is shared by
every group, so it only deploys analyzer ids that start with the running
workflow's group prefix (`{prefix}{groupId}`, sanitised).

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
  [`apps/temporal/scripts/iterate-cu-extraction.ts`](../../apps/temporal/scripts/iterate-cu-extraction.ts)
  hits CU once for one sample and writes a per-field diff so prompt
  tweaks can be validated without burning a 40-sample run. It deploys
  the analyzer under the template model's group prefix, the same id the
  workflow uses.

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
