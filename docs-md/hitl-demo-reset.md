# HITL Demo — Capture & Reset

A repeatable way to populate the Human-in-the-Loop (HITL) review queue with
real, OCR'd documents **without re-running (paid) Azure Document Intelligence**
every time you reset the database.

The demo documents are stored as on-disk **fixtures** under `data/hitl-demo/`
(OCR results + the generated normalized PDF). A seed script re-inserts the
`documents` / `ocr_results` rows and re-uploads the blobs, so you can wipe and
rebuild the demo in seconds.

## TL;DR

```bash
# Reset the DB and rebuild the HITL demo queue from fixtures:
npm run demo:reset          # = test:db:reset + seed:hitl-demo

# Just (re)seed the demo docs onto an already-seeded DB:
npm run seed:hitl-demo

# Re-capture fixtures after processing new demo docs through OCR:
npm run capture:hitl-demo
```

Then open the review queue (`/review` in the app) — the seeded documents appear
in `awaiting_review` with field bounding boxes over the rendered form.

## How it works

### Fixtures (`data/hitl-demo/<slug>/`)

Each demo document is one directory:

| File | Contents |
|---|---|
| `meta.json` | Document metadata: title, `originalFilename`, `fileType`, `fileSize`, `source`, `modelId`, `contentHash`, `metadata`, and a repo-relative `sourceImage` pointer. |
| `ocr.json` | The captured OCR result: `keyValuePairs` (fields **with** `boundingRegions` geometry), `content` (page/text layout), `enrichmentSummary`. |
| `normalized.pdf` | The exact normalized PDF the pipeline generated. The HITL canvas renders **this** file, and the OCR polygons are relative to its page, so it must be the captured bytes — not a regeneration. |

The **source image is not duplicated** — it is referenced by repo-relative path
(the JPGs already live under `data/datasets/…`). Only the generated
`normalized.pdf` (plus the small JSON) is committed per document.

### `scripts/capture-hitl-demo.mjs`

Exports the current `awaiting_review` demo documents (title prefix `HITL `) to
fixtures. Pulls document + OCR rows from the DB and the normalized PDF from the
backend's `/api/documents/:id/view` endpoint (so it is blob-provider agnostic).

Run this **once** after you have processed a fresh set of demo documents through
the real OCR pipeline, and re-run it whenever you reprocess them.

### `scripts/seed-hitl-demo.mjs`

Rebuilds the demo from fixtures. For each fixture it:

1. Uploads the source image + `normalized.pdf` to blob storage under
   `<group>/ocr/<docId>/…`.
2. Inserts the `documents` row (status `awaiting_review`).
3. Inserts the `ocr_results` row.

- **Deterministic ids** (`hitl-demo-<slug>`) make it idempotent — re-running
  deletes and recreates each demo doc (cascade removes its OCR result, review
  sessions, and locks) and keeps blob paths stable.
- **Blob-provider aware**: it mirrors the backend's provider selection
  (`BLOB_STORAGE_PROVIDER`) and writes to **Azure Blob Storage** or **MinIO/S3**
  accordingly, so the seeded blobs land where the app actually reads them.
- **Generic**: it seeds whatever fixtures exist under `data/hitl-demo/`, with no
  document-specific logic.

## Prerequisites

- Infra up (`docker compose --profile infra --profile temporal up -d`) and the
  backend/worker running (`npm run dev`).
- Run **after** the base seed so the target group exists — `demo:reset` chains
  `test:db:reset` (which runs the base seed) before `seed:hitl-demo`.

## Environment

Both scripts load `apps/backend-services/.env` via Node's `loadEnvFile` (values
are never printed) and honour:

| Var | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection (required) | — |
| `BLOB_STORAGE_PROVIDER` | `azure` or `minio` | `minio` |
| `AZURE_STORAGE_CONNECTION_STRING` / `AZURE_STORAGE_CONTAINER_NAME` | Azure Blob (when provider=azure) | container `document-blobs` |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_DOCUMENT_BUCKET` | MinIO/S3 (when provider=minio) | `http://localhost:19000`, `minioadmin`, bucket `document-blobs` |
| `HITL_DEMO_GROUP_ID` | Group the demo docs belong to | `seeddefaultgroup` |
| `BACKEND_URL` / `TEST_API_KEY` | Used by capture to fetch blobs | `http://localhost:3002`, documented local key |

## Regenerating the demo set from scratch

If you want a different set of demo documents:

1. Upload the source images through the normal pipeline (real Azure OCR) so they
   reach `awaiting_review`. Title them with the `HITL ` prefix.
2. `npm run capture:hitl-demo` — writes new fixtures under `data/hitl-demo/`.
3. Commit the updated `data/hitl-demo/` fixtures.
4. `npm run demo:reset` any time to rebuild.

> Note: the review queue only surfaces documents that have at least one field
> below the confidence threshold (default `0.9`) and no in-progress session, so
> all-high-confidence documents may only appear once the queue confidence filter
> is widened. See [HITL_ARCHITECTURE.md](architecture/HITL_ARCHITECTURE.md).
