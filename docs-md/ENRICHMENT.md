# OCR Enrichment

The OCR workflow supports an optional **enrichment** step that runs after post-OCR cleanup and before confidence checking. Enrichment uses a document type (LabelingProject) to apply type-aware rules and optionally call an LLM to improve low-confidence fields.

## Overview

- **When it runs**: After post-OCR cleanup and before confidence checking. In a graph workflow, add an `ocr.enrich` activity node between cleanup and the confidence-check node (the standard OCR template may not include it by default).
- **Configuration**: The step is **disabled by default**. Enable it and set `documentType` (LabelingProject ID) in the workflow step parameters (e.g. `steps.enrichResults.parameters` in step-based config, or the enrich node’s parameters in a graph).
- **Data used**: Field schema from the LabelingProject (`field_schema`: field_key, field_type, field_format) is used to apply rules per field type.

## Step configuration

Configure the step via workflow input `steps.enrichResults`:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentType` | string | Yes (when step enabled) | LabelingProject ID. Used to load field_schema for rule application. |
| `confidenceThreshold` | number | No | Default `0.85`. Fields with confidence below this are candidates for LLM enrichment. |
| `enableLlmEnrichment` | boolean | No | Default `false`. When true, low-confidence fields are sent to Azure OpenAI for correction. |

Example workflow input with enrichment enabled:

```json
{
  "documentId": "...",
  "binaryData": "...",
  "steps": {
    "enrichResults": {
      "enabled": true,
      "parameters": {
        "documentType": "<LabelingProject-id>",
        "confidenceThreshold": 0.85,
        "enableLlmEnrichment": true
      }
    }
  }
}
```

## Generic rules

Rules are applied based on field type from the LabelingProject field schema:

- **trimWhitespace**: Applied to all fields. Trims leading/trailing whitespace from keys and values.
- **fixCharacterConfusion**: Applied to date and number fields. Fixes common OCR confusions (e.g. O→0, l→1, S→5).
- **normalizeDates**: Applied to date fields. Parses and normalizes to ISO date (YYYY-MM-DD) when possible.
- **normalizeNumbers**: Applied to number fields. Strips currency symbols and normalizes decimal/thousands separators.

Rules run on both prebuilt-model `keyValuePairs` and custom-model `documents[].fields`.

## LLM enrichment (optional)

When `enableLlmEnrichment` is true and there are fields with confidence below `confidenceThreshold`, the activity:

1. Sends the full extracted text and the low-confidence fields (key, value, expected type, confidence) to Azure OpenAI.
2. Asks the model to return corrected values and a **summary of changes** in structured JSON.
3. Merges corrected values back into the OCR result.
4. Persists the summary (and per-field changes) in `OcrResult.enrichment_summary` for HITL review.

### Environment variables (Temporal worker)

| Variable | Description |
|----------|-------------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint (e.g. `https://your-resource.openai.azure.com`). |
| `AZURE_OPENAI_API_KEY` | API key for the Azure OpenAI resource. |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (e.g. `gpt-4o`). |
| `AZURE_OPENAI_API_VERSION` | Optional. Default `2024-12-01-preview`. |
| `ENRICHMENT_REDACT_PII` | Optional. Set to `true` to redact PII (SIN, phone, dollar amounts) in the **extracted text** sent as context. Use when the gateway returns **503 PiiRedactionUnavailable**: the request content triggers Azure’s PII redaction; redacting locally can avoid that path. Field values are not redacted so the model can still return corrections. |

### Request body sanitization

The Azure OpenAI API uses a strict JSON parser that can reject the request with "JSON decode error" / "Invalid escape" when the request body contains certain escape sequences (e.g. `\n` at position 3239). To avoid this:

