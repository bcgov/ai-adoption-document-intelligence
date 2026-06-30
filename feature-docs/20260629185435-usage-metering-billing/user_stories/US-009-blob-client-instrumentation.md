# US-009: BlobStorageClient Instrumentation for Storage Ledger

**As a** billing system,
**I want to** instrument both BlobStorageClient implementations to maintain GroupStorageLedger rows on every write and delete,
**So that** storage usage can be computed as GB-hours without querying Azure directly.

## Acceptance Criteria

- [ ] **Scenario 1**: Backend BlobStorageClient write() inserts a GroupStorageLedger row
    - **Given** a call to `write(key, data)` on the backend `BlobStorageClient` (`apps/backend-services/src/blob-storage/`)
    - **When** the write completes
    - **Then** a `GroupStorageLedger` row is inserted with `blob_key = key`, `group_id` extracted from the first path segment of `key`, `size_bytes = data.byteLength`, `written_at = now()`, and `deleted_at = null`

- [ ] **Scenario 2**: Backend BlobStorageClient delete() and deleteByPrefix() set deleted_at
    - **Given** a call to `delete(key)` or `deleteByPrefix(prefix)` on the backend `BlobStorageClient`
    - **When** the delete completes
    - **Then** `deleted_at = now()` is set on all matching `GroupStorageLedger` rows (single row for `delete`, all prefix-matched rows for `deleteByPrefix`)

- [ ] **Scenario 3**: Temporal worker BlobStorageClient write() inserts a GroupStorageLedger row
    - **Given** a call to `write(key, data)` on the Temporal worker's `BlobStorageClient` (`apps/temporal/src/blob-storage/blob-storage-client.ts`)
    - **When** the write completes
    - **Then** a `GroupStorageLedger` row is inserted with the same fields as Scenario 1

- [ ] **Scenario 4**: Temporal worker BlobStorageClient delete operations set deleted_at
    - **Given** a call to `delete(key)` or `deleteByPrefix(prefix)` on the Temporal worker's `BlobStorageClient`
    - **When** the delete completes
    - **Then** `deleted_at = now()` is set on all matching `GroupStorageLedger` rows

- [ ] **Scenario 5**: Blobs with _shared/ prefix are excluded from the ledger
    - **Given** a blob key that begins with `_shared/`
    - **When** `write()` is called for that key on either client
    - **Then** no `GroupStorageLedger` row is inserted (shared blobs are not attributed to any group)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `groupId` is always the first path segment of the blob key, enforced by `validateBlobFilePath` — extract it with a simple `key.split('/')[0]`
- Both `BlobStorageClient` implementations are separate files and must each be instrumented independently
- Ledger rows are never hard-deleted by the client — only `deleted_at` is set as a tombstone
- The `deleteByPrefix` instrumentation should use a single bulk `UPDATE` query, not row-by-row updates
- If a `write()` call fails (Azure error), the ledger insert should also be skipped — instrument after the Azure call succeeds, not before
