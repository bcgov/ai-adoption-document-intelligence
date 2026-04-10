# Document Image Type Normalization (Planned)

Short reference for the normalization feature. Full specification: `feature-docs/007-document-image-normalization/REQUIREMENTS.md`.

## Objective

- Store incoming documents as-is for reference and “download original.”
- Use PDF as the single internal format for OCR, workflows, and display.
- Client always receives PDF for the view flow.

## Decisions

- **DB:** `file_path` = original; `normalized_file_path` = PDF. Display and OCR use `normalized_file_path`.
- **Conversion:** Synchronous during upload; best effort. Failure → uploader sees message + retry. Invalid image → separate UI error.
- **Download:** Serves the **original** file only. Any group member who can view; filename and Content-Type from `original_filename`.
- **Labeling:** Same rules as main documents. No backfill; thumbnails out of scope.
- **Viewers:** Single viewer path. No multiple viewers for file types; in-app display always PDF. Other types (JPEG, PNG, etc.) only via download, not rendered in-app.

## Storage

| Key | Purpose |
|-----|--------|
| `documents/{id}/original.{ext}` | Uploaded file unchanged. |
| `documents/{id}/normalized.pdf` | PDF for OCR, workflows, display. |

Same under `labeling-documents/{id}/`. PDF uploads: normalized can be a copy. Images: convert to PDF during upload.

## Downstream

- **OCR/Temporal:** Read normalized PDF only.
- **View (in-app):** Dedicated endpoint (e.g. `GET .../view`) → normalized PDF for the document viewer.
- **Download:** `GET .../download` → **original** file only.

## Client

- **Single viewer path:** No multiple viewers for different file types. View endpoint always returns PDF; use one path everywhere (e.g. react-pdf or pdfjs). Remove image-type branch (e.g. `<img>` for non-PDF, or AnnotationCanvas with direct image URL for viewing). Other types (JPEG, PNG) are only via download, not rendered in-app.
- **Canvas/drawing:** View URL is always PDF; do not treat as direct image. For annotation/drawing, the client must render the PDF page to a canvas in the browser (e.g. pdfjs or react-pdf) and use that canvas for layout and overlays. Client-side PDF-to-canvas only; no server-side page-image API.

## References

- Requirements: `feature-docs/007-document-image-normalization/REQUIREMENTS.md`
- Blob layout: `docs-md/BLOB_STORAGE.md` (to be updated with two-blob pattern)
