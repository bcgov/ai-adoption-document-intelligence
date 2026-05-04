# Feature: Classifier Deletion

## Overview

Provide two complementary mechanisms to remove classifiers and their associated training data from the system:

1. **Manual deletion via the UI** — for classifiers that still have a database record, initiated by a group admin or system admin.
2. **Automated orphan cleanup via a scheduled cron job** — for Azure Document Intelligence classifier models that have no corresponding database record (orphaned during development or failed operations).

In both cases, all training-related files stored for the classifier must be removed.

---

## Background & Context

- Classifiers are stored in three places:
  - The `classifier_model` PostgreSQL table (primary source of truth).
  - Primary blob storage (MinIO / app-level S3-compatible), under the path `{groupId}/classification/{classifierName}/`.
  - Azure Blob Storage (used as the training data source for Azure DI), under the same path pattern.
  - Azure Document Intelligence (the trained classifier model itself), named `{groupId}__{classifierName}`.
- The `ClassifierModel` schema has no `deleted_at` column (unlike `Group`), so deletion will be a **hard delete**.
- Classifiers do not have a formal FK relationship to `WorkflowVersion`. A classifier may be referenced by name within the `config` JSON field of `WorkflowVersion` rows.
- `ClassifierStatus` values: `PRETRAINING`, `FAILED`, `TRAINING`, `READY`.
- The cron-based cleanup is sensitive and must be gated behind an **environment variable** that defaults to `false` (disabled).

---

## Shared Service Capability: List Azure DI Classifiers

A reusable service method must be implemented to list all classifier models currently registered in Azure Document Intelligence. This method is used by both the manual deletion path (to check whether an Azure model actually exists before attempting deletion) and the orphan cleanup cron job (as the authoritative source of what exists in Azure).

- **Method**: `listAzureClassifiers()` on `ClassifierService`.
- Returns the full list of classifier identifiers (Azure DI model IDs) from the Azure DI API.
- Used internally; not exposed as a public API endpoint.

---

## Feature 1: Manual Deletion via UI

### Actors
- **Group Admin**: Can delete classifiers belonging to their own group.
- **System Admin**: Can delete any classifier.

### Entry Point
- A "Delete" button is added to the existing `ClassifierDetails` component.
- The button is only visible to group admins (for that group) and system admins.

### Confirmation Dialog
- Clicking "Delete" opens a modal confirmation dialog.
- The dialog displays the classifier name and a warning about permanent deletion.
- The user must type the word `delete` (case-insensitive) in an input field before the confirmation button becomes enabled.
- Confirming triggers the deletion API call.

### Workflow Usage Check (Backend)
- Before deleting, the backend queries all `WorkflowVersion` rows whose parent `WorkflowLineage` belongs to the same `group_id` as the classifier. Classifiers from one group cannot be used in another group's workflows, so cross-group checks are not required.
- The `config` JSON of each version is inspected for references to the classifier name (by searching for the classifier's name within the config blob).
- If any workflow versions within the group reference the classifier, the deletion is **blocked** and the API returns a `409 Conflict` response listing the names (and IDs) of the affected workflows.
- The UI displays this list to the user with a clear message that they must remove the classifier from those workflows before deletion.

### Deletion Sequence (Backend — Happy Path)
1. **Authorization check**: Verify actor is group admin that matches classifier's group or system admin.
2. **Existence check**: Confirm the `ClassifierModel` record exists; return `404` if not.
3. **Workflow usage check**: Inspect `WorkflowVersion.config` JSON for classifier references; block with `409` if any found.
4. **Cancel training (if applicable)**: If `status = TRAINING`, attempt to cancel the in-progress training operation via the Azure DI API. Log a warning if cancellation fails but continue deletion.
5. **Delete Azure DI model**: Use `listAzureClassifiers()` to check whether the Azure DI model (`{groupId}__{classifierName}`) actually exists. If it does, call the Azure DI delete API. If it is not present in the list, log a warning and skip this step without error.
6. **Delete Azure Blob Storage files**: Remove all files under `{groupId}/classification/{classifierName}/` in Azure Blob Storage. Log warnings for any failures but continue.
7. **Delete primary blob storage files**: Remove all files under `{groupId}/classification/{classifierName}/` in primary blob storage (MinIO). Log warnings for any failures but continue.
8. **Delete DB record**: Hard-delete the `ClassifierModel` row from the database.
9. Return `200 OK` on success.

### API
- **Endpoint**: `DELETE /azure/classifiers/:groupId/:classifierName`
- **Authorization**: Group Admin or System Admin
- **Responses**:
  - `200 OK` — Classifier successfully deleted.
  - `400 Bad Request` — Missing or invalid parameters.
  - `403 Forbidden` — Actor lacks permission.
  - `404 Not Found` — Classifier record does not exist.
  - `409 Conflict` — Classifier is referenced by one or more workflow versions; body includes workflow names/IDs.

---

## Feature 2: Automated Orphan Cleanup (Cron Job)

### Purpose
Remove Azure DI classifier models — and their associated blob storage files — that no longer have a corresponding `ClassifierModel` record in the database. This handles classifiers created during development or partially created in failed operations.

### Feature Gate
- Controlled by an environment variable: `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` (default: `false`).
- If `false`, the cron job must not run and logs a debug message at startup indicating the feature is disabled.

### Schedule
- Runs **weekly** (e.g., every Sunday at midnight UTC).

### Algorithm
1. Call `listAzureClassifiers()` to retrieve all classifier model IDs currently registered in Azure DI. This is the authoritative set of what needs to be considered for cleanup.
2. For each Azure DI classifier returned:
   a. Parse the classifier name. All classifiers are assumed to belong to this application (no external classifiers share the same Azure resource).
   b. Attempt to parse the `{groupId}` from the classifier name (format: `{groupId}__{classifierName}`). If the name does not match this pattern, skip it and log a warning.
   c. Query the DB for a `ClassifierModel` record with the matching `name` and `group_id`.
   d. If a matching DB record exists: skip.
   e. If no matching DB record exists (orphan):
      1. **Delete Azure DI model**: Call Azure DI delete API.
      2. **Delete Azure Blob Storage files**: Remove all files under `{groupId}/classification/{classifierName}/` in Azure Blob Storage.
      3. **Delete primary blob storage files**: Remove all files under `{groupId}/classification/{classifierName}/` in primary blob storage.
      4. Log the deletion (groupId, classifierName, timestamp).
3. Log a summary at the end of each run (total found, total orphaned, total deleted, total errors).

### Error Handling
- Individual failures (e.g., a single Azure DI delete fails) must not stop the rest of the cleanup run.
- All errors must be logged with sufficient detail (groupId, classifierName, error message).
- The cron job should never throw an unhandled exception.

---

## Non-Functional Requirements

- **Logging**: All deletion operations (both manual and automated) must produce structured log entries including `groupId`, `classifierName`, `actorId` (for manual), and timestamp.
- **Idempotency**: Both deletion paths should handle "already deleted" cases gracefully (i.e., if an Azure resource is missing, log a warning and continue rather than throwing).
- **Security**: The manual delete endpoint must enforce role-based authorization. The cron job runs server-side with no external input.
- **Environment parity**: The `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` env var must be documented in the local dev secrets documentation.

---

## Out of Scope
- Soft deletes for classifiers (no `deleted_at` column will be added).
- Deletion of classifier training *label* data or documents used for labeling (only the blob storage training files and the Azure DI model are removed).
- UI for monitoring or reviewing orphaned classifiers.
- Notifying users when their classifier is found orphaned and cleaned up.
