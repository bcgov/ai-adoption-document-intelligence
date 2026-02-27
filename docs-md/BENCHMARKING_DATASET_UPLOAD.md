# Benchmarking: Dataset Version Lifecycle

## Overview

Dataset versions follow an explicit create-then-upload lifecycle. Users first create an empty draft version, then upload files to it incrementally. Versions can be validated, published, archived, or deleted.

## Constraints

- **Unique Repository URL**: Each dataset must have a unique `repositoryUrl`. Attempting to create a second dataset with the same repository URL returns HTTP 409 Conflict with a message identifying the existing dataset. This is enforced at both the service level and the database level (unique constraint on the `datasets.repositoryUrl` column).
- **Deletion Protection**: Versions referenced by benchmark definitions cannot be deleted. Delete the definitions first.
- **File Uploads Only on Drafts**: Files can only be uploaded to or removed from versions in `draft` status.

## Version States

| Status | Description |
|--------|-------------|
| `draft` | Mutable. Files can be uploaded or removed. Can be validated, published, or deleted. |
| `published` | Immutable. Can be used in benchmark definitions and runs. Can be archived. |
| `archived` | Frozen. Retained for historical reference, but not shown by default. |

## Flow

### 1. Create a Draft Version

User clicks "New Version" on the Dataset Detail page. The frontend calls `POST /api/benchmark/datasets/:id/versions` to create an empty draft:
- A `DatasetVersion` record is created with `gitRevision: null`, `documentCount: 0`, `status: draft`.
- The version label is auto-generated (`v1`, `v2`, ...) unless the user provides one.

### 2. Upload Files to the Draft

The upload dialog opens automatically after version creation. User drags files and submits:
- Frontend sends `POST /api/benchmark/datasets/:id/versions/:versionId/upload` with `multipart/form-data`.
- Backend verifies the version is in `draft` status.
- For **local repos**: files are written directly into the repository directory.
- For **remote repos**: the repo is cloned to a temp directory, files are written, committed, and pushed.
- If the version already has a `gitRevision` (i.e., previous uploads exist), the existing commit is checked out first and new files are appended.
- Files are categorized as **inputs** or **ground truth** based on MIME type.
- A `dataset-manifest.json` is created/updated with sample groupings.
- The version record is updated with the new `gitRevision` (commit SHA) and `documentCount`.

### 3. Remove Files from a Draft

User clicks "Delete" on a sample row in the sample preview. The frontend calls:
- `DELETE /api/benchmark/datasets/:id/versions/:versionId/samples/:sampleId`
- Backend removes the sample's files from the git repo, updates the manifest, commits, and updates the version record.
- Split references to the removed sample are automatically cleaned up.

### 4. Validate

User selects "Validate" from the version actions dropdown:
- Checks that the manifest is well-formed and all referenced files exist.
- Returns a validation report with any warnings or errors.
- Validation is informational and does not block publishing.

### 5. Publish

User selects "Publish" from the version actions dropdown:
- Requires the version to have files uploaded (`gitRevision` must not be null).
- Sets `status: published` and records `publishedAt` timestamp.
- Published versions are immutable — no more file changes.

### 6. Delete a Version

User selects "Delete Version" from the version actions dropdown (draft versions only in the UI):
- Backend checks for referencing `BenchmarkDefinition` records. If any exist, returns HTTP 409 Conflict listing the definition names.
- Deletes associated splits, then the version record.

## API Endpoints

### `POST /api/benchmark/datasets/:id/versions`

Creates an empty draft version.

**Request body (optional):**
```json
{
  "version": "v1",
  "groundTruthSchema": { "type": "object" }
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "datasetId": "uuid",
  "version": "v1",
  "gitRevision": null,
  "status": "draft",
  "documentCount": 0,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### `POST /api/benchmark/datasets/:id/versions/:versionId/upload`

Uploads files to a draft version.

**Request:** `multipart/form-data` with `files` field (max 50 files, 100MB each)

**Response (200):**
```json
{
  "datasetId": "uuid",
  "uploadedFiles": [
    {
      "filename": "sample-001.pdf",
      "path": "inputs/sample-001.pdf",
      "size": 1024,
      "mimeType": "application/pdf"
    }
  ],
  "manifestUpdated": true,
  "totalFiles": 3,
  "version": {
    "id": "uuid",
    "version": "v1",
    "gitRevision": "abc123def456",
    "status": "draft",
    "documentCount": 2
  }
}
```

### `DELETE /api/benchmark/datasets/:id/versions/:versionId`

Deletes a version. Returns 204 No Content on success, 409 Conflict if referenced by definitions.

### `DELETE /api/benchmark/datasets/:id/versions/:versionId/samples/:sampleId`

Removes a sample from a draft version. Returns 204 No Content.

## Splits are Optional for Benchmark Runs

When creating a benchmark definition, a split is no longer required. If no split is selected, the benchmark run processes all samples in the dataset version. In the Temporal workflow, if `sampleIds` is provided (from a split), only those samples are processed; otherwise all samples in the manifest are used.

## File Categorization

Files are categorized by MIME type:

| Category | MIME Types |
|----------|-----------|
| Ground Truth | `application/json`, `text/csv`, `text/xml`, `application/xml` |
| Input | Everything else (images, PDFs, etc.) |

## Sample Grouping

Files are grouped into samples by extracting a sample ID from the filename. The sample ID is the filename without its extension and any `_gt` suffix. For example:
- `sample-001.pdf` → sample ID: `sample-001`
- `sample-001_gt.json` → sample ID: `sample-001`

## Key Files

- Backend service: `apps/backend-services/src/benchmark/dataset.service.ts` (`createVersion`, `uploadFilesToVersion`, `deleteSample`, `deleteVersion`)
- Backend controller: `apps/backend-services/src/benchmark/dataset.controller.ts`
- Response DTOs: `apps/backend-services/src/benchmark/dto/`
- DVC service: `apps/backend-services/src/benchmark/dvc.service.ts`
- Frontend page: `apps/frontend/src/features/benchmarking/pages/DatasetDetailPage.tsx`
- Frontend hooks: `apps/frontend/src/features/benchmarking/hooks/useDatasetVersions.ts`, `useDatasetUpload.ts`
- Unit tests: `apps/backend-services/src/benchmark/dataset.service.spec.ts`, `dataset.controller.spec.ts`
- Temporal workflow: `apps/temporal/src/benchmark-workflow.ts`
- E2E tests: `tests/e2e/benchmarking/dataset-upload-version.spec.ts`
