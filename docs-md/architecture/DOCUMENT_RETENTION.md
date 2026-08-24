# Document retention

Permanently deletes documents once they exceed a configured age: the
blob-storage files, the `documents` row, and everything that cascades from it.
Unlike [ephemeral document cleanup](./EPHEMERAL_DOCUMENT_CLEANUP.md), which
keeps the extracted OCR result so clients can still poll it, retention removes
the extracted data too. Nothing survives.

Retention is a **global, environment-level** setting driven by one variable,
`DOCUMENT_RETENTION_DAYS`. There is no per-workflow and no per-group control.
When the variable is unset, empty, non-numeric, zero or negative, the janitor
logs a warning and deletes nothing — which is how every environment ships.

## What gets deleted

| Store | Per-document data | Behavior |
|-------|-------------------|----------|
| Azure Blob (`{group}/ocr/{docId}/`) | original file, normalized PDF, thumbnail, `azure-response.json`, `ocr-result.json`, `cleaned-result.json` | **Deleted** via `deleteByPrefix` |
| Postgres `documents` | the row | **Deleted** |
| Postgres `ocr_results` | extracted text / markdown / pages JSON | **Deleted** — `onDelete: Cascade` |
| Postgres `review_sessions` | HITL review history | **Deleted** — `onDelete: Cascade` |
| Postgres `field_corrections` | per-field corrections | **Deleted** — cascades through `review_sessions` |
| Postgres `document_locks` | review locks | **Deleted** — `onDelete: Cascade` |
| Postgres `dataset_ground_truth_jobs` | benchmark ground-truth job | **Kept**, with `documentId` set to `NULL` — the relation is optional, so Prisma's default `SetNull` applies |
| Temporal | workflow execution history | **Kept** — retention does not call `DeleteWorkflowExecution` |

## Which documents are eligible

Two conditions, both required:

- `created_at` is older than `now() - DOCUMENT_RETENTION_DAYS`. The age is
  measured from creation, not from last activity.
- Status is one of `complete`, `failed`, `conversion_failed`.

`pre_ocr` and `ongoing_ocr` are excluded because the pipeline is still running.
`awaiting_review` and `extracted` are excluded because a HITL or follow-on step
may still read the blobs. A document parked in one of those states is never
deleted, at any age.

## How it works

A NestJS `@Cron` service ([`DocumentRetentionService`](../../apps/backend-services/src/document/document-retention.service.ts))
runs daily at 02:00 and processes up to `BATCH_SIZE` (100) documents per run.
Each run:

1. Reads `DOCUMENT_RETENTION_DAYS`. If it is absent or not a positive integer,
   logs a warning and returns without querying anything.
2. Queries eligible documents ordered by `created_at` ascending, selecting only
   `id` and `group_id` (`DocumentDbService.findExpiredDocuments`).
3. For each document, in this order:
   - `blobStorage.deleteByPrefix({group}/ocr/{docId}/)`
   - `DocumentDbService.deleteDocument(id)`
4. Logs a run summary with the candidate, deleted and error counts.

Per-document failures are logged and isolated — the rest of the batch still
runs, and the failed document is retried on the next run. Both steps are
idempotent: `deleteByPrefix` succeeds when no blobs match, and `deleteDocument`
treats Prisma `P2025` (record not found) as a non-error.

**Blobs are deleted before the row.** If the row delete then fails, the document
survives with files that no longer exist, and the next run finishes the job. The
reverse order would orphan the blobs permanently, because the row carrying their
paths would already be gone.

## Relationship to ephemeral cleanup

The two janitors compose. A document processed by an ephemeral workflow has
already lost its blobs and carries a `purged_at` stamp, but its `documents` and
`ocr_results` rows are kept indefinitely by design. Retention is what eventually
removes those rows. `deleteByPrefix` on an already-purged document matches
nothing and returns without error, so no special case is needed.

## Query cost

The eligibility query filters on `created_at` and `status` with no `group_id`.
The indexes on `documents` are all either group-scoped
(`group_id`, `group_id + content_hash`, `group_id + created_at`) or
workflow-scoped (`workflow_config_id`, and the partial
`documents_purge_scan_idx`), so none of them serves this predicate. On a large
`documents` table the daily run performs a sequential scan.

## Enabling it

`DOCUMENT_RETENTION_DAYS` reaches a deployed backend through the overlay
generator, not through the base ConfigMap:

1. The `DOCUMENT_RETENTION_DAYS` repository secret supplies the value to
   `.github/workflows/deploy-instance.yml`.
2. The workflow passes it to `generate_instance_overlay` as
   `--document-retention-days`.
3. The generator substitutes `__DOCUMENT_RETENTION_DAYS__` in the
   instance-template overlay, which patches `backend-services-config`.

With the secret unset the token resolves to an empty string and the janitor
stays off. Setting the value in `components/prod-resources` does **not** work —
the instance-template ConfigMap patch applies after components and overwrites it.

Variable reference: [ENVIRONMENT_CONFIGURATION.md](../operations/ENVIRONMENT_CONFIGURATION.md#document-retention).

## Audit

Deletion by this janitor records no audit event; the only record is the run
summary in the application log. The user-initiated `DELETE /api/documents/:id`
path, which removes the same rows, does record one. See
[TRANSACTION_AND_AUDIT_AUDIT.md](./TRANSACTION_AND_AUDIT_AUDIT.md).
