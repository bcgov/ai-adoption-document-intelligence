# US-016: Implement Blob Storage Service with Local Filesystem Backend

**As a** developer,
**I want to** have a blob storage abstraction layer with a local filesystem implementation,
**So that** workflow activities can read and write file data via blob keys instead of passing base64-encoded data through Temporal, keeping workflow history bounded and supporting large documents.

## Acceptance Criteria
- [ ] **Scenario 1**: BlobStorageService interface is defined
    - **Given** the storage interface specification in Section 13.3
    - **When** the interface is reviewed
    - **Then** it includes `write(key, data)`, `read(key)`, `exists(key)`, and `delete(key)` methods returning Promises

- [ ] **Scenario 2**: LocalBlobStorageService writes files
    - **Given** a `LocalBlobStorageService` with `basePath: "./data/blobs"`
    - **When** `write("documents/doc-123/original.pdf", buffer)` is called
    - **Then** the file is written to `./data/blobs/documents/doc-123/original.pdf`, creating intermediate directories as needed

- [ ] **Scenario 3**: LocalBlobStorageService reads files
    - **Given** a file exists at the expected path
    - **When** `read("documents/doc-123/original.pdf")` is called
    - **Then** the file contents are returned as a Buffer

- [ ] **Scenario 4**: LocalBlobStorageService checks existence
    - **Given** a blob key
    - **When** `exists(key)` is called
    - **Then** it returns `true` if the file exists, `false` otherwise

- [ ] **Scenario 5**: LocalBlobStorageService deletes files
    - **Given** a file exists at the expected path
    - **When** `delete(key)` is called
    - **Then** the file is removed from the filesystem

- [ ] **Scenario 6**: Read of non-existent key throws an error
    - **Given** a blob key that does not correspond to an existing file
    - **When** `read(key)` is called
    - **Then** a descriptive error is thrown

- [ ] **Scenario 7**: Segment storage follows naming convention
    - **Given** a document split creates segments
    - **When** segments are stored
    - **Then** they follow the pattern `documents/{documentId}/segments/segment-{NNN}-pages-{start}-{end}.pdf`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/backend-services/src/blob-storage/blob-storage.service.ts` (interface) and `apps/backend-services/src/blob-storage/local-blob-storage.service.ts` (implementation)
- Only the local filesystem implementation is required now; the interface should support future migration to cloud storage (Azure Blob, S3) but only local is implemented
- The `storageBackend` field in `BlobReference` is always `"local"` for now
- Per Section 13.1, this replaces the current pattern of passing base64-encoded data through Temporal workflow input
- Segment storage naming convention in Section 13.5
- Tests should cover all CRUD operations and error cases
