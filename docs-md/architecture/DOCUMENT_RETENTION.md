# Retention policy

Permanently deletes records once they exceed a configured age. Four independent
janitors cover different data classes. Each is controlled by its own
environment variable; all default to disabled so behaviour does not change on
deploy unless the variable is explicitly set.

Unlike [ephemeral document cleanup](./EPHEMERAL_DOCUMENT_CLEANUP.md), which
keeps the extracted OCR result so clients can still poll it, retention removes
everything — including extracted data.

## Document janitor

Controlled by `DOCUMENT_RETENTION_DAYS`. No per-workflow or per-group control.

### What gets deleted

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

### Which documents are eligible

Two conditions, both required:

- `created_at` is older than `now() - DOCUMENT_RETENTION_DAYS`. The age is
  measured from creation, not from last activity.
- Status is one of `complete`, `failed`, `conversion_failed`.

`pre_ocr` and `ongoing_ocr` are excluded because the pipeline is still running.
`awaiting_review` and `extracted` are excluded because a HITL or follow-on step
may still read the blobs. A document parked in one of those states is never
deleted, at any age.

### How it works

A NestJS `@Cron` service ([`DocumentRetentionService`](../../apps/backend-services/src/retention/retention.service.ts))
runs **every 6 hours** (`0 */6 * * *`) and processes up to 500 documents per
run, under the `deleteExpiredDocuments` lock (see
[Running on more than one replica](#running-on-more-than-one-replica)).
Each run:

1. Reads `DOCUMENT_RETENTION_DAYS`. If it is absent or not a positive integer,
   logs a warning and returns without querying anything.
2. Queries eligible documents ordered by `created_at` ascending, selecting only
   `id` and `group_id` (`DocumentDbService.findExpiredDocuments`).
3. For each document, in this order:
   - `blobStorage.deleteByPrefix({group}/ocr/{docId}/)`
   - `DocumentDbService.deleteDocument(id)` — committed on its own, straight
     after the blob delete, not in the lock transaction
4. Records a `document_retention_run` audit event (see [Audit](#audit)).
5. Logs a run summary with the candidate, deleted and error counts.

Per-document failures are logged and isolated — the rest of the batch still
runs, and the failed document is retried on the next run. Both steps are
idempotent: `deleteByPrefix` succeeds when no blobs match, and `deleteDocument`
treats Prisma `P2025` (record not found) as a non-error.

**Blobs are deleted before the row.** If the row delete then fails, the document
survives with files that no longer exist, and the next run finishes the job. The
reverse order would orphan the blobs permanently, because the row carrying their
paths would already be gone.

## Audit-event janitor

Controlled by `AUDIT_EVENT_RETENTION_DAYS`. Deletes `audit_events` rows whose
`occurred_at` is older than the configured window.

Runs **daily at 02:15**, in batches (see [How the database-only janitors
batch](#how-the-database-only-janitors-batch)). The `occurred_at` index makes
the eligibility query efficient.

Audit rows are written on reads as well as writes — `document_list_accessed`
and `document_accessed` fire on every list-page load and document fetch — so
this table grows with traffic, not only with uploads.

> **Note:** Audit data may be subject to statutory minimum retention. Confirm
> compliance requirements before setting this variable in a regulated environment.

## Benchmark audit-log janitor

Controlled by `BENCHMARK_AUDIT_LOG_RETENTION_DAYS`. Deletes `benchmark_audit_logs`
rows whose `timestamp` is older than the configured window.

Runs **daily at 02:30**, in batches.

## Review-session janitor

Controlled by `REVIEW_SESSION_RETENTION_DAYS`. Deletes `review_sessions` whose
`completed_at` is older than the configured window, when both hold:

1. The session status is `approved` or `abandoned`. `in_progress` sessions are
   still open, and `flagged` sessions are escalations that still need action;
   neither is deleted at any age.
2. The session's document has finished processing (`complete`, `failed` or
   `conversion_failed`).

Deletion cascades to `field_corrections` and `document_locks`.
`field_corrections` holds each edit a reviewer made to an extracted field, and
three features read it live: confusion profiles
([`confusion-profile.service.ts`](../../apps/backend-services/src/confusion-profile/confusion-profile.service.ts)),
HITL aggregation
([`hitl-aggregation.service.ts`](../../apps/backend-services/src/hitl/hitl-aggregation.service.ts))
and format suggestions
([`format-suggestion.service.ts`](../../apps/backend-services/src/template-model/format-suggestion.service.ts)).
Corrections this janitor deletes stop contributing to them. Benchmark datasets
built from HITL sessions are unaffected, because the dataset builder copies the
corrected values into ground-truth files.

The document janitor removes the same rows when it deletes the parent document,
so this janitor only deletes anything earlier when its window is shorter than
`DOCUMENT_RETENTION_DAYS`, or when document retention is off.

Runs **daily at 02:45**, in batches.

## How the database-only janitors batch

The audit-event, benchmark audit-log and review-session janitors each delete in
batches of 2,000 rows: find up to 2,000 eligible IDs, then delete exactly those.
A run keeps taking batches until one deletes nothing or the run has spent 5
minutes. The cutoff date is fixed at the start of the run.

The 5-minute budget bounds how much one run writes to the database's
write-ahead log (WAL), which the backup repository archives. A large backlog —
for example the first run after a variable is set on a long-lived environment —
drains over several nights rather than in one burst.

A run executes on one replica at a time (see [Running on more than one
replica](#running-on-more-than-one-replica)). Its batches run inside the lock
transaction, so they commit together when the run ends; a run that fails part
way through deletes nothing and the next run starts again from the oldest rows.

The run log reports `deleted`, `batches` and `timeBudgetReached`. A run that
reaches the budget night after night means rows are arriving faster than one
5-minute run a day can delete them.

## Running on more than one replica

The janitors are `@Cron` methods in the backend API, so every backend replica
schedules every job at the same moment. Each job body runs inside
`RetentionDbService.runWithDatabaseLock(label, fn)`
([`retention-db.service.ts`](../../apps/backend-services/src/retention/retention-db.service.ts)),
which:

1. Opens a Prisma transaction with a **15-minute** timeout.
2. Calls `pg_try_advisory_xact_lock(hashtext(label))`. This Postgres advisory
   lock is held by the transaction and released when it commits or rolls back.
3. If the lock is already held, logs
   `[<label> Cron] Already running on another container. Skipping.` and
   returns without running the job.
4. Otherwise runs the job, passing it the lock transaction.

The lock label is the job's method name: `deleteExpiredDocuments`,
`deleteExpiredAuditEvents`, `deleteExpiredBenchmarkAuditLogs`,
`deleteExpiredReviewSessions`, and `purgeEphemeralDocuments` for
[ephemeral cleanup](./EPHEMERAL_DOCUMENT_CLEANUP.md).

What runs inside the lock transaction differs by job:

| Job | Uses the lock transaction for | Why |
|-----|-------------------------------|-----|
| Document retention | Nothing; row deletes use the ordinary client | Each row delete follows an irreversible blob delete, so it must commit immediately. If it waited for the batch, a rollback would keep rows whose files are gone. |
| Audit-event, benchmark-log, review-session janitors | Every batch's `deleteMany` and the run's audit event | Database-only work; a run's deletes and its audit event commit or roll back together. |
| Ephemeral cleanup | Nothing | Every step is an external call or an idempotent stamp. |

The 15-minute timeout exists because Prisma's default for an interactive
transaction is 5 seconds. A document-retention batch spends most of its time in
blob-storage calls and routinely takes longer than that. If a run does exceed
15 minutes, the transaction rolls back and the lock is released: document
deletes already made are kept, and a database-only janitor's deletes are undone
and retried on its next run. The database-only janitors stop themselves after 5
minutes (see [How the database-only janitors batch](#how-the-database-only-janitors-batch)),
well inside that limit.

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
`documents` table each run (every 6 hours) performs a sequential scan.

## Enabling it

All four variables reach a deployed backend through the overlay generator:

1. Each variable's repository secret supplies the value to
   `.github/workflows/deploy-instance.yml`.
2. The workflow passes it to `generate_instance_overlay` via the corresponding
   `--*-retention-days` flag.
3. The generator substitutes the `__*_RETENTION_DAYS__` placeholder in the
   instance-template overlay, which patches `backend-services-config`.

With the secret unset the token resolves to an empty string and the janitor
stays off. Setting the value in `components/prod-resources` does **not** work —
the instance-template ConfigMap patch applies after components and overwrites it.

Variable reference: [ENVIRONMENT_CONFIGURATION.md](../operations/ENVIRONMENT_CONFIGURATION.md#retention).

## Audit

Each janitor records **one audit event per run**, not one per deleted row. The
event types are listed in [AUDIT.md](./AUDIT.md#retention-janitors). All of
them use `actor_id: "retention_system"` and `resource_id: ""`.

| event_type | Recorded when | Payload | Transaction |
|------------|---------------|---------|-------------|
| `document_retention_run` | The run found at least one eligible document | `documentIds`, `daysRemoved`, `quantity` | None (written after the batch, so an audit failure cannot undo deletes) |
| `audit_events_retention_run` | Every run that acquired the lock | `daysRemoved` | Lock transaction |
| `benchmark_audit_logs_retention_run` | Every run that acquired the lock | `daysRemoved` | Lock transaction |
| `review_session_retention_run` | Every run that acquired the lock | `daysRemoved` | Lock transaction |

How to read these events:

- `daysRemoved` is the raw value of the job's `*_RETENTION_DAYS` variable, i.e.
  the retention window, not a count. It is absent when the variable is unset.
- `document_retention_run.documentIds` lists **every candidate** in the batch,
  including documents whose deletion failed and that will be retried. `quantity`
  is the number actually deleted. No event is written when the variable is
  unset, the query fails, or nothing is eligible.
- The three database-only events are written on every scheduled run that
  acquired the lock, **including runs that did nothing** because the variable is
  unset or invalid, and runs whose delete failed. They do not carry a deleted
  count. The count is only in the application log's run summary.
- `actor_id` is the string `retention_system`. [AUDIT.md](./AUDIT.md) describes
  `null` as the convention for system-initiated actions; to find these events,
  filter on `event_type`, not `actor_id`.

The user-initiated `DELETE /api/documents/:id` path, which removes the same rows,
records a per-document event. See
[TRANSACTION_AND_AUDIT_AUDIT.md](./TRANSACTION_AND_AUDIT_AUDIT.md).
