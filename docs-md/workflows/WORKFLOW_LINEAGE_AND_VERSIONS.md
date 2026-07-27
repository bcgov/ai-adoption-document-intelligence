# Workflow lineage and immutable versions

## Model

- **`WorkflowLineage`**: stable identity (name, group, owner). Field `head_version_id` points at the default **head** version for new work (editor default, optional “revert head” without changing benchmark pins).
- **`WorkflowVersion`**: one row per config snapshot; `version_number` increments per lineage. **Config is never updated in place**—editing appends a new row.

## API (backend)

- `GET /api/workflows` — lineages with **head** config (`WorkflowInfo` includes `id` = lineage, `workflowVersionId` = head row).
- `GET /api/workflows/:lineageId` — same, by lineage id.
- `PUT /api/workflows/:lineageId` — metadata and/or new config; config change **appends** a version and updates head. **Requires `expectedVersion`** (see below).
- `GET /api/workflows/:lineageId/versions` — version history (newest first).
- `GET /api/workflows/:lineageId/delete-impact` — pre-flight: what a delete would take with it (see below).
- `POST /api/workflows/:lineageId/revert-head` — body `{ "workflowVersionId": "..." }` sets **head only** (does not change benchmark definition pins).

## Concurrent edits (G-063)

`PUT` bodies MUST carry `expectedVersion`: the `version` the edits were based
on, as returned by `GET`. If the lineage's head has moved on since, the write
is refused with **409** and a `workflow_version_conflict` body naming both
versions:

```json
{
  "error": "workflow_version_conflict",
  "message": "This workflow was saved by someone else (version 4). Reload to see their changes before saving yours.",
  "expectedVersion": 3,
  "currentVersion": 4
}
```

Without this, two editors that both loaded version N would each append a
version and the second write would silently become the head, carrying none of
the first author's edits. Nothing was corrupted — version N+1 is still in
history — but the head was wrong and neither author was told.

The token is **required, not optional**: an optional one is only honoured by
callers who already thought about concurrency, which are exactly the callers
who did not need it. Requiring it forces every writer through read-then-write.

The check runs twice — once on entry as an early exit, and again inside the
append transaction, which is the one that decides (the head can move between
the two).

## Deleting a lineage (G-050)

`WorkflowVersion.lineage` is `onDelete: Cascade`, so deleting a lineage deletes
every version under it. What each pinning relation does about that differs, and
only one of them is silent:

| Pins a version | On lineage delete |
|---|---|
| `BenchmarkDefinition.workflowVersionId` | `Restrict` — the delete fails (409) |
| `DatasetGroundTruthJob.workflowVersionId` | `Restrict` — the delete fails (409) |
| a `childWorkflow` library reference | blocked by the library-reference guard (G-019) |
| `Document.workflow_config_id` | **`SetNull`** — the link is erased, no error |

The document case is the one worth knowing about: the documents themselves are
untouched, but the record of **which graph version produced each one** is gone,
and cannot be reconstructed afterwards.

`GET /api/workflows/:lineageId/delete-impact` returns
`{ versionCount, documentCount }` so a confirmation can name that cost before
the author commits. It never blocks — a workflow that has processed documents
has to stay deletable. The same counts are written into the
`workflow_deleted` audit payload (`version_count`, `detached_document_count`),
so the loss stays attributable even when the caller skipped the pre-flight.

## Benchmarking

- **`BenchmarkDefinition.workflowVersionId`** pins the graph used for runs until the user changes it (revert = pick an older `WorkflowVersion.id`).
- Create/update definition DTOs use **`workflowVersionId`**, not lineage id.

## Documents & OCR

- `documents.workflow_config_id` stores a **`WorkflowVersion.id`** (column name unchanged). `documents.workflow_id` stores the **`WorkflowLineage.id`** when known.
- **`POST /api/upload`**: accepts `workflow_config_id` and/or deprecated `workflow_id` as either a **lineage id** or a **version id**; the server resolves to lineage + version before insert so the FK is always valid.

## Migration

- Migration `20260324120000_workflow_lineage_and_versions` maps each old `workflows` row to a lineage (same id) plus `wv_<lineageId>` as version 1, repoints FKs, then drops `workflows`.
