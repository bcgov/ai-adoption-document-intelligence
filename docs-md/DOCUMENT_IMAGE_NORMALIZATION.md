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

## Lifecycle

Deleting a document removes the whole prefix `documents/{id}/` or `labeling-documents/{id}/` (both blobs).
