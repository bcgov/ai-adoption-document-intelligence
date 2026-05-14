# Document image normalization (PDF)

## Purpose

Intake stores **two** objects per document (main `documents/` and labeling `labeling-documents/`):

| Blob | Role |
|------|------|
| `original.{ext}` | Exact upload; used for **download** only. |
| `normalized.pdf` | Canonical **PDF** for OCR, Temporal workflows, and **in-app viewing**. |

Database: `file_path` → original blob; `normalized_file_path` → normalized PDF (null if conversion failed).

## API

| Endpoint | Content |
|----------|---------|
| `GET .../documents/:id/view` | Normalized PDF (`application/pdf`). |
| `GET .../documents/:id/download` | Original bytes; `Content-Type` from `original_filename` extension. |
| `GET .../labeling/projects/:id/documents/:docId/view` | Normalized PDF for labeling. |
| `GET .../labeling/projects/:id/documents/:docId/download` | Original labeling upload. |

Upload may return **422** with `code: conversion_failed` when the original was stored but PDF normalization failed; status `conversion_failed` is set and OCR is not started.

Labeling project upload (`POST .../labeling/projects/:id/upload`) requires `group_id` in the body to **match** the project’s group; the caller must also be allowed to access that group (same as other labeling routes).

**Invalid or unsupported files** are rejected with **400** (corrupt image, bad PDF signature, etc.) before a successful store, where validation applies.

## Client

- Use **`/view`** for any in-app preview (always PDF).
- Use **`/download`** when the user saves the **original** file.
- Annotation and HITL UIs render the normalized PDF (e.g. react-pdf / pdfjs), not raw images from download.

## Dependencies

Backend normalization uses **sharp** (images, including multi-page TIFF) and **pdf-lib** (PDF assembly). PDF uploads must pass a **magic-byte check and a full `pdf-lib` parse** (with `ignoreEncryption: true`) before storage; images are validated with **sharp** metadata.

## Two-stage orientation correction

Page orientation is corrected in two complementary stages.

| Stage | Where it runs | Trigger | Cost |
|---|---|---|---|
| **1. Metadata-driven** | `PdfNormalizationService` (this service, on upload) | EXIF Orientation tag on JPEGs; PDF `/Rotate` page flags | Free / cheap (a few ms) |
| **2. Content-driven** | `document.normalizeOrientation` Temporal activity ([code](../apps/temporal/src/activities/normalize-document-orientation.ts)) | Tesseract OSD on each rendered page | ~500 ms/page; opt-in per workflow |

Stage 1 is fast and only acts on metadata that says "rotate me." Stage 2 looks at the actual pixels and is the only stage that can detect a sideways scan that has no metadata to flag it. The two stages are paired by contract — a workflow that needs full orientation correction must include the Stage 2 node.

### Stage 1 — PDF inputs (`/Rotate` flag baking)

When the upload is a PDF/scan, the service inspects every page's `/Rotate` flag. If all pages already report `/Rotate = 0`, the original buffer is returned unchanged — zero parse, zero rewrite. Otherwise the service rebuilds the PDF page by page: pages with `/Rotate = 0` are `copyPages`'d unchanged, and rotated pages are `embedPage`'d as XObjects and redrawn with the inverse transform so the resulting page has `/Rotate = 0` and the visual orientation is preserved. 90°/270° pages get their width/height swapped on the new page.

### Stage 1 — Image inputs (EXIF orientation + format normalization)

When the upload is an image, [`PdfNormalizationService`](../apps/backend-services/src/document/pdf-normalization.service.ts) wraps it as a PDF using one of two branches.

**Encoding policy in a nutshell:**

1. **Single-page JPEG with no EXIF orientation transform** → bytes embedded **verbatim** via `pdfDoc.embedJpg(buffer)`. No decode, no re-encode.
2. **Everything else** (PNG, TIFF, WebP, GIF, BMP, multi-page rasters, JPEGs with EXIF Orientation 2–8) → `sharp.rotate()` (bake EXIF into pixels) → `flatten` onto white (composite any alpha) → `jpeg({ quality: 100 })` → `pdfDoc.embedJpg(...)`.

`pdf-lib`'s `embedPng` is intentionally avoided. It decodes PNG to raw RGB and stores it as `FlateDecode` **without** PNG predictors (see [`node_modules/pdf-lib/es/core/embedders/PngEmbedder.js`](../node_modules/pdf-lib/es/core/embedders/PngEmbedder.js)), producing PDFs 3–10× larger than the source PNG. Alpha gets a second flate-encoded grayscale stream via `/SMask`, compounding the bloat. Re-encoding through JPEG q=100 produces materially smaller PDFs without measurable quality loss for documents.

#### What `EXIF orientation === 1` actually means

`orientation = meta.orientation ?? 1`. Value `1` means *the metadata gives no instruction to rotate* — either the EXIF Orientation tag is explicitly 1, or the image has no EXIF block at all. It does **not** assert that the pixels are upright. Sideways pixels with no EXIF tag are invisible to Stage 1 and require Stage 2 (Tesseract OSD) to detect.

