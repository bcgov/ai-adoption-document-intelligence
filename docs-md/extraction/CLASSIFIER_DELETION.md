# Classifier Deletion

## Overview

Classifiers can be deleted by group admins (for their own group) or system admins (any group). Deletion is a hard delete — no `deleted_at` column is used.

## API Endpoint

### `DELETE /api/azure/classifiers/:groupId/:classifierName`

**Authorization**: Group Admin or System Admin (enforced via `@Identity({ groupPermissions: { groupIdFrom: { param: 'groupId' }, requiredPermissions: [Permission.CLASSIFIER_DELETE] } })`)

**Responses**:
- `200 OK` — Classifier successfully deleted.
- `403 Forbidden` — Actor lacks permission.
- `404 Not Found` — Classifier record does not exist.
- `409 Conflict` — Classifier is referenced by one or more workflow versions. Response body:
  ```json
  {
    "conflictingWorkflows": [
      { "id": "string", "name": "string" }
    ]
  }
  ```

## Deletion Sequence

1. **Authorization check** — enforced by `@Identity` decorator (group admin scoped to matching group, or system admin).
2. **Existence check** — returns `404` if the `ClassifierModel` record does not exist.
3. **Workflow usage check** — queries all `WorkflowVersion` rows for the same group and walks each version's `config` JSON for an exact `classifierName` property match. Returns `409` with conflicting workflow names/IDs if any are found.
4. **Delete DB record** — hard-deletes the `ClassifierModel` row *first*, before touching external resources. This makes the classifier immediately disappear from the user's perspective and guarantees a stale `READY` row can never be left pointing at nothing. All subsequent external-resource deletions are best-effort; any leftovers are collected by the orphan cleanup job.
5. **Cancel training (if applicable)** — if `status = TRAINING`, attempts to DELETE the Azure DI classifier model (which cancels training). Logs a warning if this fails but continues.
6. **Delete Azure DI model** — only for `READY` or `FAILED` classifiers: calls `listAzureClassifiers()` to check existence, deletes if found, logs a warning and skips if absent. `PRETRAINING` classifiers are skipped entirely (never submitted to Azure DI), and `TRAINING` classifiers were already deleted in step 5.
7. **Delete Azure Blob Storage files** — removes all files under `{groupId}/classification/{classifierName}/`. Logs warnings for failures but continues.
8. **Delete primary blob storage files** — removes all files under the same `{groupId}/classification/{classifierName}/` prefix in the primary blob store (MinIO in local/dev; may be the same Azure storage depending on deployment). Logs warnings for failures but continues.

## Internal Service Method: `listAzureClassifiers()`

`ClassifierService.listAzureClassifiers()` is an internal method (not exposed as an API endpoint) that retrieves all classifier model IDs currently registered in Azure Document Intelligence.

Used by:
- The manual deletion path (step 6 above) to check whether an Azure DI model exists before attempting deletion.
- The orphan cleanup cron job (`ClassifierOrphanCleanupService`, weekly, enabled via `ENABLE_CLASSIFIER_ORPHAN_CLEANUP=true`) as the authoritative source of what exists in Azure. This job removes Azure DI models and blob files that have no corresponding database record — the safety net for best-effort external cleanup during deletion.

## Workflow Usage Check

`ClassifierDbService.findWorkflowVersionsReferencingClassifier(classifierName, groupId)` queries all `WorkflowVersion` rows for the group, recursively walks each version's `config` JSON looking for a `classifierName` property whose value exactly matches the classifier name (avoiding false positives from substring matches against descriptions, labels, or superstring names), and returns unique `{ id, name }` pairs from the parent `WorkflowLineage`. Cross-group checks are not required since classifiers are scoped to a single group.
