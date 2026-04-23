# US-01: Extend BlobStorageClient with SAS URL Generation

**As a** Temporal Worker,
**I want to** generate a short-lived SAS URL for a blob when running against Azure Blob Storage,
**So that** Azure Document Intelligence can fetch the document directly from storage without the worker downloading and re-encoding the file.

## Acceptance Criteria
- [ ] **Scenario 1**: SAS URL generated on Azure provider
    - **Given** `BLOB_STORAGE_PROVIDER` is set to `azure`
    - **When** `generateSasUrl(key, expiryMinutes)` is called on the `BlobStorageClient`
    - **Then** a read-only SAS URL is returned that is valid for the specified number of minutes

- [ ] **Scenario 2**: Minio provider throws unsupported error
    - **Given** `BLOB_STORAGE_PROVIDER` is `minio` (or unset)
    - **When** `generateSasUrl` is called on the `BlobStorageClient`
    - **Then** an error is thrown with the message `"SAS URLs not supported for Minio storage"`

- [ ] **Scenario 3**: Interface is typed correctly
    - **Given** the `BlobStorageClient` interface in `blob-storage-client.ts`
    - **When** the interface is reviewed
    - **Then** it includes `generateSasUrl(key: BlobFilePath, expiryMinutes: number): Promise<string>`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Add `generateSasUrl` method to the `BlobStorageClient` interface in `apps/temporal/src/blob-storage/blob-storage-client.ts`.
- Azure implementation uses `ContainerClient.getBlockBlobClient(key).generateSasUrl(...)` from `@azure/storage-blob`.
- SAS permissions should be read-only (`r`).
- The Azure storage connection string must grant permission to generate SAS tokens (requires account key, not managed identity SAS).
- Unit tests required for both provider branches.
