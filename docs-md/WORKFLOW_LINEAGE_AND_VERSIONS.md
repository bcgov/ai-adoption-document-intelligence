# Workflow lineage and immutable versions

## Model

- **`WorkflowLineage`**: stable identity (name, group, owner). Field `head_version_id` points at the default **head** version for new work (editor default, optional “revert head” without changing benchmark pins).
- **`WorkflowVersion`**: one row per config snapshot; `version_number` increments per lineage. **Config is never updated in place**—editing appends a new row.

## API (backend)

- `GET /api/workflows` — lineages with **head** config (`WorkflowInfo` includes `id` = lineage, `workflowVersionId` = head row).
- `GET /api/workflows/:lineageId` — same, by lineage id.
- `PUT /api/workflows/:lineageId` — metadata and/or new config; config change **appends** a version and updates head.
- `GET /api/workflows/:lineageId/versions` — version history (newest first).
- `POST /api/workflows/:lineageId/revert-head` — body `{ "workflowVersionId": "..." }` sets **head only** (does not change benchmark definition pins).

## Benchmarking

- **`BenchmarkDefinition.workflowVersionId`** pins the graph used for runs until the user changes it (revert = pick an older `WorkflowVersion.id`).
- Create/update definition DTOs use **`workflowVersionId`**, not lineage id.

## Documents & OCR

- `documents.workflow_config_id` stores a **`WorkflowVersion.id`** (column name unchanged). `documents.workflow_id` stores the **`WorkflowLineage.id`** when known.
- **`POST /api/upload`**: accepts `workflow_config_id` and/or deprecated `workflow_id` as either a **lineage id** or a **version id**; the server resolves to lineage + version before insert so the FK is always valid.

## Migration

- Migration `20260324120000_workflow_lineage_and_versions` maps each old `workflows` row to a lineage (same id) plus `wv_<lineageId>` as version 1, repoints FKs, then drops `workflows`.
