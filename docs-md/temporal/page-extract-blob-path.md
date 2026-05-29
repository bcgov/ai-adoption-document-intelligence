# Page extract blob path (C.1)

`document.extractToBase64` (`extract-pages-base64.ts`) no longer returns inline base64 in activity results.

## Activity output

| Port | Type | Description |
|------|------|-------------|
| `pageBlobPath` | string | Blob path of the extracted page-range PDF |
| `pageIndex` | number | First extracted page (1-based, equals `startPage`) |
| `byteLength` | number | Written PDF size in bytes |
| `pageCount` | number | `endPage - startPage + 1` |

## Activity input

Requires `groupId` (and `blobKey`, `startPage`, `endPage`). `documentId` is optional when derivable from `blobKey` (`{groupId}/ocr/{documentId}/...`).

## Blob layout

`{groupId}/ocr/{documentId}/page-extracts/page-range-{start}-{end}.pdf`

## Workflow migration

`migrateGraphConfigToOcrRefs` also runs `migrateExtractToBase64Bindings`:

- Output port `base64` → `pageBlobPath`
- Ctx keys like `section2Base64` → `section2PageBlobPath`
- Field mappings `{{section2Base64.` → `{{section2PageBlobPath.`

Downstream steps should read the PDF from blob (e.g. `blob.read` with `pageBlobPath`, or activities that accept a blob key).
