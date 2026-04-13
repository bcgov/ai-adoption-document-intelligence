# Feature 007 — Normalize Document Image Types

## Overview

Normalize document handling so that **within the system** all documents are consumed and rendered as a single type (PDF), while **preserving the original uploaded file** for reference and download. Applies to main document intake (`documents/`) and labeling documents (`labeling-documents/`) with the same rules. Simplifies downstream processing (OCR, workflows) and client-side rendering.

**Unifying type:** PDF.

---

## Current State

- **Storage:** Single blob per document at `documents/{documentId}/original.{ext}` or `labeling-documents/{documentId}/original.{ext}`. Extension from `file_type` (pdf→.pdf, image→.jpg, scan→.pdf). DB: `file_path`, `file_type`, `original_filename`.
- **Downstream:** OCR/Temporal reads blob and infers `fileType`/`contentType`. Download endpoints serve the stored blob with Content-Type from `file_type`.
- **Client:** DocumentViewer branches on `fileType`—PDF via pdfjs-dist to canvas, images as `<img>`. Annotation viewer uses react-pdf (PDF only). AnnotationCanvas may treat URL as image; works for images but not for PDF.

---

## Goals

1. **Preserve originals** — Store every upload as-is for reference and “download original.”
2. **Unified internal format** — One normalized PDF per document for OCR, workflows, and display.
3. **Single consumer path** — All consumers assume PDF; no image/PDF branching.
4. **Clear client contract** — Display URL is always PDF; annotation/canvas must not assume direct image.

---

## Decisions

| Topic | Decision |
|-------|----------|
| Download | Download serves the **original** file only. Any group member who can view may download. |
| Conversion failed | Visible to uploader; explicit UI message and retry. |
| Database | `file_path` = original blob; add `normalized_file_path` = PDF. Display and OCR use `normalized_file_path`. |
| Backfill | Out of scope; new uploads only. |
| Conversion failure vs invalid image | Conversion failure: document marked failed, UI message + retry. Invalid/unsupported image: distinct UI error (e.g. validation/unsupported format). |
| Conversion timing | Synchronous during upload; client waits until normalized exists or fails. |
| Labeling vs main | Same rules for both. |
| Original filename/Content-Type | Derive from `original_filename`; no separate MIME field. |
| Multi-page images | Align with existing document-splitting activity/workflow. |
| Performance / thumbnails | Best effort; thumbnails out of scope. |
| **Viewers** | **Single viewer path.** No multiple viewers for different file types. In-app display always uses the view endpoint (PDF). Other types (e.g. JPEG, PNG) are only available via download; they are not rendered in the app. |
| **Canvas/drawing** | **Client-side PDF-to-canvas only.** For annotation and drawing, the client renders the PDF page to a canvas in the browser and uses that canvas for layout and overlays. No server-side page-image API. |

---

## Requirements

### 1. Storage

1.1 **Original blob** — Store upload unchanged at `documents/{documentId}/original.{ext}` (main) or `labeling-documents/{documentId}/original.{ext}` (labeling). Extension and `original_filename` reflect actual format.

1.2 **Normalized blob** — Per document: `documents/{documentId}/normalized.pdf` or `labeling-documents/{documentId}/normalized.pdf`. PDF uploads: copy of original. Image/non-PDF: produce PDF synchronously during upload; `normalized.pdf` exists before upload response (or request fails).

1.3 **Database** — `file_path` = original blob. Add `normalized_file_path` = normalized PDF. Downstream and in-app view use `normalized_file_path`. Keep `original_filename` and `file_type` for display and for download. Content-Type for download derived from `original_filename` extension. List/get APIs expose that view is PDF and download is original.

### 2. Conversion (image → PDF)

2.1 **When** — Synchronous during ingestion. After original is written, run conversion before returning upload response. Start OCR/workflow only after normalized PDF exists.

2.2 **How** — Implementation choice (e.g. ImageMagick, Ghostscript, pdf-lib). Support at least current image types (e.g. JPEG, PNG); output valid single- or multi-page PDF; quality sufficient for OCR and display. Best effort performance.

2.3 **Conversion failure** — Mark document failed (e.g. `conversion_failed`). Do not start OCR. Original remains stored. Uploader sees explicit message (e.g. “Document could not be converted to PDF”).

2.4 **Invalid/unsupported image** — Separate from conversion failure. Corrupted or unsupported format: distinct UI error so user understands the file is invalid. Behavior (reject at upload vs store and show error) consistent and documented.

2.5 **Multi-page images** — If supported (e.g. TIFF), one PDF page per source page vs flatten: align with document-splitting activity/workflow.

### 3. Downstream use of normalized PDF and original

3.1 **OCR / Temporal** — Use `normalized_file_path` only. Input is always PDF.

3.2 **View / display** — For in-app viewing, a dedicated endpoint (e.g. `GET .../view` or `GET .../file`) serves the **normalized PDF**; Content-Type `application/pdf`. The client uses this URL for the document viewer.

3.3 **Download** — `GET .../download` serves the **original** file only. This is the only download action. Access: any group member who can view. Filename and Content-Type from `original_filename` extension.

### 4. Client

4.1 **Single viewer path** — After normalization, the client does **not** need multiple viewers for different file types. The view endpoint always returns PDF, so in-app display uses a single path: treat the view response as PDF (e.g. react-pdf or pdfjs everywhere). Remove the current image-type branch (e.g. `<img>` for non-PDF, or AnnotationCanvas fed with a direct image URL for viewing). One viewer behavior for all documents: “view URL is PDF, render as PDF.”

4.2 **Other image types** — JPEG, PNG, etc. are **not** rendered in the app. They are only available as the **original** via download; the user opens the downloaded file externally. No in-app viewer is required for those types.

4.3 **Display implementation** — Assume response from the view/display endpoint is always PDF. DocumentViewer: single path (PDF); remove or reduce the image branch. Annotation viewer already PDF-oriented.

4.4 **Canvas/drawing** — The view URL is always PDF; do not treat it as a direct image. For annotation and drawing (e.g. AnnotationCanvas), the client **must** render the PDF page to a canvas in the browser (e.g. via pdfjs or react-pdf) and use that canvas for layout and overlays. Client-side PDF-to-canvas is the required approach; no server-side page-image endpoint.

### 5. Lifecycle and docs

5.1 **Deletion** — On document delete, remove both blobs (e.g. delete prefix `documents/{id}/` or `labeling-documents/{id}/`).

5.2 **Documentation** — Update `docs-md/BLOB_STORAGE.md` with two-blob pattern and which key is used where. Update or add `docs-md` doc for normalization and client implications.

---

## Out of Scope

- Backfill of existing documents
- Changing accepted upload MIME types
- Azure Document Intelligence changes beyond “input always PDF”
- Server-side per-page raster images or thumbnails
- Thumbnail/preview behavior

---

## Summary

| Area | Requirement |
|------|-------------|
| Storage | Original at `original.{ext}`; normalized at `normalized.pdf` (copy or convert). |
| DB | `file_path` = original; `normalized_file_path` = PDF. Content-Type for original from `original_filename`. |
| Conversion | Synchronous; best effort. Failure → failed status, UI message + retry. Invalid image → distinct UI error. |
| OCR/View/Download | Use `normalized_file_path` for OCR and for view endpoint. Download = original only (`GET .../download`). View = normalized PDF (e.g. `GET .../view`). |
| Client | Single viewer path: view = PDF only; no multiple viewers for image types. Other types only via download. Canvas/drawing: client-side PDF-to-canvas only (no server page-image API). |
| Lifecycle | Delete both blobs on document delete. |
| Labeling | Same rules as main documents. |
