# Document content hash

## Purpose

Each document row stores a **`content_hash`**: the SHA-256 hex digest of the **original upload bytes** (the same bytes written to `original.{ext}` in blob storage). Identical files produce the same hash regardless of filename or document id, so uploads can be correlated, deduplicated, or looked up without reading blob storage.

Applies to:

| Table | Set on |
|-------|--------|
| `documents` | `POST /api/upload`, ground-truth generation |
| `labeling_documents` | Template-model labeling upload |

Legacy rows created before this field existed have `content_hash = null`.

## Algorithm

```ts
createHash("sha256").update(originalUploadBuffer).digest("hex")
```

Implementation: [`content-hash.util.ts`](../apps/backend-services/src/document/content-hash.util.ts).

The hash is computed **before** PDF normalization so it reflects the caller’s file, not the canonical normalized PDF.

## API

| Surface | Field / query |
|---------|----------------|
| Document list `GET /api/documents` | Response: `content_hash`. Filter: `?content_hash=<hex>` (exact match, scoped to accessible groups). |
| Documents UI (`/documents`) | **Hash** column: truncated by default (`abcdef12…9f2a`), click to expand full value and copy. Legacy rows show `—`. |
| Document detail / upload responses | `content_hash` on `DocumentDataDto` |
| Labeling upload | `content_hash` on `LabelingDocumentResponseDto` |

## Database

- Column: `content_hash TEXT NULL` on `documents` and `labeling_documents`
- Index: `(group_id, content_hash)` for efficient per-group lookup

## Related

- Blob layout: [`BLOB_STORAGE.md`](BLOB_STORAGE.md)
- Upload / normalization: [`DOCUMENT_IMAGE_NORMALIZATION.md`](DOCUMENT_IMAGE_NORMALIZATION.md)
