# Benchmarking: Dataset Upload & Auto-Version Creation

## Overview

When files are uploaded to a dataset, the system automatically persists them to the dataset's git repository and creates a new `DatasetVersion` record. This eliminates the need for a separate "Create Version" step after uploading files.

## Flow

1. User selects files in the upload dialog on the Dataset Detail page
2. Frontend sends `POST /api/benchmark/datasets/:id/upload` with `multipart/form-data`
3. Backend determines if the dataset repository is local or remote:
   - **Local repos** (paths like `/tmp/my-dataset` or `~/datasets/repo`): files are written directly into the repository directory
   - **Remote repos** (HTTP/HTTPS/SSH URLs): the repository is cloned to a temp directory, files are written, committed, and pushed back to origin; temp directory is cleaned up
4. Files are categorized as **inputs** or **ground truth** based on file type (JSON/CSV/XML → ground truth; everything else → input)
5. A `dataset-manifest.json` is created/updated with sample groupings
6. Changes are committed to git via `git add -A && git commit`
7. A `DatasetVersion` record is created with:
   - Auto-incremented label: `v1`, `v2`, `v3`, etc.
   - Git revision (commit SHA) pointing to the uploaded files
   - Status: `draft`
   - Document count from the manifest
8. Frontend receives the response including version info and auto-refreshes the versions table

## API

### `POST /api/benchmark/datasets/:id/upload`

**Request:** `multipart/form-data` with `files` field (max 50 files, 50MB each)

**Response:**
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

- Backend service: `apps/backend-services/src/benchmark/dataset.service.ts` (`uploadFiles`)
- Backend controller: `apps/backend-services/src/benchmark/dataset.controller.ts`
- Response DTO: `apps/backend-services/src/benchmark/dto/upload-response.dto.ts`
- DVC service: `apps/backend-services/src/benchmark/dvc.service.ts`
- Frontend hook: `apps/frontend/src/features/benchmarking/hooks/useDatasetUpload.ts`
- Unit tests: `apps/backend-services/src/benchmark/dataset.service.spec.ts`
- E2E tests: `tests/e2e/benchmarking/dataset-upload-version.spec.ts`
