# OCR failure handling & document status lifecycle

How a document moves through OCR, and how failures are kept from stranding a
document in **"Processing"** (`ongoing_ocr`) forever.

## Status lifecycle

| Status | UI label | Meaning | Terminal? |
|--------|----------|---------|-----------|
| `pre_ocr` | Waiting | Uploaded, OCR not started | no |
| `ongoing_ocr` | Processing | OCR workflow running | no |
| `extracted` | — | OCR finished, before final transition | no |
| `awaiting_review` | — | In HITL | no |
| `complete` | Complete | Finished (OCR + optional HITL) | yes |
| `failed` | Failed | OCR/extraction failed | yes (purgeable) |
| `conversion_failed` | Failed | PDF normalization failed (e.g. password-protected) | yes (purgeable) |

The pre-execution hook in `graphWorkflow` sets `ongoing_ocr` at the start of a
run. The success path transitions `extracted → complete` (HITL docs are left at
`awaiting_review` for the HITL flow to finish).

## Failure paths (why a document never gets stuck in "Processing")

Two guards work together so a failed run always reaches a terminal status:

1. **Reject password-protected PDFs before OCR** — normalization probes with
   mupdf `needsPassword()` and routes open-password PDFs to `conversion_failed`,
   so they never enter the OCR workflow at all. See
   [DOCUMENT_IMAGE_NORMALIZATION.md](DOCUMENT_IMAGE_NORMALIZATION.md).

2. **Failure-path status transition** — when the workflow fails, the `catch` in
   `graphWorkflow` (`apps/temporal/src/graph-workflow.ts`) moves the document
   from an in-flight status (`ongoing_ocr` / `pre_ocr`) to **`failed`**. It is
   guarded so a document that already progressed (`extracted` /
   `awaiting_review`) is never clobbered, is skipped on cancellation, and never
   lets a status-update error mask the original workflow error.

Azure OCR submit/poll errors (`4xx` and `5xx` alike) stay **retryable**: the
`azureOcr.submit` activity (`apps/temporal/src/activities/submit-to-azure-ocr.ts`)
throws a plain `Error`, so Temporal applies the activity's retry policy. Once
retries are exhausted the workflow fails and guard #2 drives the document to the
terminal `failed` status — so even a permanently-failing submit (e.g. a
`400 InvalidRequest / UnsupportedContent`) can no longer strand a document in
"Processing"; it just reaches `failed` after the retry budget rather than
immediately.

> Historical note: before guard #2 existed, an OCR-submit failure left the
> document orphaned in `ongoing_ocr` ("Processing") indefinitely — and
> `deleteDocument` refuses to remove an in-flight document, so those rows could
> neither finish nor be deleted. Re-running such a document through the workflow
> now drives it to `failed`.

## Interaction with ephemeral cleanup

`failed` and `conversion_failed` are **terminal and purgeable**. For documents
whose workflow config is marked `ephemeral`, the cleanup janitor then deletes
the document's blob-storage prefix (`{groupId}/ocr/{documentId}/` — original,
`normalized.pdf`, thumbnail, and OCR artifacts) and its Temporal record. So a
failed OCR run is cleaned up the same way a completed one is — no manual blob
deletion. See [ephemeral-document-cleanup.md](ephemeral-document-cleanup.md).
