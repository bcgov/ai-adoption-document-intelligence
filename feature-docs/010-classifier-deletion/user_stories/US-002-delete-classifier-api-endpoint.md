# US-002: Delete Classifier API Endpoint

## Summary
As a group admin or system admin, I want a backend API endpoint to delete a classifier and all its associated resources so that classifiers can be fully removed from the system.

## Actors
- Group Admin (for their own group's classifiers)
- System Admin (for any classifier)

## Main Flow
1. Actor calls `DELETE /azure/classifiers/:groupId/:classifierName`.
2. Backend verifies the actor is a group admin for the matching group or a system admin.
3. Backend confirms the `ClassifierModel` record exists in the database.
4. Backend checks for workflow version references (handled in US-003); if blocked, returns `409`.
5. If the classifier status is `TRAINING`, backend attempts to cancel the in-progress Azure DI training operation. Logs a warning if cancellation fails but continues.
6. Backend calls `listAzureClassifiers()` to check whether the Azure DI model `{groupId}__{classifierName}` exists. If present, deletes it via the Azure DI API. If absent, logs a warning and skips.
7. Backend removes all files under `{groupId}/classification/{classifierName}/` in Azure Blob Storage. Logs warnings for any failures but continues.
8. Backend removes all files under `{groupId}/classification/{classifierName}/` in primary blob storage (MinIO). Logs warnings for any failures but continues.
9. Backend hard-deletes the `ClassifierModel` row from the database.
10. Returns `200 OK`.

## Endpoints
- `DELETE /azure/classifiers/:groupId/:classifierName`
  - **Authorization**: Group Admin or System Admin
  - **Responses**:
    - `200 OK` — Classifier successfully deleted.
    - `400 Bad Request` — Missing or invalid parameters.
    - `403 Forbidden` — Actor lacks permission.
    - `404 Not Found` — Classifier record does not exist.
    - `409 Conflict` — Classifier referenced by workflow versions (see US-003).

## Acceptance Criteria
- Endpoint enforces role-based authorization (group admin scoped to matching group, or system admin).
- Returns `404` when the `ClassifierModel` record does not exist.
- Returns `403` when actor lacks permission.
- If status is `TRAINING`, cancellation of Azure training is attempted; failure is logged but does not block deletion.
- Azure DI model is deleted if it exists; absence is logged as a warning, not an error.
- All files under `{groupId}/classification/{classifierName}/` are removed from both Azure Blob Storage and primary blob storage; individual failures are logged but do not block the remaining steps.
- `ClassifierModel` DB record is hard-deleted.
- Returns `200 OK` on success.
- All deletion operations produce structured log entries including `groupId`, `classifierName`, `actorId`, and timestamp.
- Full Swagger/OpenAPI documentation with dedicated DTO classes and specific response decorators.
- Unit tests cover all response paths and deletion steps.

## Notes
- Deletion is a hard delete — no `deleted_at` column is added.
- Idempotency: if an Azure resource is already missing, log a warning and continue rather than throw.
