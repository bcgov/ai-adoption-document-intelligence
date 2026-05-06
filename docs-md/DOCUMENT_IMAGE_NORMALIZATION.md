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

Backend normalization uses **sharp** (images, including multi-page TIFF) and **pdf-lib** (PDF assembly). PDF uploads must pass a **magic-byte check and a full `pdf-lib` parse** (with `ignoreEncryption: true`) before storage; images are validated with **sharp** metadata. After validation, PDF bytes are copied to `normalized.pdf`.

## Image embedding strategy

When wrapping an image upload as a PDF, [`PdfNormalizationService`](../apps/backend-services/src/document/pdf-normalization.service.ts) chooses one of three branches based on the input. The choice maps directly onto pdf-lib's two internal paths and is driven by output size and quality.

### How PDF stores images (and alpha)

A PDF Image XObject does **not** have an RGBA mode. The image data stream is one of `DCTDecode` (JPEG), `FlateDecode` (zlib-compressed raw bitmap), or a few less common filters. Transparency is modeled as a separate `DeviceGray` Image XObject referenced from the parent image's `/SMask` entry — the renderer composites the RGB image against the page using the SMask as alpha at draw time.

### What pdf-lib does under the hood

- **`embedJpg(buffer)`** — parses the JPEG header to read dimensions and color space, then embeds the **original bytes verbatim** as a stream with `Filter: 'DCTDecode'`. No decode, no re-encode, zero quality loss. CMYK gets a `Decode` array fix-up; otherwise it's a byte-for-byte passthrough.
- **`embedPng(buffer)`** — fully decodes the PNG. The RGB channel is stored as a **flate-compressed raw bitmap** (XObject with `Filter: 'FlateDecode'`). If the source has alpha, the alpha channel is split out and stored as a **separate flate-compressed `DeviceGray` XObject** linked via `/SMask`. The "PNG-ness" of the input is discarded — the PDF never contains PNG bytes.

The size implication: pdf-lib's PNG path produces flate-compressed raw RGB, which is dramatically larger than DCT-compressed JPEG for photographic content (a 4 MB JPEG re-routed through `embedPng` becomes ~30 MB+ of flate-RGB inside the PDF).

### The three branches

| Input | Path | What ends up in the PDF |
|---|---|---|
| Single-page JPEG | `pdf-lib.embedJpg(originalBuffer)` | Original JPEG bytes, `DCTDecode` — smallest |
| Image with alpha (`sharp` metadata `hasAlpha === true`) | `sharp(...).png() → pdf-lib.embedPng(...)` | Flate-RGB + flate `/SMask` — only viable path that preserves transparency |
| Anything else (opaque PNG, opaque single-page TIFF, …) | `sharp(...).jpeg({ quality: 100 }) → pdf-lib.embedJpg(...)` | Re-encoded JPEG, `DCTDecode` — much smaller than flate-RGB |
| Multi-page (e.g. multi-page TIFF) | Per page: alpha → PNG branch, otherwise → JPEG branch | One PDF page per source page |

### Encode counts (no double-encoding)

| Branch | sharp does | pdf-lib does | JPEG encodes |
|---|---|---|---|
| Original JPEG | nothing | passthrough | **0** |
| Opaque → JPEG | encode once at q=100 | passthrough | **1** |
| Alpha → PNG | encode once as PNG | decode → flate-RGB + flate-SMask | 0 (lossless throughout) |

The single JPEG encode in the opaque path is unavoidable: pdf-lib's `embedJpg` requires JPEG bytes and cannot accept raw pixels. `quality: 100` is chosen to minimize the cost of that one encode and preserve OCR/extraction accuracy downstream — DCT at q=100 still beats flate-RGB by 3–5× for natural images.

### Known limitations

- **PNGs with unused alpha.** A PNG saved with an alpha channel where every pixel is fully opaque still hits the PNG branch, producing an unnecessary `/SMask` stream. Detecting "actually transparent" would require `sharp.stats()` and a per-pixel scan; not currently done.
- **CMYK JPEGs.** Handled correctly by pdf-lib's `Decode: [1,0,1,0,1,0,1,0]` array.
- **EXIF orientation.** Neither path applies EXIF auto-rotation — the previous all-PNG path also did not, so this is unchanged.

## Lifecycle

Deleting a document removes the whole prefix `documents/{id}/` or `labeling-documents/{id}/` (both blobs).
