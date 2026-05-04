# US-006: Automated Orphan Classifier Cleanup Cron Job

## Summary
As a system operator, I want a scheduled cron job to automatically remove Azure DI classifier models and their blob storage files that have no corresponding database record so that orphaned resources from failed or development operations are cleaned up without manual intervention.

## Actors
- System (automated, no external input)

## Main Flow
1. At startup, the cron job checks the `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` environment variable. If `false` (default), logs a debug message and does not schedule the job.
2. If enabled, the cron job is scheduled to run weekly (e.g., every Sunday at midnight UTC).
3. On each run:
   a. Calls `listAzureClassifiers()` to retrieve all classifier model IDs currently registered in Azure DI.
   b. For each Azure DI classifier:
      - Parses `{groupId}` and `{classifierName}` from the model ID (format: `{groupId}__{classifierName}`). If the name does not match this pattern, logs a warning and skips.
      - Queries the DB for a `ClassifierModel` record matching the parsed `name` and `group_id`.
      - If a matching DB record exists: skips (not an orphan).
      - If no matching DB record exists (orphan):
        1. Deletes the Azure DI model via the Azure DI API.
        2. Removes all files under `{groupId}/classification/{classifierName}/` in Azure Blob Storage.
        3. Removes all files under `{groupId}/classification/{classifierName}/` in primary blob storage.
        4. Logs the deletion (groupId, classifierName, timestamp).
   c. Logs a summary: total found, total orphaned, total deleted, total errors.

## Acceptance Criteria
- `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` env var defaults to `false`; when `false`, the cron job does not run and logs a debug message at startup.
- When enabled, the job runs weekly on the configured schedule.
- Orphaned classifiers (Azure DI model exists, no DB record) are fully cleaned up: Azure DI model deleted, Azure Blob Storage files removed, primary blob storage files removed.
- Non-orphaned classifiers (DB record exists) are skipped.
- Azure DI classifier names not matching `{groupId}__{classifierName}` pattern are skipped with a warning log.
- Individual failures (e.g., a single Azure DI delete fails) do not stop the rest of the cleanup run.
- All errors are logged with groupId, classifierName, and error message.
- Summary log is produced at the end of each run.
- The cron job never throws an unhandled exception.
- `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` is documented in the local dev secrets documentation.
- Unit tests cover: disabled state, orphan detection and cleanup, non-orphan skip, malformed name skip, individual error isolation.

## Notes
- All classifiers in the Azure DI resource are assumed to belong to this application; no external classifiers share the resource.
- This job runs server-side with no external input — no authorization check is required.
- Idempotency: if an Azure resource is already missing during cleanup, log a warning and continue.
