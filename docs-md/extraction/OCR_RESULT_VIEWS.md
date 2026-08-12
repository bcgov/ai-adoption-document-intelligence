# OCR result views

How extracted OCR output is stored and surfaced to the UI. The stored OCR result
carries both extracted key/value **fields** and a structured **content** blob
(plain text, optional Azure-layout markdown, and per-page content), so the
frontend can offer Extracted / Text / JSON views of the same record.

## Stored shape

`ocr_results.content` (JSONB) is built by the `upsertOcrResult` activity
(`apps/temporal/src/activities/upsert-ocr-result.ts`) from the OCR result
produced by `extract-ocr-results.ts`:

```jsonc
{
  "format": "text" | "markdown",   // ocrResult.contentFormat (defaults to "text")
  "text": "…",                      // joined page/line text
  "markdown": "…",                  // present only for layout markdown output
  "pages": [ { "pageNumber": 1, "content": "…", "lines": [ … ] } ]
}
```

`content` is populated for prebuilt **read / layout / document** models; it is
`JsonNull` when there is no textual content. Extracted fields (for
field-extraction / prebuilt-document models) are stored separately in
`keyValuePairs`, each field stamped with a `valueString` for display.

## API

`GET /api/documents/:documentId/ocr` → `OcrResultResponseDto`
(`DocumentController.getOcrResult`, `apps/backend-services/src/document/document.controller.ts`).
The result DTO (`apps/backend-services/src/document/dto/ocr-result.dto.ts`):

| Field | Notes |
|-------|-------|
| `id`, `document_id`, `processed_at` | Result identity |
| `keyValuePairs` | Extracted fields (nullable) |
| `content` | Structured content blob described above (nullable) |

This endpoint returns `200` with the retained result even for
[ephemeral / purged documents](../architecture/EPHEMERAL_DOCUMENT_CLEANUP.md) —
only the source blobs are removed, not `ocr_results`.

## Frontend

`OcrResults` (`apps/frontend/src/components/document/OcrResults.tsx`) renders a
three-way toggle:

| View | Source | Shown when |
|------|--------|------------|
| **Extracted** | `keyValuePairs` via `ExtractedFieldsTable` | default for field-extraction models (when `keyValuePairs` present) |
| **Text** | `content` via `ExtractedTextView` (renders layout markdown with a rendered/raw sub-toggle) | default for read/layout models (when only text present) |
| **JSON** | the full raw `OcrResult` object | always available |

`DocumentViewerModal` embeds these views; when a document has no key/value pairs
it opens on the Text tab. See also
[OCR_IMPROVEMENT_PIPELINE.md](./OCR_IMPROVEMENT_PIPELINE.md) for the extraction
pipeline that produces these results.