#### `flatten()` is verified to be a no-op for non-alpha sources

Empirically: feeding an RGB JPEG through `.flatten({ background: '#ffffff' })` produces bit-identical output to skipping the call (`Buffer.compare` returns 0). For RGBA, blending matches the alpha algebra (red @ 50% on white → 255,127,127; on black → 128,0,0). Including `flatten()` unconditionally is safe and removes the need for a separate `hasAlpha` branch.

### By input — full table

| Upload | Stage 1 path | Notes |
|---|---|---|
| PDF/scan, all `/Rotate = 0` | Bytes returned as-is | No re-write |
| PDF/scan, some `/Rotate ≠ 0` | Per-page rebuild; rotation baked into content | Final PDF has `/Rotate = 0` everywhere |
| JPEG, no EXIF or `Orientation = 1` | `embedJpg(buffer)` — verbatim | Fastest path; preserves source bytes |
| JPEG, `Orientation 2..8` | sharp rotate → flatten → JPEG q=100 → `embedJpg` | EXIF correction is irreversibly baked into pixels |
| PNG (alpha or not) | sharp rotate → flatten on white → JPEG q=100 → `embedJpg` | Alpha composited onto white background |
| TIFF, single-page | sharp rotate → flatten → JPEG q=100 → `embedJpg` | Lossless source becomes lossy JPEG |
| TIFF, multi-page | Loop per page; each page → sharp pipeline → `embedJpg` | One PDF page per source page |
| WebP / BMP | sharp rotate → flatten → JPEG q=100 → `embedJpg` | Re-encoded as JPEG |
| Animated GIF | Loop runs once **per frame** | Each frame becomes a PDF page (gap; usually unintended) |

#### Encode counts

| Branch | sharp does | pdf-lib does | JPEG encodes |
|---|---|---|---|
| JPEG passthrough | nothing | embedJpg verbatim | **0** |
| Re-encode path (everything else) | rotate + flatten + JPEG q=100 | embedJpg verbatim | **1** |

The JPEG encode in the re-encode path is unavoidable: `pdf-lib.embedJpg` requires JPEG bytes and cannot accept raw pixels. `quality: 100` minimizes the perceptual cost of that single encode and preserves OCR / extraction accuracy downstream.

### Stage 2 — Tesseract OSD content-driven correction

The Temporal activity [`document.normalizeOrientation`](../apps/temporal/src/activities/normalize-document-orientation.ts) reads the stored normalized PDF, renders each page to PNG via mupdf at 72 dpi (1× scale), and runs Tesseract OSD (`OEM.TESSERACT_ONLY`) to detect the page's actual rotation. Pages whose detected angle is non-zero **and** whose confidence meets the threshold (default 2.0, configurable per node) are corrected by the same `embedPage`-and-redraw transform used by Stage 1's PDF rebuild. Pages that don't need correction are `copyPages`'d unchanged. If no page needs correction, the input blob is returned untouched and no write happens.

Because Stages 1 and 2 use the **same** rotation-baking math (the switch on 90/180/270 and paired CCW rotate + translate), keep both call sites in sync — this is annotated reciprocally in their JSDoc.

The trained-data file `apps/temporal/osd.traineddata` is committed to the repo and copied into the production container image so OSD runs offline. Sample workflow: [`docs-md/graph-workflows/templates/orientation-detection-workflow.json`](graph-workflows/templates/orientation-detection-workflow.json).

### Known limitations

- **CMYK JPEGs.** Handled correctly by pdf-lib's `Decode: [1,0,1,0,1,0,1,0]` array on the embedJpg fast path.
- **PDF page sized in pixels-as-points.** A 5000 px wide scan becomes a ~70 inch wide PDF page. OCR coordinate systems handle this fine; some printers may not.
- **No upper bounds on input dimensions or page count.** A multi-megapixel multi-page TIFF can be expensive to convert. Validation only checks format.
- **Animated GIF.** Each frame becomes a PDF page; rejecting animated GIFs at validation would usually be more useful.
- **Stage 1 alone is insufficient for sideways scans without EXIF.** Workflows that need full orientation correction must include the `document.normalizeOrientation` node.

## Labeling

Same two-blob layout under `labeling-documents/{id}/`. Same rules as main documents: no backfill of pre-existing rows, thumbnails out of scope.

## Lifecycle

Deleting a document removes the whole prefix `documents/{id}/` or `labeling-documents/{id}/` (both blobs).

## Related documents

- Requirements: `feature-docs/007-document-image-normalization/REQUIREMENTS.md`
- Blob layout: [`docs-md/BLOB_STORAGE.md`](BLOB_STORAGE.md)
- Workflow node catalog (Stage 2 node): [`docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md`](workflow-builder/WORKFLOW_NODE_CATALOG.md)
- Sample orientation workflow: [`docs-md/graph-workflows/templates/orientation-detection-workflow.json`](graph-workflows/templates/orientation-detection-workflow.json)