1. **Backslashes** are stripped only from the data (`extractedText` and each field's `fieldKey`, `value`, `expectedType`) in `buildEnrichmentUserMessage`, so the embedded fields JSON keeps valid `\"` escapes.
2. **Newlines and other control characters** (`\n`, `\r`, `\t`, `\f`, `\b`) in the system and user message content are replaced with spaces via `stripNewlinesAndControl()` before building the payload, so the serialized body does not contain `\n`, `\r`, `\t`, etc.

The payload is pre-serialized and sent.

### Troubleshooting LLM errors (400 Bad Request)

When the activity logs `llm_error` with "Request failed with status code 400", the thrown error message includes Azure’s response body so you can see the exact reason. Common causes:

- **Invalid response_format**: The deployment or API version may not support `response_format: { type: 'json_object' }`. Try a newer API version (e.g. `2024-12-01-preview` or `2025-03-01-preview`) or a model that supports structured JSON output.
- **Deployment not found**: Ensure `AZURE_OPENAI_DEPLOYMENT` matches the deployment name in Azure (e.g. `gpt-4o`). The name is case-sensitive.
- **Wrong endpoint**: Use the Azure OpenAI resource endpoint (e.g. `https://your-resource.openai.azure.com`), not the Document Intelligence endpoint.
- **API version**: If unspecified, the code uses `2024-12-01-preview`. Set `AZURE_OPENAI_API_VERSION` if your deployment requires a different version.

**503 PiiRedactionUnavailable**: The request body (full document text and/or field values) contains PII, so the gateway routes it through the PII redaction service. When that service is unavailable, the request is blocked. Set `ENRICHMENT_REDACT_PII=true` to redact common PII patterns in the extracted text before sending; if the 503 persists, the gateway may also be triggered by field values, or you may need to disable PII redaction on the Azure resource.

After changing env vars, restart the Temporal worker.

### LLM response format

The model must respond with JSON in this shape:

```json
{
  "correctedValues": { "<fieldKey>": "<corrected value>", ... },
  "summary": "Short human-readable summary of changes.",
  "changes": [
    { "fieldKey": "...", "originalValue": "...", "correctedValue": "...", "reason": "..." }
  ]
}
```

The **summary** is stored and shown in the HITL review UI so reviewers can see what the LLM changed.

## Enrichment summary in HITL review

When enrichment (rules and/or LLM) runs, a summary is stored in `OcrResult.enrichment_summary` and exposed to the review session API. The structure includes:

- `summary`: Overall human-readable summary (from LLM when used, or generated from rules).
- `changes`: Per-field changes (original value, corrected value, reason, source: `rule` or `llm`).
- `rulesApplied`: List of rule names that ran (e.g. trimWhitespace, normalizeDates).
- `llmEnriched`: Whether the LLM was used.
- `llmModel`: Azure OpenAI deployment name when LLM was used.
- `timestamp`: ISO timestamp.

The review UI displays the summary panel and uses it to show corrected values in the Fields list: when `enrichment_summary.changes` exists, each field’s displayed value is the correction from the summary when available (after any reviewer correction, before raw stored value), so reviewers see the enriched result even if the stored OCR result predates the enrichment or uses different field keys.

## Merging behavior

- **Rules**: Applied in order (trim → fixCharacterConfusion → normalizeDates or normalizeNumbers) and overwrite values in place.
- **LLM**: Corrected values from the LLM are merged over the rule-enriched result; overlay wins by field key. Custom model document fields are updated when the LLM returns corrections for those keys.

When persisting to the database, the stored field object sets **valueString** from the (enriched) content so that the UI—which prefers `valueString` over `content` for display—shows the corrected value.

## Related files

- **Temporal**: `apps/temporal/src/activities.ts` (exports enrichResults, upsertOcrResult), `apps/temporal/src/activities/enrich-results.ts`, `apps/temporal/src/activities/enrich-results.test.ts`, `apps/temporal/src/activities/enrichment-rules.ts`, `apps/temporal/src/activities/enrichment-llm.ts`, `apps/temporal/src/activity-registry.ts` (ocr.enrich), `apps/temporal/src/types.ts`.
- **Schema**: `apps/shared/prisma/schema.prisma` (OcrResult.enrichment_summary).
- **Backend**: `apps/backend-services/src/hitl/hitl.service.ts` (session response includes enrichment_summary).
- **Frontend**: `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` (enrichment summary panel).
