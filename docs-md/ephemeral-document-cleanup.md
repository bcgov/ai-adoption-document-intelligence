# Ephemeral document cleanup

Makes documents **transient** when their workflow opts in: once a document
reaches a terminal status, a background janitor deletes its blob-storage files
and its Temporal execution record. The extracted OCR result in Postgres
(`ocr_results.content`) is **retained** so API clients can still poll it.

Ephemerality is **configured on the workflow** — there is no global enable flag
and no per-group setting. A workflow whose config declares an ephemeral policy
in `metadata.ephemeral` makes every document it processes ephemeral, and the
policy controls **which targets** are deleted.

## What gets deleted vs kept

| Store | Per-document data | Janitor behavior |
|-------|-------------------|------------------|
| Azure Blob (`{group}/ocr/{docId}/`) | original file, normalized PDF, thumbnail, `azure-response.json`, `ocr-result.json`, `cleaned-result.json` | **Deleted** via `deleteByPrefix` |
| Temporal | workflow execution history (~refs only) | **Deleted** via `DeleteWorkflowExecution` (also auto-expires in 24h) |
| Postgres `documents` | row incl. blob paths, status | **Kept** (stamped `purged_at`; `file_path` now dangles) |
| Postgres `ocr_results` | extracted text / markdown / pages JSON | **Kept** — clients poll `GET /documents/:id/ocr` from here |

> Because `ocr_results.content` is retained, the extracted **text** is not
> transient — only the source/intermediate **files** and the Temporal record
> are removed.

## Enabling it on a workflow

Set `metadata.ephemeral` in the workflow config (e.g. when creating or updating
the workflow via `POST` / `PUT /api/workflows`). It accepts:

| Value | Effect |
|-------|--------|
| `true` | Delete **both** blob files and the Temporal execution record |
| `{ "files": true, "temporalRecord": false }` | Delete only the targets set to `true`; omitted/`false` targets are kept |
| `false` / absent | Not ephemeral — nothing is deleted (default) |

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "OCR Only (Minimal, ephemeral)",
    "ephemeral": { "files": true, "temporalRecord": false }
  },
  "entryNodeId": "prepareFileData",
  "ctx": { /* ... */ },
  "nodes": { /* ... */ },
  "edges": [ /* ... */ ]
}
```

A document is purged once it reaches a terminal status if its workflow opts in
to **at least one** target. The OCR result in Postgres is always kept.

## How it works

A NestJS `@Cron` service ([`EphemeralDocumentCleanupService`](../apps/backend-services/src/document/ephemeral-document-cleanup.service.ts))
runs every minute. Each run:

1. Queries `documents` that are in a terminal status (`complete`, `failed`,
   `conversion_failed`), not yet purged, **and** whose workflow version config
   opts in to at least one ephemeral target (`metadata.ephemeral` is `true`, or
   an object with `files`/`temporalRecord` set) — via a Prisma relation filter
   on `workflowVersion.config`. Each result carries its workflow's policy
   (`DocumentDbService.findPurgeableEphemeralDocuments`).
2. For each document, per its policy:
   - if `files`: `blobStorage.deleteByPrefix({group}/ocr/{docId}/)`
   - if `temporalRecord`: `temporalClient.deleteWorkflowExecution(workflow_execution_id)`
     (skipped if absent; `NOT_FOUND` treated as success)
   - always: `DocumentDbService.markDocumentPurged(id)` → stamps `purged_at`.
3. Per-document failures are logged and isolated; the document is left unstamped
   and retried on the next run. Every step is idempotent, so retries are safe.

Only terminal statuses are purged. `awaiting_review` and `extracted` are
**excluded** so an in-flight HITL or follow-on step can still read the blobs.
Workflows that finish at `extracted` rather than `complete` will not be purged —
ensure the target workflow reaches a terminal status above.

The job runs unconditionally; when no workflow is marked ephemeral the query
matches nothing and it is a no-op. There is no global kill-switch by design.

## Latency

Cleanup runs on a 1-minute cron, so deletion happens within ~1 minute of a
document reaching a terminal status — not instantaneous. This intentionally
avoids per-document Temporal long-polls, which keeps it cheap under high volume.

## Performance at scale

The janitor query filters `status IN (terminal) AND purged_at IS NULL` joined to
the ephemeral workflow. Because the ephemeral workflow is typically the
high-volume one, every document it ever processed shares its
`workflow_config_id`, so a plain index there is not selective. Instead a
**partial index** covers only unpurged rows:

```sql
CREATE INDEX documents_purge_scan_idx
  ON documents (workflow_config_id, status)
  WHERE purged_at IS NULL;
```

Since the janitor clears new terminal documents within ~1 minute, the unpurged
working set is bounded by throughput rather than table size, so the index stays
small and the scan stays fast even with billions of total rows. Prisma cannot
express partial indexes, so it is managed via the raw migration
`20260624000000_add_documents_purge_index` (don't let `migrate dev` drop it).
For an already-large `documents` table, build it with `CREATE INDEX
CONCURRENTLY` out-of-band to avoid a write lock.

## Schema

Adds `documents.purged_at` (`DateTime?`, nullable). `NULL` = not yet purged;
non-null = the janitor has removed the blobs and Temporal record. Migration:
`20260623000000_add_document_purged_at`. The `purged_at` marker is what stops
the janitor reprocessing the same document every minute (the row and its
`ocr_results` are intentionally kept, so it can't signal "done" by deleting the
row).
