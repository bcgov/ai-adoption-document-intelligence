# Classifier Deletion

## Overview

Classifiers can be deleted by group admins (for their own group) or system admins (any group). Deletion is a hard delete — no `deleted_at` column is used.

## API Endpoint

### `DELETE /api/azure/classifiers/:groupId/:classifierName`

**Authorization**: Group Admin or System Admin (enforced via `@Identity({ minimumRole: GroupRole.ADMIN, groupIdFrom: { param: 'groupId' } })`)

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
3. **Workflow usage check** — queries all `WorkflowVersion` rows for the same group, searches their `config` JSON for the classifier name. Returns `409` with conflicting workflow names/IDs if any are found.
4. **Cancel training (if applicable)** — if `status = TRAINING`, attempts to DELETE the Azure DI classifier model (which cancels training). Logs a warning if this fails but continues.
5. **Delete Azure DI model** — calls `listAzureClassifiers()` to check existence. Deletes if found; logs a warning and skips if absent.
6. **Delete Azure Blob Storage files** — removes all files under `{groupId}/classification/{classifierName}/`. Logs warnings for failures but continues.
7. **Delete primary blob storage files** — removes all files under `{groupId}/classification/{classifierName}/` in MinIO. Logs warnings for failures but continues.
8. **Delete DB record** — hard-deletes the `ClassifierModel` row.

## Internal Service Method: `listAzureClassifiers()`

`ClassifierService.listAzureClassifiers()` is an internal method (not exposed as an API endpoint) that retrieves all classifier model IDs currently registered in Azure Document Intelligence.

Used by:
- The manual deletion path (step 5 above) to check whether an Azure DI model exists before attempting deletion.
- The orphan cleanup cron job (Phase 3) as the authoritative source of what exists in Azure.

## Workflow Usage Check

`ClassifierDbService.findWorkflowVersionsReferencingClassifier(classifierName, groupId)` queries all `WorkflowVersion` rows for the group, checks if the config JSON string contains the classifier name, and returns unique `{ id, name }` pairs from the parent `WorkflowLineage`. Cross-group checks are not required since classifiers are scoped to a single group.
